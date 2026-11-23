import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deleteFile, fileUrl, putFile } from "@/lib/storage";
import { checkProfessionalImage } from "@/lib/grace";
import { canAccessDepartment, requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { aiRateLimitResponse } from "@/lib/rate-limit";
import {
  checkPhotoUpload,
  PHOTO_TOO_LARGE,
  photoRequestTooLarge,
  readUploadForm,
} from "@/lib/images/photo-upload";
import { requireDeleteConfirmation } from "@/lib/archive";

// The photo check calls Gemini, which can take a while.
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/staff/[id]/image - Upload a staff image
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser([
      "PROGRAMME_COORDINATOR",
      "HOD",
      "ADMIN",
      "SUPER_ADMIN",
    ]);
    if (!auth.ok) return auth.response;

    const staff = await prisma.staff.findUnique({
      where: { id },
      select: {
        id: true,
        imageDriveFileId: true,
        surname: true,
        firstName: true,
        departmentId: true,
      },
    });

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (!(await canAccessDepartment(auth.user, staff.departmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (photoRequestTooLarge(request)) {
      return NextResponse.json({ error: PHOTO_TOO_LARGE }, { status: 413 });
    }
    const formData = await readUploadForm(request);
    if (!formData) {
      return NextResponse.json({ error: "The upload couldn't be read." }, { status: 400 });
    }

    // A non-image is refused here, before it costs an AI review.
    const checked = await checkPhotoUpload(formData.get("image"));
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: checked.status });
    }
    const { optimized } = checked.photo;

    // The photo review is an AI call; it's limited per person.
    const limited = await aiRateLimitResponse("imageReview", auth.user.id);
    if (limited) return limited;

    const imageCheck = await checkProfessionalImage(checked.photo);
    if (!imageCheck.ok) {
      return NextResponse.json(
        { error: imageCheck.message },
        { status: imageCheck.status },
      );
    }

    const filePath = `${id}/photo.${optimized.extension}`;

    try {
      await putFile(filePath, optimized.buffer, optimized.contentType);
    } catch (uploadError) {
      console.error("Photo upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const imageUrl = fileUrl(filePath);

    await prisma.staff.update({
      where: { id },
      data: {
        imageUrl,
        imageDriveFileId: filePath, // reusing column to store the storage path
      },
    });

    // A legacy timestamped file can be removed only after the replacement and
    // database update have both succeeded. Existing files are otherwise left alone.
    if (staff.imageDriveFileId && staff.imageDriveFileId !== filePath) {
      try {
        await deleteFile(staff.imageDriveFileId);
      } catch (cleanupError) {
        console.error("Previous staff photo cleanup failed:", cleanupError);
      }
    }

    await recordActivity({
      actorId: auth.user.id,
      action: "STAFF_PHOTO_UPLOADED",
      entityType: "STAFF",
      entityId: id,
      description: `Uploaded a verified photo for ${staff.firstName} ${staff.surname}.`,
      metadata: {
        departmentId: staff.departmentId,
        originalBytes: optimized.originalBytes,
        storedBytes: optimized.storedBytes,
        width: optimized.width,
        height: optimized.height,
      },
    });

    return NextResponse.json({
      imageUrl,
      fileId: filePath,
      optimization: {
        originalBytes: optimized.originalBytes,
        storedBytes: optimized.storedBytes,
        width: optimized.width,
        height: optimized.height,
      },
    });
  } catch (error) {
    console.error("Staff image upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}

// DELETE /api/staff/[id]/image - Remove a staff image
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser([
      "PROGRAMME_COORDINATOR",
      "HOD",
      "ADMIN",
      "SUPER_ADMIN",
    ]);
    if (!auth.ok) return auth.response;

    const staff = await prisma.staff.findUnique({
      where: { id },
      select: { id: true, imageDriveFileId: true, departmentId: true },
    });

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (!(await canAccessDepartment(auth.user, staff.departmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Q7: the person typed DELETE.
    const unconfirmed = await requireDeleteConfirmation(request, "photo");
    if (unconfirmed) return unconfirmed;

    if (staff.imageDriveFileId) {
      try {
        await deleteFile(staff.imageDriveFileId);
      } catch (cleanupError) {
        console.error("Staff photo removal failed:", cleanupError);
      }
    }

    const updated = await prisma.staff.update({
      where: { id },
      data: { imageUrl: null, imageDriveFileId: null },
      select: { firstName: true, surname: true, departmentId: true },
    });

    await recordActivity({
      actorId: auth.user.id,
      action: "STAFF_PHOTO_REMOVED",
      entityType: "STAFF",
      entityId: id,
      description: `Removed the photo for ${updated.firstName} ${updated.surname}.`,
      metadata: { departmentId: updated.departmentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Staff image delete failed:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 },
    );
  }
}
