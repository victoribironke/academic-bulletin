/**
 * The General Education block (rule W1, work order section 6.1): the courses
 * every student takes, set centrally by the General Education desk. Every
 * draft carries the block for every level its programme runs. A Head of
 * Department cannot edit or delete its rows, and they never count as the
 * Head's progress.
 *
 * The table below is the standard. A programme that leaves a course out, or
 * swaps another in (for example ENT 322 or BU-GST 420), needs an exemption
 * recorded by DAP with a reason.
 */

export type GeneralEducationCourse = {
  level: number;
  semester: 1 | 2;
  code: string;
  title: string;
  units: number;
};

const CITIZENSHIP_ORIENTATION = "Citizenship Orientation";

/** Section 6.1, levels 100 to 500 (500 for five-year programmes). */
export const GENERAL_EDUCATION_BLOCK: readonly GeneralEducationCourse[] = [
  { level: 100, semester: 1, code: "GST 111", title: "Communication in English", units: 2 },
  { level: 100, semester: 1, code: "BU-GST 105", title: "Use of Library and Study Skills", units: 2 },
  { level: 100, semester: 1, code: "BU-GST 120", title: "ICT Fundamentals and Office Productivity Management", units: 1 },
  { level: 100, semester: 1, code: "BU-GST 011", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 100, semester: 2, code: "GST 112", title: "Nigerian Peoples and Culture", units: 2 },
  { level: 100, semester: 2, code: "BU-GST 112", title: "Health Principles", units: 1 },
  { level: 100, semester: 2, code: "BU-GST 126", title: "Life and Teachings of Christ the Messiah", units: 3 },
  { level: 100, semester: 2, code: "BU-GST 012", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 200, semester: 1, code: "ENT 211", title: "Entrepreneurship and Innovation", units: 2 },
  { level: 200, semester: 1, code: "BU-GST 215", title: "Adventist Heritage", units: 3 },
  { level: 200, semester: 1, code: "BU-GST 221", title: "Introduction to Agriculture", units: 1 },
  { level: 200, semester: 1, code: "BU-GST 290", title: "Introduction to Data Analytics", units: 1 },
  { level: 200, semester: 1, code: "BU-GST 021", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 200, semester: 2, code: "GST 212", title: "Philosophy, Logic and Human Existence", units: 2 },
  { level: 200, semester: 2, code: "BU-GST 200", title: "Communication in French", units: 1 },
  { level: 200, semester: 2, code: "BU-GST 220", title: "Origins and Science", units: 1 },
  { level: 200, semester: 2, code: "BU-GST 022", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 300, semester: 1, code: "BU-GST 317", title: "Fundamentals of Christian Faith", units: 3 },
  { level: 300, semester: 1, code: "BU-GST 310", title: "Data Analysis using Advanced Excel, SPSS, Power BI or Tableau", units: 1 },
  { level: 300, semester: 1, code: "BU-GST 031", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 300, semester: 2, code: "GST 312", title: "Peace and Conflict Resolution", units: 2 },
  { level: 300, semester: 2, code: "ENT 312", title: "Venture Creation", units: 2 },
  { level: 300, semester: 2, code: "BU-GST 312", title: "Family Life", units: 1 },
  { level: 300, semester: 2, code: "BU-GST 032", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 400, semester: 1, code: "BU-GST 440", title: "E-Project Management and Simulation", units: 1 },
  { level: 400, semester: 1, code: "BU-GST 041", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 400, semester: 2, code: "BU-GST 400", title: "Religion and Social Ethics", units: 3 },
  { level: 400, semester: 2, code: "BU-GST 042", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 500, semester: 1, code: "BU-GST 051", title: CITIZENSHIP_ORIENTATION, units: 0 },
  { level: 500, semester: 2, code: "BU-GST 500", title: "Seminar on Adventist Heritage", units: 3 },
  { level: 500, semester: 2, code: "BU-GST 540", title: "Introduction to Digital Marketing", units: 1 },
  { level: 500, semester: 2, code: "BU-GST 052", title: CITIZENSHIP_ORIENTATION, units: 0 },
];

/** Shown on the block's rows in the Course Structure. */
export const GENERAL_EDUCATION_LABEL = "General Education: every student takes this";

/** Citizenship Orientation is 0 units every semester at every level: BU-GST 0L1 and 0L2. */
const CITIZENSHIP_CODE = /^BU-GST 0[1-9][12]$/;

const BLOCK_CODES: ReadonlySet<string> = new Set(GENERAL_EDUCATION_BLOCK.map((course) => course.code));

/** The levels a programme runs: 100 up to its length in years, or the highest level listed. */
export function programmeLevels(durationYears: number | null | undefined, listedLevels: number[] = []): number[] {
  const years = durationYears && durationYears > 0 ? durationYears : 4;
  const highest = Math.max(years * 100, ...listedLevels.filter((level) => Number.isInteger(level / 100)));
  const levels: number[] = [];
  for (let level = 100; level <= Math.min(highest, 900); level += 100) levels.push(level);
  return levels;
}

/** The block for the given levels, with Citizenship Orientation for levels past 500. */
export function generalEducationBlockFor(levels: number[]): GeneralEducationCourse[] {
  const wanted = new Set(levels);
  const block = GENERAL_EDUCATION_BLOCK.filter((course) => wanted.has(course.level));
  for (const level of [...wanted].filter((item) => item > 500).sort((a, b) => a - b)) {
    const digit = level / 100;
    block.push(
      { level, semester: 1, code: `BU-GST 0${digit}1`, title: CITIZENSHIP_ORIENTATION, units: 0 },
      { level, semester: 2, code: `BU-GST 0${digit}2`, title: CITIZENSHIP_ORIENTATION, units: 0 },
    );
  }
  return block;
}

/** True for a course code in the block (at any level). */
export function isGeneralEducationCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const key = code.trim().toUpperCase();
  return BLOCK_CODES.has(key) || CITIZENSHIP_CODE.test(key);
}

/**
 * True for a course from the General Education family (GST, BU-GST, ENT)
 * that isn't in the block: a programme keeps one only with a DAP exemption.
 */
export function isGeneralEducationFamily(code: string | null | undefined): boolean {
  return Boolean(code) && /^(GST|BU-GST|ENT) \d{3}$/.test(code!.trim().toUpperCase());
}

/** A Registry course run by the General Education desk (GST and BU-GST types). */
export function isGeneralEducationMaster(
  master: { type: string; ownership: string } | null | undefined,
): boolean {
  return Boolean(master) && master!.ownership === "INSTITUTIONAL" && ["GST_NUC", "GST_BU"].includes(master!.type);
}

/**
 * A draft's course row that belongs to the General Education block: locked,
 * and never the Head of Department's progress. Rows are recognised by their
 * code too, so the block is locked even before its Registry records exist.
 */
export function isGeneralEducationCourse(course: {
  code: string;
  masterCourse?: { type: string; ownership: string } | null;
}): boolean {
  return isGeneralEducationMaster(course.masterCourse) || isGeneralEducationCode(course.code);
}

export const GENERAL_EDUCATION_LOCKED_MESSAGE =
  "General Education courses are set by the General Education desk for every programme, so they can't be changed or removed here (rule W1). Ask DAP if one is wrong.";
