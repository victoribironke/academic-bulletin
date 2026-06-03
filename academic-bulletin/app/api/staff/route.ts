import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatStaffName,
  isValidName,
  toTitleCase,
} from "@/lib/validation/name-format";

// Valid enum values for validation
const VALID_TITLES = [
  "MR",
  "MRS",
  "MS",
  "DR",
  "PROF",
  "ENGR",
  "BARR",
  "REV",
  "PASTOR",
];
const VALID_GENDERS = ["MALE", "FEMALE"];
const VALID_QUALIFICATIONS = ["PHD", "MASTERS", "BACHELOR", "HND", "OND"];
const VALID_RANKS = [
  "PROFESSOR",
  "ASSOCIATE_PROFESSOR",
  "SENIOR_LECTURER",
  "LECTURER_I",
  "LECTURER_II",
  "ASSISTANT_LECTURER",
  "GRADUATE_ASSISTANT",
  "OTHER", // For non-academic staff with custom job titles
];
const VALID_TYPES = ["ACADEMIC", "ADJUNCT", "NON_ACADEMIC"];

// GET /api/staff - Get all staff (optionally filtered by department)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const type = searchParams.get("type");
    const rank = searchParams.get("rank");
    const qualification = searchParams.get("qualification");

    const where: Record<string, unknown> = { isActive: true };
    if (departmentId) where.departmentId = departmentId;
    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (rank && VALID_RANKS.includes(rank)) where.academicRank = rank;
    if (qualification && VALID_QUALIFICATIONS.includes(qualification)) {
      where.highestQualification = qualification;
    }

    const staff = await prisma.staff.findMany({
      where,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
            school: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: [{ type: "asc" }, { surname: "asc" }, { firstName: "asc" }],
    });

    // Add formatted full name to response
    const staffWithFormattedNames = staff.map((s) => ({
      ...s,
      fullName: formatStaffName(s),
    }));

    return NextResponse.json(staffWithFormattedNames);
  } catch (error) {
    console.error("Failed to fetch staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500 },
    );
  }
}

// POST /api/staff - Create a new staff member
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      gender,
      surname,
      middleName,
      firstName,
      highestQualification,
      academicRank,
      customJobTitle,
      specialization,
      email,
      type,
      departmentId,
    } = body;

    // Required field validation
    if (
      !title ||
      !gender ||
      !surname ||
      !firstName ||
      !highestQualification ||
      !academicRank ||
      !departmentId
    ) {
      return NextResponse.json(
        {
          error:
            "Title, gender, surname, firstName, highestQualification, academicRank, and departmentId are required",
        },
        { status: 400 },
      );
    }

    // Enum validation
    if (!VALID_TITLES.includes(title)) {
      return NextResponse.json(
        { error: `Invalid title. Must be one of: ${VALID_TITLES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_GENDERS.includes(gender)) {
      return NextResponse.json(
        {
          error: `Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!VALID_QUALIFICATIONS.includes(highestQualification)) {
      return NextResponse.json(
        {
          error: `Invalid qualification. Must be one of: ${VALID_QUALIFICATIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!VALID_RANKS.includes(academicRank)) {
      return NextResponse.json(
        { error: `Invalid rank. Must be one of: ${VALID_RANKS.join(", ")}` },
        { status: 400 },
      );
    }
    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    // Name validation
    if (!isValidName(surname)) {
      return NextResponse.json(
        {
          error:
            "Invalid surname. Only letters, spaces, hyphens, and apostrophes allowed",
        },
        { status: 400 },
      );
    }
    if (!isValidName(firstName)) {
      return NextResponse.json(
        {
          error:
            "Invalid first name. Only letters, spaces, hyphens, and apostrophes allowed",
        },
        { status: 400 },
      );
    }
    if (middleName && !isValidName(middleName)) {
      return NextResponse.json(
        {
          error:
            "Invalid middle name. Only letters, spaces, hyphens, and apostrophes allowed",
        },
        { status: 400 },
      );
    }

    const staff = await prisma.staff.create({
      data: {
        title,
        gender,
        surname: toTitleCase(surname),
        middleName: middleName ? toTitleCase(middleName) : null,
        firstName: toTitleCase(firstName),
        highestQualification,
        academicRank,
        specialization: specialization || null,
        customJobTitle:
          academicRank === "OTHER" && customJobTitle
            ? toTitleCase(customJobTitle)
            : null,
        email: email || null,
        type: type || "ACADEMIC",
        departmentId,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        ...staff,
        fullName: formatStaffName(staff),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create staff:", error);
    return NextResponse.json(
      { error: "Failed to create staff member" },
      { status: 500 },
    );
  }
}
