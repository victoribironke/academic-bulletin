"""Extract a reviewable Registry catalogue from official NUC CCMAS PDFs.

The NUC documents are not machine-readable catalogues and do not consistently
state semesters. This script extracts course detail headings, learning outcomes,
and course content; it infers semester 1 for odd course numbers and semester 2
for even course numbers, then records that assumption in a separate review file
so an Academic Planning officer can review it before synchronisation.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader


COURSE_HEADER = re.compile(
    r"(?ms)^\s*(?P<code>[A-Z]{2,5}\s*\d{3})\s*[:\-–]\s*"
    r"(?P<title>.{1,220}?)\s*\((?P<units>\d+)\s*Units?\b(?P<tail>[^)]{0,100})\)",
)
PLAIN_COURSE_HEADER = re.compile(
    r"(?im)^\s*(?P<code>[A-Z]{2,5}\s*\d{3})\s+(?![:\-–])"
    r"(?P<title>[^\n]{1,220}?)\s*\((?P<units>\d+)\s*Units?\b(?P<tail>[^)]{0,100})\)",
)
PROGRAMME_HEADING = re.compile(
    r"(?im)^\s*(?P<degree>"
    r"B\.(?:(?:Sc|A)\.?\s*(?:Ed)\.?|(?:Sc|A|Ed|Eng|Tech|Arch|Agric|NSc|MLS|Pharm|Physio|Rad|Optom))\.?|"
    r"LL\.?B\.?|MBBS|BDS|DVM|Pharm\.?D\.?)"
    r"(?:\s+(?P<name>[^\n]{2,100}))?\s*$"
)


@dataclass
class ExtractedCourse:
    code: str
    title: str
    units: int
    level: int
    semester: int
    learning_outcomes: list[str]
    course_content: str
    source_reference: str
    source_programmes: set[str] = field(default_factory=set)
    variants: list[dict[str, object]] = field(default_factory=list)


HEADING_MARKER = re.compile(
    r"^(?:\d+(?:\.\d+)*\s*)?(?:overview|philosophy|preamble|introduction|"
    r"objectives?|admission requirements?|nomenclature)\b",
    re.I,
)


def programme_name(
    match: re.Match[str], fallback: str, text: str
) -> str | None:
    """Return a real section heading, including at most one wrapped line."""
    raw_name = clean_inline(match.groupdict().get("name") or "")
    name = raw_name
    if not name:
        degree = clean_inline(match.group("degree"))
        degree_key = re.sub(r"[^A-Z]", "", degree.upper())
        degree_programmes = {
            "MBBS": "Medicine and Surgery",
            "BDS": "Dentistry",
            "DVM": "Veterinary Medicine",
            "PHARMD": "Pharmacy",
        }
        name = degree_programmes.get(degree_key, fallback)

    # Prose that happens to begin with a degree abbreviation is not a heading.
    # Real programme names in the CCMAS documents use title case.
    if raw_name:
        first_letter = next((char for char in raw_name if char.isalpha()), "")
        lowered = raw_name.casefold()
        if (
            (first_letter and first_letter.islower())
            or "depending on" in lowered
            or "where relevant" in lowered
            or "where the programme" in lowered
        ):
            return None

    name = re.sub(r"^/\s*B\.\s*Tech\.?\s+", "", name, flags=re.I)
    name = re.sub(
        r"\s+programme\s+is\s+to\b.*$",
        "",
        name,
        flags=re.I,
    )
    name = re.sub(r"\s*\.{3,}\s*\d+\s*$", "", name)
    name = clean_inline(name)
    if not name:
        return None

    remainder = text[match.end() : match.end() + 400]
    following = [line.strip() for line in remainder.splitlines() if line.strip()]
    marker_index = next(
        (index for index, line in enumerate(following[:8]) if HEADING_MARKER.match(line)),
        None,
    )
    if marker_index is None:
        return None

    continuation_lines = [
        line
        for line in following[:marker_index]
        if line.lower() not in {"new", "old"}
        and not re.match(r"^.+\s+\d{1,4}$", line)
    ]
    if continuation_lines:
        continuation = continuation_lines[0]
        if (
            len(continuation) <= 80
            and not re.search(r"\.{3,}", continuation)
            and re.match(r"^[A-Z][A-Za-z &/(),'-]+$", continuation)
        ):
            name = clean_inline(f"{name} {continuation}")
    return name


def clean_inline(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" .\t\r\n")
    value = re.sub(r"\b(?:New|Old)\s*$", "", value).strip()
    return value


def clean_body(value: str, discipline: str) -> str:
    lines: list[str] = []
    page_header = re.compile(rf"^\s*{re.escape(discipline)}\s+\d+\s*$", re.I)
    for raw in value.splitlines():
        line = raw.strip()
        if not line or line in {"New", "Old"} or page_header.match(line):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


STRUCTURAL_BOUNDARY = re.compile(
    r"(?im)^\s*(?:"
    r"(?:100|200|300|400|500|600)\s+Level|"
    r"(?:First|Second)\s+Semester|"
    r"(?:Global\s+)?Course\s+Structure|Minimum\s+Core\s+Courses?|"
    r"Minimum\s+Academic\s+Standards?\b.*|"
    r"Course\s+Code\s+Course\s+Title|"
    r"(?:Course\s+Contents?|Learning\s+Outcomes?)\s+"
    r"(?:and|with)\s+(?:Course\s+Contents?|Learning\s+Outcomes?)"
    r"(?:\s+(?:100|200|300|400|500|600)\s+Level)?"
    r")\s*$"
)


def trim_structural_tail(value: str) -> str:
    """Remove the next level/programme table accidentally captured as content."""
    boundary = STRUCTURAL_BOUNDARY.search(value)
    return value[: boundary.start()].strip() if boundary else value.strip()


def parse_outcomes(value: str) -> list[str]:
    value = re.sub(
        r"(?is)^.*?(?:students? should be able to|student should be able to)\s*:\s*",
        "",
        value,
    )
    chunks = re.split(r"(?m)^\s*\d+[.)]\s*", value)
    outcomes = [clean_inline(chunk) for chunk in chunks if clean_inline(chunk)]
    if len(outcomes) <= 1:
        outcomes = [
            clean_inline(item)
            for item in re.split(r"\s*;\s*", clean_inline(value))
            if clean_inline(item)
        ]
    return outcomes


def programme_positions(text: str, fallback: str) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for match in PROGRAMME_HEADING.finditer(text):
        name = programme_name(match, fallback, text)
        if (
            name
            and len(name) <= 140
            and not name.lower().startswith("programmes")
        ):
            found.append((match.start(), name))
    return sorted(set(found))


def programme_at(positions: list[tuple[int, str]], offset: int, fallback: str) -> str:
    result = fallback
    for position, name in positions:
        if position > offset:
            break
        result = name
    return result


def extract_pdf(
    path: Path, source_url: str | None = None
) -> tuple[list[ExtractedCourse], list[str]]:
    discipline = clean_inline(path.stem.replace("-CCMAS", "").replace("-2023", "").replace("-FINAL", "").replace("-ALL", "").replace("_", " ").replace("-", " "))
    reader = PdfReader(str(path))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    positions = programme_positions(text, discipline)
    candidate_matches = sorted(
        [*COURSE_HEADER.finditer(text), *PLAIN_COURSE_HEADER.finditer(text)],
        key=lambda item: item.start(),
    )
    matches = []
    seen_starts: set[int] = set()
    for candidate in candidate_matches:
        if candidate.start() in seen_starts:
            continue
        seen_starts.add(candidate.start())
        matches.append(candidate)
    courses: list[ExtractedCourse] = []
    issues: list[str] = []

    for index, match in enumerate(matches):
        code = re.sub(r"\s+", " ", match.group("code")).upper()
        title = clean_inline(match.group("title"))
        if (
            not title
            or len(title) > 180
            or "learning outcomes" in title.lower()
            or "course contents" in title.lower()
        ):
            issues.append(f"{path.name}: skipped suspicious heading {code} - {title[:100]}")
            continue
        units = int(match.group("units"))
        if units < 1 or units > 6:
            issues.append(f"{path.name}: skipped {code}; units extracted as {units}")
            continue

        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = trim_structural_tail(
            clean_body(text[match.end() : next_start], discipline)
        )
        outcome_match = re.search(r"(?i)\bLearning Outcomes?\b", body)
        content_match = re.search(r"(?i)\bCourse Contents?\b", body)
        outcomes: list[str] = []
        content = ""
        if outcome_match and content_match and content_match.start() > outcome_match.end():
            outcomes = parse_outcomes(body[outcome_match.end() : content_match.start()])
            content = clean_inline(body[content_match.end() :])
        elif content_match:
            content = clean_inline(body[content_match.end() :])
        else:
            issues.append(f"{path.name}: {code} has no recognised Course Contents heading")

        number = int(re.search(r"\d{3}", code).group())
        source_programme = programme_at(positions, match.start(), discipline)
        source_reference = source_url or f"NUC {discipline} CCMAS - {path.name}"
        courses.append(
            ExtractedCourse(
                code=code,
                title=title,
                units=units,
                level=(number // 100) * 100,
                semester=1 if number % 2 else 2,
                learning_outcomes=outcomes,
                course_content=content,
                source_reference=source_reference,
                source_programmes={source_programme},
                variants=[
                    {
                        "sourceProgramme": source_programme,
                        "title": title,
                        "units": units,
                        "semester": 1 if number % 2 else 2,
                        "learningOutcomes": outcomes,
                        "courseContent": content,
                        "sourceReference": source_reference,
                    }
                ],
            )
        )

    return courses, issues


def extract_task(
    task: tuple[Path, str | None],
) -> tuple[str, list[ExtractedCourse], list[str]]:
    path, source_url = task
    courses, issues = extract_pdf(path, source_url)
    return path.name, courses, issues


CACHE_VERSION = 4


def save_extraction_cache(
    path: Path, courses: list[ExtractedCourse], issues: list[str]
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = []
    for course in courses:
        record = dict(course.__dict__)
        record["source_programmes"] = sorted(course.source_programmes)
        records.append(record)
    path.write_text(
        json.dumps(
            {"version": CACHE_VERSION, "courses": records, "issues": issues},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def load_extraction_cache(
    path: Path,
) -> tuple[list[ExtractedCourse], list[str]] | None:
    if not path.exists():
        return None
    cached = json.loads(path.read_text(encoding="utf-8"))
    if cached.get("version") != CACHE_VERSION:
        return None
    courses = [
        ExtractedCourse(
            **{
                **record,
                "source_programmes": set(record["source_programmes"]),
            }
        )
        for record in cached["courses"]
    ]
    return courses, cached["issues"]


def merge_courses(courses: list[ExtractedCourse]) -> tuple[list[ExtractedCourse], list[str]]:
    merged: dict[str, ExtractedCourse] = {}
    issues: list[str] = []
    for course in courses:
        current = merged.get(course.code)
        if not current:
            merged[course.code] = course
            continue
        current.source_programmes.update(course.source_programmes)
        known_variants = {
            (
                str(variant.get("sourceProgramme", "")).casefold(),
                str(variant.get("title", "")).casefold(),
                int(variant.get("units", 0)),
            )
            for variant in current.variants
        }
        for variant in course.variants:
            key = (
                str(variant.get("sourceProgramme", "")).casefold(),
                str(variant.get("title", "")).casefold(),
                int(variant.get("units", 0)),
            )
            if key not in known_variants:
                current.variants.append(variant)
                known_variants.add(key)
        if current.title.lower() != course.title.lower() or current.units != course.units:
            issues.append(
                f"Conflict for {course.code}: kept '{current.title}' ({current.units} units); "
                f"also found '{course.title}' ({course.units} units)."
            )
        if not current.learning_outcomes and course.learning_outcomes:
            current.learning_outcomes = course.learning_outcomes
        if not current.course_content and course.course_content:
            current.course_content = course.course_content
        if course.source_reference not in current.source_reference:
            current.source_reference += f" | {course.source_reference}"
    return sorted(merged.values(), key=lambda item: (item.level, item.code)), issues


def quarantine_oversized_content(
    courses: list[ExtractedCourse], issues: list[str]
) -> None:
    """Do not publish text that likely crossed a programme boundary in the PDF."""
    for course in courses:
        if len(course.course_content) > 8_000:
            issues.append(
                f"{course.code} course content exceeded 8,000 characters and was held for review."
            )
            course.course_content = ""
        for variant in course.variants:
            content = str(variant.get("courseContent", ""))
            if len(content) > 8_000:
                variant["courseContent"] = ""


def catalogue_record(course: ExtractedCourse) -> dict[str, object]:
    return {
        "code": course.code,
        "title": course.title,
        "units": course.units,
        "type": "CORE",
        "ownership": "INSTITUTIONAL",
        "level": course.level,
        "semester": course.semester,
        "description": "",
        "learningOutcomes": course.learning_outcomes,
        "courseContent": course.course_content,
        "labWork": "",
        "entrepreneurialAspect": "",
        "curriculumSource": "CCMAS 2023",
        "sourceReference": course.source_reference,
        "sourceProgrammes": sorted(course.source_programmes),
        "variants": course.variants,
        "discoverable": True,
    }


def write_catalogue(
    output: Path,
    courses: list[ExtractedCourse],
    issues: list[str],
    source_counts: Counter[str],
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "version": "CCMAS 2023",
                "semesterBasis": "Course-code parity: odd numbers are semester 1 and even numbers are semester 2.",
                "courses": [catalogue_record(course) for course in courses],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    review_output = output.with_name(f"{output.stem}-review.json")
    review_output.write_text(
        json.dumps(
            {
                "extractedUniqueCourses": len(courses),
                "itemsRequiringReview": len(issues),
                "sourceCounts": dict(sorted(source_counts.items())),
                "issues": issues,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--sources", type=Path)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--cache-dir", type=Path, default=Path("tmp/ccmas-extracted"))
    args = parser.parse_args()

    pdfs = sorted(args.pdf_dir.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDF files found in {args.pdf_dir}")

    all_courses: list[ExtractedCourse] = []
    all_issues: list[str] = []
    source_counts: Counter[str] = Counter()
    source_urls: dict[str, str] = {}
    if args.sources:
        source_manifest = json.loads(args.sources.read_text(encoding="utf-8"))
        source_urls = {item["file"]: item["url"] for item in source_manifest}
    extracted_by_file: dict[str, tuple[list[ExtractedCourse], list[str]]] = {}
    tasks: list[tuple[Path, str | None]] = []
    for pdf in pdfs:
        cached = load_extraction_cache(args.cache_dir / f"{pdf.stem}.json")
        if cached:
            extracted_by_file[pdf.name] = cached
            print(f"Using cached extraction: {pdf.name}", flush=True)
        else:
            tasks.append((pdf, source_urls.get(pdf.name)))

    if tasks:
        worker_count = max(1, min(args.workers, len(tasks)))
        with ProcessPoolExecutor(max_workers=worker_count) as executor:
            futures = {executor.submit(extract_task, task): task[0] for task in tasks}
            for future in as_completed(futures):
                filename, courses, issues = future.result()
                extracted_by_file[filename] = (courses, issues)
                save_extraction_cache(
                    args.cache_dir / f"{Path(filename).stem}.json",
                    courses,
                    issues,
                )
                print(
                    f"Extracted {filename}: {len(courses)} course headings",
                    flush=True,
                )

    for pdf in pdfs:
        courses, issues = extracted_by_file[pdf.name]
        all_courses.extend(courses)
        all_issues.extend(issues)
        source_counts[pdf.name] = len(courses)

    merged, merge_issues = merge_courses(all_courses)
    all_issues.extend(merge_issues)
    quarantine_oversized_content(merged, all_issues)
    write_catalogue(args.output, merged, all_issues, source_counts)
    print(f"Extracted {len(merged)} unique CCMAS courses from {len(pdfs)} document(s).")
    print(f"Review items: {len(all_issues)}")
    print(f"Catalogue: {args.output}")


if __name__ == "__main__":
    main()
