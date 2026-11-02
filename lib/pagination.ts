export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** Reads `page` and `pageSize` from a request's query string, with safe bounds. */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE,
) {
  const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(5, Math.floor(Number(searchParams.get("pageSize")) || defaultPageSize)),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
