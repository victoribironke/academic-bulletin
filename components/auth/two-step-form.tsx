"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { logOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecoveryCodes } from "@/components/auth/recovery-codes";

type Setup = { qrCode: string; secret: string; account: string; issuer: string };

type Step =
  | { name: "intro" }
  | { name: "scan"; setup: Setup }
  | { name: "codes"; codes: string[] }
  | { name: "enter"; useRecovery: boolean }
  | { name: "recovered"; codesLeft: number };

async function post(url: string, body?: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-primary">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md bg-destructive/10 p-3 text-center text-sm font-medium text-destructive"
    >
      {message}
    </div>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}

/**
 * The /verify page's steps: setting up an authenticator app (QR code, first
 * code, recovery codes), or entering this sign-in's code.
 */
export function TwoStepForm({
  enrolled,
  email,
  next,
}: {
  enrolled: boolean;
  email: string;
  next: string;
}) {
  const [step, setStep] = useState<Step>(
    enrolled ? { name: "enter", useRecovery: false } : { name: "intro" },
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const goOn = () => window.location.assign(next);

  /** Runs a request; returns its data on success, or shows its error. */
  const run = async (url: string, body?: object) => {
    setBusy(true);
    setError(null);
    try {
      const { response, data } = await post(url, body);
      if (response.ok) return data;
      if (response.status === 401 && data.code !== "MFA_REQUIRED") {
        window.location.assign("/login");
        return null;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
      return null;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const startSetup = async () => {
    const data = await run("/api/mfa/setup");
    if (data) {
      setCode("");
      setStep({ name: "scan", setup: data });
    }
  };

  const confirmSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = await run("/api/mfa/setup/confirm", { code });
    if (data) setStep({ name: "codes", codes: data.recoveryCodes });
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    const data = await run("/api/mfa/verify", { code });
    if (!data) return;
    if (data.method === "RECOVERY_CODE") {
      setStep({ name: "recovered", codesLeft: data.recoveryCodesLeft });
    } else {
      goOn();
    }
  };

  const codeInput = (useRecovery: boolean) => (
    <div className="space-y-2">
      <Label htmlFor="two-step-code">
        {useRecovery ? "Recovery code" : "6-digit code"}
      </Label>
      {useRecovery ? (
        <Input
          id="two-step-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="XXXXX-XXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={13}
          className="h-11 text-center font-mono text-base tracking-widest"
          autoFocus
          required
        />
      ) : (
        <Input
          id="two-step-code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ""))}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="h-11 text-center font-mono text-lg tracking-[0.4em]"
          autoFocus
          required
        />
      )}
    </div>
  );

  const submitButton = (label: string) => (
    <Button type="submit" className="h-11 w-full" disabled={busy || !code.trim()}>
      {busy && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );

  let body: React.ReactNode;
  switch (step.name) {
    case "intro":
      body = (
        <div className="space-y-6">
          <Heading title="Set up two-step verification">
            Academic Planning Admin and Super Administrator accounts need a code
            from an authenticator app each time they sign in.
          </Heading>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
            <li>
              Install an authenticator app on your phone, such as Google
              Authenticator or Microsoft Authenticator.
            </li>
            <li>Scan the QR code on the next screen with it.</li>
            <li>Enter the code the app shows, then save your recovery codes.</li>
          </ol>
          <ErrorMessage message={error} />
          <Button className="h-11 w-full" onClick={startSetup} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Show the QR code
          </Button>
        </div>
      );
      break;

    case "scan":
      body = (
        <form onSubmit={confirmSetup} className="space-y-6">
          <Heading title="Scan this QR code">
            In your authenticator app, add an account and scan the code. Then
            enter the 6-digit code it shows.
          </Heading>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL made on the server */}
            <img
              src={step.setup.qrCode}
              alt={`QR code to add ${step.setup.issuer} (${step.setup.account}) to an authenticator app`}
              width={192}
              height={192}
              className="rounded-md border bg-white p-1"
            />
          </div>
          <details className="rounded-md border px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Can&apos;t scan it? Enter a key instead
            </summary>
            <dl className="mt-2 space-y-1">
              <div>
                <dt className="text-xs text-muted-foreground">Account</dt>
                <dd>{step.setup.account}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Key (time-based)</dt>
                <dd className="select-all break-all font-mono tracking-wide">
                  {step.setup.secret}
                </dd>
              </div>
            </dl>
          </details>
          {codeInput(false)}
          <ErrorMessage message={error} />
          {submitButton("Turn on two-step verification")}
        </form>
      );
      break;

    case "codes":
      body = (
        <div className="space-y-6">
          <Heading title="Save your recovery codes">
            If you lose your phone, each code lets you sign in once. Keep them
            somewhere safe, such as a password manager. You won&apos;t see them
            again.
          </Heading>
          <RecoveryCodes codes={step.codes} account={email} />
          <div className="flex items-start gap-2">
            <Checkbox
              id="codes-saved"
              checked={saved}
              onCheckedChange={(value) => setSaved(value === true)}
              className="mt-0.5"
            />
            <Label htmlFor="codes-saved" className="text-sm font-normal leading-snug">
              I&apos;ve saved my recovery codes
            </Label>
          </div>
          <Button className="h-11 w-full" onClick={goOn} disabled={!saved}>
            Continue
          </Button>
        </div>
      );
      break;

    case "enter":
      body = (
        <form onSubmit={verify} className="space-y-6">
          <Heading title="Enter your code">
            {step.useRecovery
              ? "Enter one of the recovery codes you saved when you set up two-step verification. Each works once."
              : `Open your authenticator app and enter the code for Academic Bulletin (${email}).`}
          </Heading>
          {codeInput(step.useRecovery)}
          <ErrorMessage message={error} />
          {submitButton("Continue")}
          <p className="text-center text-sm">
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setCode("");
                setError(null);
                setStep({ name: "enter", useRecovery: !step.useRecovery });
              }}
            >
              {step.useRecovery
                ? "Use my authenticator app instead"
                : "Lost your phone? Use a recovery code"}
            </button>
          </p>
        </form>
      );
      break;

    case "recovered":
      body = (
        <div className="space-y-6">
          <Heading title="Signed in with a recovery code">
            {step.codesLeft === 0
              ? "That was your last recovery code."
              : `You have ${step.codesLeft} recovery code${step.codesLeft === 1 ? "" : "s"} left.`}{" "}
            If you&apos;ve lost your phone, ask another Super Administrator to
            reset your two-step verification so you can set up a new one. Otherwise,
            make new codes from your name in the sidebar.
          </Heading>
          <Button className="h-11 w-full" onClick={goOn}>
            Continue
          </Button>
        </div>
      );
      break;
  }

  return (
    <div className="space-y-6">
      {body}
      {step.name !== "codes" && step.name !== "recovered" && (
        <form action={logOut} className="text-center">
          <SignOutButton />
        </form>
      )}
    </div>
  );
}
