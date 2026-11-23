/**
 * Copies the stored files (staff and dean photos) from the live site's bucket
 * into the TEST SITE's bucket (work order task A1), so the records copied by
 * copy-live-to-staging.mjs show their photos there too.
 *
 *   SOURCE_STORAGE_FILE=<live bucket file> TARGET_STORAGE_FILE=<test site bucket file> \
 *     node scripts/copy-files-to-staging.mjs [--dry-run]
 *
 * Each file holds one setting per line, as the app's STORAGE_* variables do:
 *   ENDPOINT=...  BUCKET=...  ACCESS_KEY_ID=...  SECRET_ACCESS_KEY=...  REGION=... (optional, default auto)
 *
 * - The live bucket is only listed and read.
 * - Files the test site already has, at the same size, are left alone.
 * - Nothing is ever deleted.
 * - --dry-run lists what would be copied and copies nothing.
 */
import { readFileSync } from "node:fs";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const dryRun = process.argv.includes("--dry-run");

function readSettings(name) {
  const file = process.env[name];
  if (!file) {
    console.error(`Set ${name} to the file holding that bucket's settings.`);
    process.exit(1);
  }
  const settings = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) settings[match[1]] = match[2];
  }
  for (const key of ["ENDPOINT", "BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"]) {
    if (!settings[key]) {
      console.error(`${name}: ${key} is missing.`);
      process.exit(1);
    }
  }
  return settings;
}

function clientFor(settings) {
  return new S3Client({
    endpoint: settings.ENDPOINT,
    region: settings.REGION || "auto",
    credentials: { accessKeyId: settings.ACCESS_KEY_ID, secretAccessKey: settings.SECRET_ACCESS_KEY },
  });
}

async function listAll(client, bucket) {
  const objects = new Map();
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) objects.set(item.Key, item.Size ?? 0);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

const source = readSettings("SOURCE_STORAGE_FILE");
const target = readSettings("TARGET_STORAGE_FILE");
const describe = (s) => `${new URL(s.ENDPOINT).host}/${s.BUCKET}`;

if (describe(source) === describe(target)) {
  console.error("Refusing to run: the source and the test site are the same bucket.");
  process.exit(1);
}

const from = clientFor(source);
const to = clientFor(target);

console.log(`Source (read only): ${describe(source)}`);
console.log(`Test site:          ${describe(target)}${dryRun ? "   (dry run: nothing is copied)" : ""}`);

const sourceObjects = await listAll(from, source.BUCKET);
const targetObjects = await listAll(to, target.BUCKET);

let copied = 0;
let skipped = 0;
let bytes = 0;
for (const [key, size] of sourceObjects) {
  if (targetObjects.get(key) === size) {
    skipped += 1;
    continue;
  }
  if (dryRun) {
    console.log(`  would copy ${key} (${size} bytes)`);
  } else {
    const object = await from.send(new GetObjectCommand({ Bucket: source.BUCKET, Key: key }));
    const body = Buffer.from(await object.Body.transformToByteArray());
    await to.send(
      new PutObjectCommand({
        Bucket: target.BUCKET,
        Key: key,
        Body: body,
        ContentType: object.ContentType,
        CacheControl: object.CacheControl,
        Metadata: object.Metadata,
      }),
    );
  }
  copied += 1;
  bytes += size;
}

const after = dryRun ? null : await listAll(to, target.BUCKET);
const missing = after ? [...sourceObjects].filter(([key, size]) => after.get(key) !== size) : [];
console.log(
  `${sourceObjects.size} files on the live site: ${dryRun ? "would copy" : "copied"} ${copied} (${(bytes / 1024 / 1024).toFixed(1)} MB), ${skipped} already on the test site.`,
);
if (missing.length) {
  console.error(`Not on the test site after copying: ${missing.map(([key]) => key).join(", ")}`);
  process.exitCode = 1;
}
