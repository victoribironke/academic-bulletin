import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkProfessionalImageFile } from "@/lib/grace-vision";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET_NAME = "staff-photos";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase env vars not configured");
  }
  return createClient(url, serviceKey);
}

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
        { error: "File too large. Maximum size is 5MB." },
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

    const supabase = getSupabaseAdmin();

    const ext = file.type.split("/")[1] || "jpg";
    const filePath = `submissions/${id}/${role}-${Date.now()}.${ext}`;
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

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (error) {
    console.error("Image upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
