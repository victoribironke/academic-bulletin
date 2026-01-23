/**
 * Name and title formatting utilities for ABRMS
 * Enforces standardized name formats across the system
 */

// Title display mapping
const TITLE_DISPLAY: Record<string, string> = {
  MR: "Mr.",
  MRS: "Mrs.",
  MS: "Ms.",
  DR: "Dr.",
  PROF: "Prof.",
  ENGR: "Engr.",
  BARR: "Barr.",
  REV: "Rev.",
  PASTOR: "Pastor",
};

// Academic rank display mapping
const RANK_DISPLAY: Record<string, string> = {
  PROFESSOR: "Professor",
  ASSOCIATE_PROFESSOR: "Associate Professor",
  SENIOR_LECTURER: "Senior Lecturer",
  LECTURER_I: "Lecturer I",
  LECTURER_II: "Lecturer II",
  ASSISTANT_LECTURER: "Assistant Lecturer",
  GRADUATE_ASSISTANT: "Graduate Assistant",
};

// Academic qualification display mapping
const QUALIFICATION_DISPLAY: Record<string, string> = {
  PHD: "Ph.D.",
  MASTERS: "Master's Degree",
  BACHELOR: "Bachelor's Degree",
  HND: "HND",
  OND: "OND",
};

/**
 * Converts a string to sentence case (first letter uppercase, rest lowercase)
 * Used for course titles
 */
export function toSentenceCase(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Converts a string to title case (first letter of each word uppercase)
 * Used for names
 */
export function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Formats a course title to title case
 * Capitalizes first letter of each word EXCEPT prepositions and conjunctions
 * Always capitalizes the first word
 * Preserves acronyms
 *
 * Example: "introduction to computing" → "Introduction to Computing"
 */
export function formatCourseTitle(title: string): string {
  if (!title) return "";

  // Words to keep lowercase (prepositions, conjunctions, articles)
  const lowercaseWords = new Set([
    // Articles
    "a",
    "an",
    "the",
    // Coordinating conjunctions
    "and",
    "but",
    "or",
    "nor",
    "for",
    "yet",
    "so",
    // Common prepositions
    "at",
    "by",
    "in",
    "of",
    "on",
    "to",
    "up",
    "as",
    "if",
    "off",
    "per",
    "via",
    "into",
    "onto",
    "upon",
    "with",
    "from",
    "over",
    "under",
    "about",
    "above",
    "below",
    "between",
    "through",
    "during",
    "before",
    "after",
    "against",
    "among",
    "within",
    "without",
  ]);

  // Common acronyms to preserve (always uppercase)
  const acronyms = new Set([
    "IT",
    "AI",
    "ML",
    "NLP",
    "CS",
    "SE",
    "OS",
    "DB",
    "UI",
    "UX",
    "API",
    "SQL",
    "HTML",
    "CSS",
    "GDS",
    "GST",
    "CPU",
    "GPU",
    "RAM",
    "ROM",
    "LAN",
    "WAN",
    "TCP",
    "IP",
    "HTTP",
    "HTTPS",
    "OOP",
    "DBMS",
    "RDBMS",
    "HCI",
    "GUI",
    "CLI",
    "IDE",
    "SDK",
    "MVC",
    "REST",
    "SOAP",
    "JSON",
    "XML",
    "PHP",
    "CAD",
    "CAM",
    "GIS",
    "GPS",
    "IOT",
    "VR",
    "AR",
    "ERP",
    "CRM",
    "HR",
    "PR",
    "QA",
    "R&D",
    "CEO",
    "CFO",
    "CTO",
    "MBA",
    "BSC",
    "MSC",
    "PHD",
  ]);

  const words = title.trim().toLowerCase().split(/\s+/);

  const formatted = words.map((word, index) => {
    // Check if word (uppercase) is an acronym
    const upperWord = word.toUpperCase();
    if (acronyms.has(upperWord)) {
      return upperWord;
    }

    // Always capitalize the first word
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }

    // Keep prepositions/conjunctions lowercase
    if (lowercaseWords.has(word)) {
      return word;
    }

    // Capitalize first letter of other words
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  return formatted.join(" ");
}

/**
 * Formats a staff member's full name with title
 */
export function formatStaffName(staff: {
  title: string;
  surname: string;
  firstName: string;
  middleName?: string | null;
}): string {
  const titleDisplay = TITLE_DISPLAY[staff.title] || staff.title;
  const middleName = staff.middleName
    ? ` ${toTitleCase(staff.middleName)}`
    : "";

  return `${titleDisplay} ${toTitleCase(staff.surname)}, ${toTitleCase(staff.firstName)}${middleName}`;
}

/**
 * Formats a staff member's name without title (surname, first name)
 */
export function formatStaffNameShort(staff: {
  surname: string;
  firstName: string;
}): string {
  return `${toTitleCase(staff.surname)}, ${toTitleCase(staff.firstName)}`;
}

/**
 * Gets the display string for an academic rank
 */
export function getAcademicRankDisplay(rank: string): string {
  return RANK_DISPLAY[rank] || rank;
}

/**
 * Gets the display string for an academic qualification
 */
export function getQualificationDisplay(qualification: string): string {
  return QUALIFICATION_DISPLAY[qualification] || qualification;
}

/**
 * Gets the display string for a title
 */
export function getTitleDisplay(title: string): string {
  return TITLE_DISPLAY[title] || title;
}

/**
 * Validates that a name contains only allowed characters
 */
export function isValidName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  // Allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  return nameRegex.test(name.trim());
}

/**
 * Validates that a course code follows the expected format
 * e.g., "COS 101", "MTH 201"
 */
export function isValidCourseCode(code: string): boolean {
  if (!code) return false;
  // Format: 3 uppercase letters, space, 3 digits
  const codeRegex = /^[A-Z]{3}\s?\d{3}$/;
  return codeRegex.test(code.trim().toUpperCase());
}

/**
 * Formats a course code to standard format
 */
export function formatCourseCode(code: string): string {
  if (!code) return "";
  const cleaned = code.toUpperCase().replace(/\s+/g, "");
  if (cleaned.length >= 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`;
  }
  return cleaned;
}
