import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkProfessionalImageFile } from "@/lib/grace";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import {
  optimizePortrait,
  PortraitOptimizationError,
} from "@/lib/images/optimize-portrait";

// Vercel rejects request bodies over 4.5MB, so cap uploads at 4MB.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET_NAME = "staff-photos";

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

    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    const role = formData.get("role") as string | null; // "dean" or "hod"

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 },
      );
    }

    if (!role || !["dean", "hod"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'dean' or 'hod'" },
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

    let optimized;
    try {
      optimized = await optimizePortrait(
        Buffer.from(await file.arrayBuffer()),
      );
    } catch (error) {
      const message =
        error instanceof PortraitOptimizationError
          ? error.message
          : "The image could not be optimized.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const supabase = createAdminClient();
    const filePath = `submissions/${id}/${role}.${optimized.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, optimized.buffer, {
        contentType: optimized.contentType,
        cacheControl: "3600",
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
    const imageUrl = `${urlData.publicUrl}?v=${Date.now()}`;

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
