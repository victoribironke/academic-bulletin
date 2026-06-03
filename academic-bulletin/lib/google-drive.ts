import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

let authClient: ReturnType<GoogleAuth["fromJSON"]> | null = null;

function getAuthClient() {
  if (authClient) return authClient;

  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credentials) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set");
  }

  const key = JSON.parse(credentials);
  const auth = new GoogleAuth({ scopes: SCOPES });
  authClient = auth.fromJSON(key);
  return authClient;
}

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

export interface UploadResult {
  fileId: string;
  webViewLink: string;
  thumbnailLink: string;
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<UploadResult> {
  const client = await getAuthClient();
  const token = await (client as { getAccessToken: () => Promise<{ token: string }> }).getAccessToken();

  const metadata = {
    name: fileName,
    parents: DRIVE_FOLDER_ID ? [DRIVE_FOLDER_ID] : [],
  };

  const boundary = "----FormBoundary" + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata);

  const mediaPart =
    delimiter +
    `Content-Type: ${mimeType}\r\n` +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    fileBuffer.toString("base64");

  const body = metadataPart + mediaPart + closeDelimiter;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,thumbnailLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Drive upload failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();

  // Make the file publicly viewable
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    },
  );

  return {
    fileId: data.id,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    thumbnailLink: `https://drive.google.com/thumbnail?id=${data.id}&sz=w400`,
  };
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    const client = await getAuthClient();
    const token = await (client as { getAccessToken: () => Promise<{ token: string }> }).getAccessToken();

    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.token}` },
    });
  } catch (error) {
    console.error("Failed to delete file from Drive:", error);
  }
}
