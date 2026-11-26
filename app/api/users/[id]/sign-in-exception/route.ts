import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import {
  isPrivilegedRole,
  isUniversityEmail,
  parseSignInExceptionEnd,
  UNIVERSITY_DOMAIN,
} from "@/lib/sign-in-access";
import { formatDate } from "@/lib/dates/format";
import { couldNot } from "@/lib/messages";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_REASON_LENGTH = 300;


const refuse = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

async function loadTarget(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      signInExceptionUntil: true,
      signInExceptionReason: true,
    },
  });
}

/**
 * PUT /api/users/[id]/sign-in-exception - Lets a personal Google account sign
 * in until a set date (Super Admins only). Body: { reason, until: "YYYY-MM-DD" }.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return refuse("Send a reason and an end date.");

    const target = await loadTarget(id);
    if (!target) return refuse("User not found", 404);

    if (isUniversityEmail(target.email)) {
      return refuse(`A ${UNIVERSITY_DOMAIN} account signs in without an exception.`);
    }
    if (isPrivilegedRole(target.role)) {
      return refuse(
        `Academic Planning Admin and Super Administrator accounts must use a ${UNIVERSITY_DOMAIN} address. An exception can't cover them.`,
      );
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > MAX_REASON_LENGTH) {
      return refuse(`Give a reason for the exception (up to ${MAX_REASON_LENGTH} characters).`);
    }
    const end = parseSignInExceptionEnd(body.until);
    if (!end.ok) return refuse(end.error);

    const name = `${target.firstName} ${target.lastName}`;
    const renewing = !!target.signInExceptionUntil && target.signInExceptionUntil > new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          signInExceptionUntil: end.until,
          signInExceptionReason: reason,
          signInExceptionGrantedById: auth.user.id,
        },
        select: { signInExceptionUntil: true, signInExceptionReason: true },
      });
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "SIGN_IN_EXCEPTION_GRANTED",
          entityType: "USER",
          entityId: id,
          description: `${renewing ? "Changed" : "Gave"} ${name}'s sign-in exception for a personal Google account, to end ${formatDate(end.until)}: ${reason}`,
          metadata: {
            email: target.email,
            until: end.until.toISOString(),
            reason,
            previousUntil: target.signInExceptionUntil?.toISOString() ?? null,
          },
        },
        tx,
      );
      return user;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to grant sign-in exception:", error);
    return NextResponse.json(
      { error: couldNot("save the sign-in exception") },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/users/[id]/sign-in-exception - Ends a personal account's
 * exception now (Super Admins only). The person is signed out within the
 * session re-check time.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const target = await loadTarget(id);
    if (!target) return refuse("User not found", 404);
    const endedUntil = target.signInExceptionUntil;
    if (!endedUntil) {
      return refuse("This account has no sign-in exception.", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          signInExceptionUntil: null,
          signInExceptionReason: null,
          signInExceptionGrantedById: null,
        },
      });
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "SIGN_IN_EXCEPTION_ENDED",
          entityType: "USER",
          entityId: id,
          description: `Ended ${target.firstName} ${target.lastName}'s sign-in exception for a personal Google account.`,
          metadata: {
            email: target.email,
            until: endedUntil.toISOString(),
            reason: target.signInExceptionReason,
          },
        },
        tx,
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to end sign-in exception:", error);
    return NextResponse.json(
      { error: couldNot("end the sign-in exception") },
      { status: 500 },
    );
  }
}
