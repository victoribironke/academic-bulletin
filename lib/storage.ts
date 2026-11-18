import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Photo storage in the Railway bucket (S3-compatible). Railway buckets are
 * private, so the app serves files itself at /api/files/<key> and the Word/PDF
 * exports read them straight from the bucket.
 *
 * Env: STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_BUCKET,
 * STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY.
 */

/** Where the app serves stored files. */
export const FILE_ROUTE_PREFIX = "/api/files/";

const globalForStorage = globalThis as unknown as { storageClient?: S3Client };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function bucket(): string {
  return requireEnv("STORAGE_BUCKET");
}

function client(): S3Client {
  if (!globalForStorage.storageClient) {
    globalForStorage.storageClient = new S3Client({
      endpoint: requireEnv("STORAGE_ENDPOINT"),
      region: process.env.STORAGE_REGION || "auto",
      credentials: {
        accessKeyId: requireEnv("STORAGE_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("STORAGE_SECRET_ACCESS_KEY"),
      },
    });
  }
  return globalForStorage.storageClient;
}

/** Keys are plain relative paths, e.g. "submissions/abc/dean.jpg". */
export function isValidFileKey(key: string): boolean {
  return (
    /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(key) &&
    !key.split("/").some((part) => part === "." || part === "..")
  );
}

/** App URL for a stored file. `version` busts browser caches after a replace. */
export function fileUrl(key: string, version: number = Date.now()): string {
  return `${FILE_ROUTE_PREFIX}${key}?v=${version}`;
}

/** The storage key behind an app file URL, or null for any other URL. */
export function fileKeyFromUrl(url: string): string | null {
  if (!url.startsWith(FILE_ROUTE_PREFIX)) return null;
  const key = decodeURIComponent(url.slice(FILE_ROUTE_PREFIX.length).split(/[?#]/)[0]);
  return isValidFileKey(key) ? key : null;
}

export async function putFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!isValidFileKey(key)) throw new Error(`Invalid file key: ${key}`);
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteFile(key: string): Promise<void> {
  if (!isValidFileKey(key)) return;
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Reads a stored file; null if it doesn't exist. */
export async function getFile(
  key: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (!isValidFileKey(key)) return null;
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!result.Body) return null;
    return {
      data: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType || "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}

/**
 * Loads a photo for the Word/PDF exports from the bucket. Only photos uploaded
 * to the app are loaded; the server never fetches any other address it's
 * given. Null when unavailable.
 */
export async function loadPhoto(
  url?: string | null,
): Promise<{ data: Buffer; contentType: string } | null> {
  const key = url ? fileKeyFromUrl(url) : null;
  if (!key) return null;
  try {
    return await getFile(key);
  } catch {
    return null;
  }
}
