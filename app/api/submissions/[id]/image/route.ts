import { NextRequest, NextResponse } from "next/server";
import { fileUrl, putFile } from "@/lib/storage";
import { checkProfessionalImage } from "@/lib/grace";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { aiRateLimitResponse } from "@/lib/rate-limit";
import {
  checkPhotoUpload,
  PHOTO_TOO_LARGE,
  photoRequestTooLarge,
  readUploadForm,
} from "@/lib/images/photo-upload";

// The photo check calls Gemini, which can take a while.
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/submissions/[id]/image - Upload a dean or HOD image
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    if (photoRequestTooLarge(request)) {
      return NextResponse.json({ error: PHOTO_TOO_LARGE }, { status: 413 });
    }
    const formData = await readUploadForm(request);
    if (!formData) {
      return NextResponse.json({ error: "The upload couldn't be read." }, { status: 400 });
    }

    const role = formData.get("role"); // "dean" or "hod"
    if (role !== "dean" && role !== "hod") {
      return NextResponse.json(
        { error: "role must be 'dean' or 'hod'" },
        { status: 400 },
      );
    }

    // A non-image is refused here, before it costs an AI review.
    const checked = await checkPhotoUpload(formData.get("image"));
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: checked.status });
    }
    const { optimized } = checked.photo;

    // The photo review is an AI call; it's limited per person.
    const limited = await aiRateLimitResponse("imageReview", user!.id);
    if (limited) return limited;

    const imageCheck = await checkProfessionalImage(checked.photo);
    if (!imageCheck.ok) {
      return NextResponse.json(
        { error: imageCheck.message },
        { status: imageCheck.status },
      );
    }

    const filePath = `submissions/${id}/${role}.${optimized.extension}`;

    try {
      await putFile(filePath, optimized.buffer, optimized.contentType);
    } catch (uploadError) {
      console.error("Photo upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const imageUrl = fileUrl(filePath);

    return NextResponse.json({
      imageUrl,
      optimization: {
        originalBytes: optimized.originalBytes,
        storedBytes: optimized.storedBytes,
        width: optimized.width,
        height: optimized.height,
      },
    });
  } catch (error) {
    console.error("Image upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
