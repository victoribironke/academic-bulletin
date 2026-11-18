import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { getFile, isValidFileKey } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ key: string[] }>;
}

/**
 * GET /api/files/<key> - Serves a stored photo to signed-in users. The
 * Railway bucket is private, so photos are read through the app.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const key = (await params).key.join("/");
  if (!isValidFileKey(key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const file = await getFile(key);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.data.length),
        // URLs carry ?v=<upload time>, so a replaced photo gets a new URL.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Failed to read stored file:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
