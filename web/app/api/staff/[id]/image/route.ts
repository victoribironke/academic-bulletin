import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkProfessionalImageFile } from "@/lib/grace";
import { canAccessDepartment, requireApiUser } from "@/lib/api-auth";

// Vercel rejects request bodies over 4.5MB, so cap uploads at 4MB.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET_NAME = "staff-photos";

// The photo check calls Gemini, which can take a while.
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/staff/[id]/image - Upload a staff image
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
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

    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 4MB." },
        { status: 400 },
      );
    }

    const imageCheck = await checkProfessionalImageFile(file);
    if (!imageCheck.ok) {
      return NextResponse.json(
        { error: imageCheck.message },
        { status: imageCheck.status },
      );
    }

    const supabase = createAdminClient();

    // Delete previous image if exists
    if (staff.imageDriveFileId) {
      await supabase.storage.from(BUCKET_NAME).remove([staff.imageDriveFileId]);
    }

    const ext = file.type.split("/")[1] || "jpg";
    const filePath = `${id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    await prisma.staff.update({
      where: { id },
      data: {
        imageUrl: urlData.publicUrl,
        imageDriveFileId: filePath, // reusing column to store the storage path
      },
    });

    return NextResponse.json({
      imageUrl: urlData.publicUrl,
      fileId: filePath,
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
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
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

    if (staff.imageDriveFileId) {
      const supabase = createAdminClient();
      await supabase.storage.from(BUCKET_NAME).remove([staff.imageDriveFileId]);
    }

    await prisma.staff.update({
      where: { id },
      data: { imageUrl: null, imageDriveFileId: null },
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
