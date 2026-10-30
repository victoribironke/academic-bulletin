import {
  CheckCircle2,
  ImageOff,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

type PhotoUploadGuidanceProps = {
  compact?: boolean;
};

const requirements = [
  "Use a recent, clear portrait of one person, with the face centred and the head and shoulders fully visible.",
  "Use a plain, uncluttered background, even front lighting, and professional clothing.",
  "Look towards the camera. Do not use filters, screenshots, group photos, logos, text, or anything that hides the face.",
  "Upload a portrait image of at least 300 × 400 pixels in JPEG, PNG, or WebP format. Maximum file size: 4 MB.",
];

export function PhotoUploadGuidance({ compact = false }: PhotoUploadGuidanceProps) {
  return (
    <section
      aria-label="Photo upload requirements"
      className="rounded-lg border bg-muted/30 p-4"
    >
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Photo requirements</h4>
        <p className="text-xs text-muted-foreground">
          Photos are checked before upload. Use the guide below to avoid rejection.
        </p>
      </div>

      <ul className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        {requirements.map((requirement) => (
          <li key={requirement} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
            <span>{requirement}</span>
          </li>
        ))}
      </ul>

      {!compact && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Photo examples">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              Acceptable example
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded border border-emerald-300 bg-white dark:bg-background">
                <UserRound className="size-10 text-emerald-700" strokeWidth={1.5} />
              </div>
              <p className="text-xs text-muted-foreground">
                One person, portrait orientation, clear face, head and shoulders centred,
                plain background, and even lighting.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-red-200 bg-red-50/70 p-3 dark:border-red-900 dark:bg-red-950/20">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
              <XCircle className="size-4" />
              Unacceptable examples
            </div>
            <div className="flex items-center gap-3">
              <div className="grid shrink-0 grid-cols-2 gap-1 text-red-600">
                <span
                  className="flex size-9 items-center justify-center rounded border border-red-200 bg-white dark:bg-background"
                  title="Group photo"
                >
                  <Users className="size-5" />
                </span>
                <span
                  className="flex size-9 items-center justify-center rounded border border-red-200 bg-white dark:bg-background"
                  title="Unclear or unsuitable image"
                >
                  <ImageOff className="size-5" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Group photos, blurry or dark images, landscape crops, distracting
                backgrounds, filters, screenshots, or a partly hidden face.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
