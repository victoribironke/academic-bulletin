/**
 * The Academic Policy library (work order task H9). The current version is
 * the newest one DAP marked current, or else the policy bundled with the app
 * (package file 04, updated September 8, 2025). Earlier versions stay
 * readable. Server only.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { type PolicyDocument, splitPolicy } from "@/lib/policy/sections";

export const BUILT_IN_POLICY_ID = "built-in-2025-09-08";

export const POLICY_UNDER_REVIEW_NOTE =
  "The Academic Policy is under review. Until Senate approves the revised policy, the version shown here applies.";

const BUILT_IN = {
  id: BUILT_IN_POLICY_ID,
  label: "Updated September 8, 2025",
  note: POLICY_UNDER_REVIEW_NOTE,
  sourceName: "Academic Policies Manual 2023-2027, voted by the University Senate on September 23, 2025",
  file: join(process.cwd(), "data/policy/academic-policy-2025-09-08.md"),
};

export type PolicyVersionSummary = {
  id: string;
  label: string;
  note: string | null;
  sourceName: string | null;
  createdAt: string | null;
  isCurrent: boolean;
  builtIn: boolean;
};

export type PolicyView = PolicyDocument & { version: PolicyVersionSummary; versions: PolicyVersionSummary[] };

/** Every version, newest first, with the bundled one last. */
export async function listPolicyVersions(): Promise<PolicyVersionSummary[]> {
  const stored = await prisma.policyVersion.findMany({
    select: { id: true, label: true, note: true, sourceName: true, createdAt: true, isCurrent: true },
    orderBy: { createdAt: "desc" },
  });
  const anyCurrent = stored.some((version) => version.isCurrent);
  return [
    ...stored.map((version) => ({ ...version, createdAt: version.createdAt.toISOString(), builtIn: false })),
    {
      id: BUILT_IN.id,
      label: BUILT_IN.label,
      note: BUILT_IN.note,
      sourceName: BUILT_IN.sourceName,
      createdAt: null,
      isCurrent: !anyCurrent,
      builtIn: true,
    },
  ];
}

/** Drops the note the package added for the app's maintainers. */
function withoutMaintainerNote(document: PolicyDocument): PolicyDocument {
  return { ...document, intro: document.intro.replace(/^Reference copy prepared[^\n]*\n*/i, "").trim() };
}

/** One version split into sections: the current one unless an id is given. */
export async function readPolicy(versionId?: string | null): Promise<PolicyView | null> {
  const versions = await listPolicyVersions();
  const version = versionId ? versions.find((item) => item.id === versionId) : versions.find((item) => item.isCurrent);
  if (!version) return null;
  const content = version.builtIn
    ? await readFile(BUILT_IN.file, "utf8")
    : (await prisma.policyVersion.findUniqueOrThrow({ where: { id: version.id }, select: { content: true } })).content;
  return { ...withoutMaintainerNote(splitPolicy(content)), version, versions };
}

export const POLICY_UPLOAD_LIMITS = { minSections: 5, maxBytes: 2_000_000 } as const;

export type PolicyUpload = { label: string; note?: string | null; sourceName?: string | null; content: string };

/** Checks an uploaded version: a label, markdown with headings, not too large. */
export function checkPolicyUpload(input: Partial<PolicyUpload>): string | null {
  if (typeof input.label !== "string" || input.label.trim().length < 3) {
    return 'Give the version a name, for example "Updated September 8, 2025".';
  }
  if (typeof input.content !== "string" || input.content.trim() === "") return "Choose the policy file (markdown, .md).";
  if (Buffer.byteLength(input.content, "utf8") > POLICY_UPLOAD_LIMITS.maxBytes) return "The file is larger than 2 MB.";
  const sections = splitPolicy(input.content).sections.length;
  if (sections < POLICY_UPLOAD_LIMITS.minSections) {
    return `The file has ${sections} headed sections; a policy needs at least ${POLICY_UPLOAD_LIMITS.minSections}. Use "#" and "##" headings, as in the current version.`;
  }
  return null;
}

/** Stores an uploaded version and makes it the current one. */
export async function addPolicyVersion(input: PolicyUpload, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.policyVersion.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    const version = await tx.policyVersion.create({
      data: {
        label: input.label.trim(),
        note: input.note?.trim() || null,
        sourceName: input.sourceName?.trim() || null,
        content: input.content,
        isCurrent: true,
        uploadedById: actorId,
      },
      select: { id: true, label: true },
    });
    await recordActivity(
      {
        actorId,
        action: "POLICY_VERSION_UPLOADED",
        entityType: "POLICY",
        entityId: version.id,
        description: `Uploaded the Academic Policy "${version.label}" and made it the current version.`,
      },
      tx,
    );
    return version;
  });
}
