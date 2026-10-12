import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (
      (auth.user.role === "HOD" && !auth.user.departmentId) ||
      (auth.user.role === "DEAN" && !auth.user.schoolId)
    ) {
      return NextResponse.json(
        { error: "Your account is not assigned to an academic unit." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const departmentId =
      auth.user.role === "HOD"
        ? auth.user.departmentId
        : searchParams.get("departmentId");
    const schoolId =
      auth.user.role === "DEAN"
        ? auth.user.schoolId
        : searchParams.get("schoolId");

    const whereClause: any = {};
    if (departmentId) {
      whereClause.programme = { departmentId };
    } else if (schoolId) {
      whereClause.programme = { department: { schoolId } };
    }

    // Get submission counts by status
    const [
      totalSubmissions,
      draftCount,
      correctionsRequiredCount,
      inReviewCount,
      approvedCount,
      rejectedCount,
    ] = await Promise.all([
      prisma.submission.count({ where: whereClause }),
      prisma.submission.count({ where: { ...whereClause, status: "DRAFT" } }),
      prisma.submission.count({
        where: { ...whereClause, status: "CORRECTIONS_REQUIRED" },
      }),
      prisma.submission.count({ where: { ...whereClause, status: "IN_REVIEW" } }),
      prisma.submission.count({ where: { ...whereClause, status: "APPROVED" } }),
      prisma.submission.count({ where: { ...whereClause, status: "REJECTED" } }),
    ]);

    // Get submission counts by phase
    const phaseDistribution = await prisma.submission.groupBy({
      by: ["currentPhase"],
      where: whereClause,
      _count: { id: true },
      orderBy: { currentPhase: "asc" },
    });

    // Get recent activity (phase transitions)
    const recentTransitions = await prisma.phaseTransition.findMany({
      take: 10,
      where: Object.keys(whereClause).length > 0 ? {
        submission: whereClause
      } : undefined,
      orderBy: { transitionedAt: "desc" },
      include: {
        submission: {
          select: {
            id: true,
            title: true,
            programme: {
              select: { name: true, code: true },
            },
          },
        },
        performedBy: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    // Get open comments count
    const openComments = await prisma.comment.count({
      where: { 
        status: "OPEN",
        ...(Object.keys(whereClause).length > 0 ? { submission: whereClause } : {})
      },
    });

    // Get organizational stats
    const [schoolCount, departmentCount, programmeCount, userCount] =
      await Promise.all([
        prisma.school.count(),
        prisma.department.count(),
        prisma.programme.count(),
        prisma.user.count({ where: { isActive: true } }),
      ]);

    // Format phase distribution for charts
    const phaseNames: Record<number, string> = {
      1: "Preparation",
      2: "Dept Review",
      3: "School",
      4: "Academic Planning",
      5: "Corrections",
      6: "Consolidation",
      7: "Senate",
      8: "Editing",
      9: "Typesetting",
      10: "Distribution",
      11: "Post-Release",
    };

    const phaseData = Array.from({ length: 11 }, (_, i) => {
      const phase = i + 1;
      const found = phaseDistribution.find((p) => p.currentPhase === phase);
      return {
        phase,
        name: phaseNames[phase],
        count: found?._count.id || 0,
      };
    });

    return NextResponse.json({
      submissions: {
        total: totalSubmissions,
        draft: draftCount,
        correctionsRequired: correctionsRequiredCount,
        inReview: inReviewCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      phaseDistribution: phaseData,
      recentActivity: recentTransitions.map((t) => ({
        id: t.id,
        action: t.action,
        fromPhase: t.fromPhase,
        toPhase: t.toPhase,
        remarks: t.remarks,
        transitionedAt: t.transitionedAt,
        submission: t.submission,
        performedBy: t.performedBy,
      })),
      openComments,
      organization: {
        schools: schoolCount,
        departments: departmentCount,
        programmes: programmeCount,
        users: userCount,
      },
    });
  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
