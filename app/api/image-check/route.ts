import { NextRequest, NextResponse } from "next/server";
import { GRACE_VISION_SPACE_URL } from "@/lib/grace-vision";

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
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "A file field containing an image is required." },
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
