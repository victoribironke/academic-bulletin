import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionAccess } from "@/auth";
import { MFA_REQUIRED_RESPONSE } from "@/lib/api-auth";
import { currentVerification, mfaRequiredFor } from "@/lib/mfa/policy";
import { serverTimer } from "@/lib/server-timing";
import { NOT_SIGNED_IN, couldNot } from "@/lib/messages";

export async function GET() {
  try {
    const timer = serverTimer();
    const access = await getSessionAccess();
    timer.mark("auth");
    if (!access) {
      return NextResponse.json({ error: NOT_SIGNED_IN }, { status: 401 });
    }
    const userId = access.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        schoolId: true,
        departmentId: true,
        school: {
          select: { id: true, name: true, code: true },
        },
        department: {
          select: { id: true, name: true, code: true },
        },
        programmeAssignments: {
          select: {
            programme: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { programme: { name: "asc" } },
        },
        mfaVerifications: currentVerification(access.sessionId),
      },
    });

    timer.mark("db");
    if (!user) {
      return NextResponse.json(
        { error: "Account is not provisioned" },
        { status: 403 },
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Account deactivated" },
        { status: 403 },
      );
    }

    // An admin who hasn't entered this sign-in's code is sent to /verify.
    const { programmeAssignments, mfaVerifications, ...profile } = user;
    if (
      mfaRequiredFor(profile.role) &&
      (access.mfa === "pending" || mfaVerifications.length === 0)
    ) {
      return NextResponse.json(MFA_REQUIRED_RESPONSE, { status: 401 });
    }

    return NextResponse.json(
      {
        ...profile,
        programmeIds: programmeAssignments.map(
          (assignment) => assignment.programme.id,
        ),
        programmes: programmeAssignments.map(
          (assignment) => assignment.programme,
        ),
      },
      { headers: { "Server-Timing": timer.header() } },
    );
  } catch (error) {
    console.error("Failed to fetch current user session:", error);
    return NextResponse.json(
      { error: couldNot("load your account") },
      { status: 500 },
    );
  }
}

