import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionAccess } from "@/auth";
import prisma from "@/lib/prisma";
import { currentVerification, mfaRequiredFor, safeNextPath } from "@/lib/mfa/policy";
import { isMfaConfigured } from "@/lib/mfa/secrets";
import { BrandedShell } from "@/components/auth/branded-shell";
import { TwoStepForm } from "@/components/auth/two-step-form";
import { logOut } from "@/app/actions/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Two-step verification · Academic Bulletin" };

/**
 * Where an Academic Planning Admin or Super Admin enters this sign-in's
 * authenticator code, or sets the app up the first time. Decides from the
 * database, not the session cookie, whether a code is still needed.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const access = await getSessionAccess();
  if (!access) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: access.userId },
    select: {
      email: true,
      role: true,
      isActive: true,
      mfaEnabledAt: true,
      mfaVerifications: currentVerification(access.sessionId),
    },
  });
  if (!user?.isActive) redirect("/login");
  if (!mfaRequiredFor(user.role) || user.mfaVerifications.length > 0) redirect(next);

  return (
    <BrandedShell>
      {isMfaConfigured() ? (
        <TwoStepForm enrolled={user.mfaEnabledAt !== null} email={user.email} next={next} />
      ) : (
        <div className="space-y-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            Two-step verification isn&apos;t available
          </h1>
          <p className="text-sm text-muted-foreground">
            Admin accounts need an authenticator code to sign in, and the server
            isn&apos;t set up for it yet. Ask the site administrator to add the
            MFA_ENCRYPTION_KEY setting.
          </p>
          <form action={logOut}>
            <button type="submit" className="text-sm text-primary underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      )}
    </BrandedShell>
  );
}
