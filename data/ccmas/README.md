# CCMAS catalogue

`catalogue.json` is generated from the 17 official NUC CCMAS discipline PDFs
listed in `sources.json`. It contains the central Registry values, official
programme names, and programme-specific variants where the same course code
has different values in different programmes.

The source documents do not consistently identify semesters. The extractor
uses the common course-code convention: odd course numbers are semester 1 and
even course numbers are semester 2. Academic Planning should review the items
in `catalogue-review.json`, particularly title/unit conflicts and missing
course-content headings.

Administrators can load or refresh the catalogue from the Registry page. A
deployment operator can perform the same idempotent operation with:

```powershell
bun run db:sync-ccmas
```

Only exact, unambiguous programme-name matches are linked automatically.
Unusually broad source headings and extracted descriptions longer than 8,000
characters are held for manual review instead of being assigned or published
as trusted course text. Their courses still remain in the central Registry and
can be reviewed and linked later.
