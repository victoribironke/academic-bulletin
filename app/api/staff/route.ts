import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatStaffName,
  isValidName,
  toTitleCase,
} from "@/lib/validation/name-format";
import { canAccessDepartment, requireApiUser } from "@/lib/api-auth";

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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/staff - Get all staff (optionally filtered by department)
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (auth.user.role === "HOD" && !auth.user.departmentId) {
      return NextResponse.json(
        { error: "Your account is not assigned to a department." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const departmentId =
      auth.user.role === "HOD"
        ? auth.user.departmentId
        : searchParams.get("departmentId");
    const type = searchParams.get("type");
    const rank = searchParams.get("rank");
    const qualification = searchParams.get("qualification");

    const where: Record<string, unknown> = { isActive: true };
    if (departmentId) where.departmentId = departmentId;
    if (auth.user.role === "DEAN") {
      if (!auth.user.schoolId) {
        return NextResponse.json(
          { error: "Your account is not assigned to a school." },
          { status: 403 },
        );
      }
      where.department = { schoolId: auth.user.schoolId };
    }
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
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

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

    if (!(await canAccessDepartment(auth.user, departmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
    if (academicRank === "OTHER" && !customJobTitle?.trim()) {
      return NextResponse.json(
        { error: "A job title is required for non-academic staff." },
        { status: 400 },
      );
    }
    if (email?.trim() && !EMAIL_PATTERN.test(email.trim())) {
      return NextResponse.json(
        { error: "Enter a valid staff email address." },
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
        email: email?.trim() || null,
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
