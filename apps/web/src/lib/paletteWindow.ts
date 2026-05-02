export type PaletteWindowOptions = {
  page: number;
  pageSize: number;
};

export type PaletteWindow = {
  colors: string[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
};

export function getPaletteWindow(colors: readonly string[], options: PaletteWindowOptions): PaletteWindow {
  const total = colors.length;
  const pageSize = Number.isFinite(options.pageSize) && options.pageSize > 0 ? Math.floor(options.pageSize) : Math.max(1, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(options.page)));
  const start = Math.min(total, page * pageSize);
  const end = Math.min(total, start + pageSize);

  return {
    colors: colors.slice(start, end),
    page,
    pageCount,
    start,
    end,
    total
  };
}
