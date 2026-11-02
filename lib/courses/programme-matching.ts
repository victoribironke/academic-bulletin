export type MatchableProgramme = {
  id: string;
  name: string;
  code?: string | null;
  degreeType?: string | null;
};

export type ProgrammeNameMatch = {
  matchedIds: string[];
  unmatchedNames: string[];
  ambiguousNames: string[];
};

const DEGREE_PREFIXES = [
  "bachelor of science",
  "bachelor of arts",
  "bachelor of education",
  "bachelor of engineering",
  "bachelor of technology",
  "bachelor of agriculture",
  "bachelor of nursing science",
  "bachelor of pharmacy",
  "b sc",
  "b a",
  "b ed",
  "b eng",
  "b tech",
  "b agric",
  "b nsc",
  "ll b",
  "pharm d",
];

export function normaliseProgrammeName(value: string): string {
  let normalised = value
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  for (const prefix of DEGREE_PREFIXES) {
    if (normalised === prefix) return normalised;
    if (normalised.startsWith(`${prefix} `)) {
      normalised = normalised.slice(prefix.length + 1).trim();
      break;
    }
  }

  return normalised
    .replace(/\b(?:hons|honours|honors|programme|program)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchProgrammeNames(
  sourceNames: string[],
  programmes: MatchableProgramme[],
): ProgrammeNameMatch {
  const candidates = new Map<string, Set<string>>();
  for (const programme of programmes) {
    const names = [
      programme.name,
      programme.degreeType
        ? `${programme.degreeType} ${programme.name}`
        : programme.name,
    ];
    for (const name of names) {
      const key = normaliseProgrammeName(name);
      if (!key) continue;
      const ids = candidates.get(key) ?? new Set<string>();
      ids.add(programme.id);
      candidates.set(key, ids);
    }
  }

  const matchedIds = new Set<string>();
  const unmatchedNames: string[] = [];
  const ambiguousNames: string[] = [];

  for (const sourceName of sourceNames) {
    const key = normaliseProgrammeName(sourceName);
    const ids = key ? candidates.get(key) : undefined;
    if (!ids || ids.size === 0) {
      unmatchedNames.push(sourceName);
    } else if (ids.size > 1) {
      ambiguousNames.push(sourceName);
    } else {
      matchedIds.add([...ids][0]);
    }
  }

  return {
    matchedIds: [...matchedIds],
    unmatchedNames,
    ambiguousNames,
  };
}
