import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST /api/submissions/initialize - Idempotent bulk creation of submissions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cycleId, createdById } = body;

    if (!cycleId || !createdById) {
      return NextResponse.json(
        { error: "cycleId and createdById are required" },
        { status: 400 }
      );
    }

    // Ensure the cycle exists
    const cycle = await prisma.reviewCycle.findUnique({
      where: { id: cycleId }
    });

    if (!cycle) {
      return NextResponse.json(
        { error: "Cycle not found" },
        { status: 404 }
      );
    }

    // 1. Get all programmes
    const programmes = await prisma.programme.findMany();

    // 2. Get all existing submissions for this cycle
    const existingSubmissions = await prisma.submission.findMany({
      where: { cycleId },
      select: { programmeId: true }
    });

    const existingProgrammeIds = new Set(existingSubmissions.map(s => s.programmeId));

    // 3. Filter for programmes that DO NOT have a submission yet
    const programmesToInit = programmes.filter(p => !existingProgrammeIds.has(p.id));

    if (programmesToInit.length === 0) {
      return NextResponse.json({ 
        message: "All programmes already have submissions for this cycle",
        createdCount: 0 
      });
    }

    let createdCount = 0;

    // Create submissions sequentially or in parallel batches
    for (const programme of programmesToInit) {
      await prisma.submission.create({
        data: {
          title: `Academic Bulletin Submission - ${programme.name}`,
          programmeId: programme.id,
          createdById,
          cycleId,
          status: "DRAFT",
          currentPhase: 1,
          content: {
            create: {
              sectionA: {},
              sectionB: {},
              sectionC: {},
              sectionD: {},
              sectionE: {},
              sectionF: {},
              sectionG: {},
              sectionH: {},
            },
          },
        }
      });
      createdCount++;
    }

    return NextResponse.json({ 
      message: "Initialization successful", 
      createdCount 
    }, { status: 201 });

  } catch (error) {
    console.error("Failed to initialize submissions:", error);
    return NextResponse.json(
      { error: "Failed to initialize submissions" },
      { status: 500 }
    );
  }
}
