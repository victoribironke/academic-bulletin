import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET() {
  try {
    // Get submission counts by status
    const [
      totalSubmissions,
      draftCount,
      inReviewCount,
      approvedCount,
      rejectedCount,
    ] = await Promise.all([
      prisma.submission.count(),
      prisma.submission.count({ where: { status: "DRAFT" } }),
      prisma.submission.count({ where: { status: "IN_REVIEW" } }),
      prisma.submission.count({ where: { status: "APPROVED" } }),
      prisma.submission.count({ where: { status: "REJECTED" } }),
    ]);

    // Get submission counts by phase
    const phaseDistribution = await prisma.submission.groupBy({
      by: ["currentPhase"],
      _count: { id: true },
      orderBy: { currentPhase: "asc" },
    });

    // Get recent activity (phase transitions)
    const recentTransitions = await prisma.phaseTransition.findMany({
      take: 10,
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
      where: { status: "OPEN" },
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
