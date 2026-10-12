import { NextRequest, NextResponse } from "next/server";
import { GRACE_VISION_SPACE_URL } from "@/lib/grace-vision";
import { requireApiUser } from "@/lib/api-auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/image-check
 *
 * Server-side proxy for GRACE's /check-image endpoint.
 * The browser cannot reach the Docker-internal hostname (http://grace:7860),
 * so this route forwards the multipart upload from the client to GRACE and
 * relays the response back.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "A file field containing an image is required." },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, and WebP images are supported." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }

    const upstreamForm = new FormData();
    upstreamForm.append("file", file);

    const res = await fetch(`${GRACE_VISION_SPACE_URL}/check-image`, {
      method: "POST",
      body: upstreamForm,
      signal: AbortSignal.timeout(120_000),
    });

    // Relay the upstream status + body as-is
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Image check proxy error:", error);
    return NextResponse.json(
      {
        error:
          "Could not reach the image review service. Please try again later.",
      },
      { status: 503 },
    );
  }
}
