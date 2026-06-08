import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function runTest() {
  console.log("Starting Workflow Engine Test...");

  // 1. Setup Test Data
  console.log("\n[1] Setting up mock data...");
  const adminUser = await prisma.user.create({
    data: {
      id: "admin_" + Date.now(),
      email: "test_admin_" + Date.now() + "@babcock.edu.ng",
      firstName: "Test",
      lastName: "Admin",
      role: "ADMIN",
    },
  });

  const hodUser = await prisma.user.create({
    data: {
      id: "hod_" + Date.now(),
      email: "test_hod_" + Date.now() + "@babcock.edu.ng",
      firstName: "Test",
      lastName: "HOD",
      role: "HOD",
    },
  });

  const cycle = await prisma.reviewCycle.create({
    data: {
      name: "Test Cycle " + Date.now(),
      isActive: true,
      startedAt: new Date(),
      createdById: adminUser.id,
    },
  });

  const school = await prisma.school.create({
    data: {
      name: "Test School " + Date.now(),
      code: "TS_" + Date.now(),
    },
  });

  const department = await prisma.department.create({
    data: {
      name: "Test Dept " + Date.now(),
      code: "TD_" + Date.now(),
      schoolId: school.id,
    },
  });

  const programme = await prisma.programme.create({
    data: {
      name: "Test Programme " + Date.now(),
      code: "TP_" + Date.now(),
      departmentId: department.id,
    },
  });

  let submission: any = await prisma.submission.create({
    data: {
      title: "Test Submission " + Date.now(),
      cycleId: cycle.id,
      programmeId: programme.id,
      createdById: hodUser.id,
      status: "DRAFT",
      currentPhase: 1, // DRAFT phase is ignored, status is DRAFT
      content: {
        create: {
          philosophy: "Test philosophy",
        }
      },
    },
  });

  console.log("Created Submission ID:", submission.id);

  // Helper function to simulate transition
  async function simulateTransition(action: string, performedById: string, toPhase?: number) {
    const current = await prisma.submission.findUnique({ where: { id: submission.id } });
    if (!current) throw new Error("Submission not found");
    
    let newPhase = current.currentPhase;
    let newStatus = current.status;

    switch (action) {
      case "APPROVE":
        newPhase = toPhase || Math.min(current.currentPhase + 1, 11);
        newStatus = newPhase === 11 ? "APPROVED" : "IN_REVIEW";
        break;
      case "REJECT":
        newPhase = 1;
        newStatus = "REJECTED";
        break;
      case "RETURN":
        newPhase = toPhase || Math.max(current.currentPhase - 1, 1);
        newStatus = "IN_REVIEW";
        break;
      case "SUBMIT":
        newPhase = 1;
        newStatus = "IN_REVIEW";
        break;
      default:
        throw new Error("Invalid action");
    }

    const [transition, updated] = await prisma.$transaction([
      prisma.phaseTransition.create({
        data: {
          submissionId: submission.id,
          fromPhase: current.currentPhase,
          toPhase: newPhase,
          action,
          remarks: "Test transition",
          performedById,
        },
      }),
      prisma.submission.update({
        where: { id: submission.id },
        data: {
          currentPhase: newPhase,
          status: newStatus,
        },
      }),
    ]);
    
    submission = updated;
    return { transition, updated };
  }

  try {
    // 2. Test SUBMIT
    console.log("\n[2] Testing SUBMIT action...");
    await simulateTransition("SUBMIT", hodUser.id);
    if (submission.status !== "IN_REVIEW" || submission.currentPhase !== 1) {
      throw new Error(`SUBMIT failed: Status=${submission.status}, Phase=${submission.currentPhase}`);
    }
    console.log("✅ SUBMIT successful. Status: IN_REVIEW, Phase: 1");

    // 3. Test APPROVE (Phase 1 -> 2)
    console.log("\n[3] Testing APPROVE action (Phase 1 -> 2)...");
    await simulateTransition("APPROVE", adminUser.id);
    if (submission.status !== "IN_REVIEW" || submission.currentPhase !== 2) {
      throw new Error(`APPROVE failed: Status=${submission.status}, Phase=${submission.currentPhase}`);
    }
    console.log("✅ APPROVE successful. Status: IN_REVIEW, Phase: 2");

    // 4. Test RETURN (Phase 2 -> 1)
    console.log("\n[4] Testing RETURN action (Phase 2 -> 1)...");
    await simulateTransition("RETURN", adminUser.id);
    if (submission.status !== "IN_REVIEW" || submission.currentPhase !== 1) {
      throw new Error(`RETURN failed: Status=${submission.status}, Phase=${submission.currentPhase}`);
    }
    console.log("✅ RETURN successful. Status: IN_REVIEW, Phase: 1");

    // 5. Test Fast-forward to Phase 10
    console.log("\n[5] Fast-forwarding to Phase 10...");
    for (let i = 1; i < 10; i++) {
      await simulateTransition("APPROVE", adminUser.id);
    }
    if (submission.currentPhase !== 10 || submission.status !== "IN_REVIEW") {
      throw new Error(`Fast-forward failed: Status=${submission.status}, Phase=${submission.currentPhase}`);
    }
    console.log("✅ Fast-forward successful. Status: IN_REVIEW, Phase: 10");

    // 6. Test Final APPROVE (Phase 10 -> 11)
    console.log("\n[6] Testing Final APPROVE action (Phase 10 -> 11)...");
    await simulateTransition("APPROVE", adminUser.id);
    if (submission.status !== "APPROVED" || submission.currentPhase !== 11) {
      throw new Error(`Final APPROVE failed: Status=${submission.status}, Phase=${submission.currentPhase}`);
    }
    console.log("✅ Final APPROVE successful. Status: APPROVED, Phase: 11");

    // 7. Test REJECT
    console.log("\n[7] Testing REJECT action...");
    await simulateTransition("REJECT", adminUser.id);
    if (submission.status !== "REJECTED" || submission.currentPhase !== 1) {
      throw new Error(`REJECT failed: Status=${submission.status}, Phase=${submission.currentPhase}`);
    }
    console.log("✅ REJECT successful. Status: REJECTED, Phase: 1");

    console.log("\n🎉 All workflow transition tests passed successfully!");

  } catch (error) {
    console.error("\n❌ Test Failed:", error);
  } finally {
    // Cleanup
    console.log("\n[8] Cleaning up test data...");
    await prisma.phaseTransition.deleteMany({ where: { submissionId: submission.id } });
    await prisma.submission.delete({ where: { id: submission.id } });
    await prisma.programme.delete({ where: { id: programme.id } });
    await prisma.department.delete({ where: { id: department.id } });
    await prisma.school.delete({ where: { id: school.id } });
    await prisma.reviewCycle.delete({ where: { id: cycle.id } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, hodUser.id] } } });
    console.log("Cleanup complete.");
    await prisma.$disconnect();
  }
}

runTest();
