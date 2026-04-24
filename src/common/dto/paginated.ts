export interface PageMeta {
  total: number;
  page: number;
  perPage: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export const paginated = <T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
): Paginated<T> => ({ data, meta: { total, page, perPage } });
