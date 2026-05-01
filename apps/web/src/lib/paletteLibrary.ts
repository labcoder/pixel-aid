import { createGplPaletteFile, createHexPaletteFile, createPaletteJsonFile } from "@pixelaid/exporters";
import { normalizePaletteHex } from "./paletteControls";

export type PaletteImportFormat = "hex" | "gpl" | "json";
export type PaletteDuplicateMode = "dedupe" | "keep";
export type PaletteIssueSeverity = "error" | "warning";

export type PaletteValidationIssue = {
  code: "missing-name" | "invalid-color" | "duplicate-color" | "empty-palette" | "invalid-json";
  message: string;
  severity: PaletteIssueSeverity;
};

export type PaletteLibraryEntry = {
  id: string;
  name: string;
  colors: string[];
  sourceFormat: PaletteImportFormat;
};

export type PaletteImportOptions = {
  duplicates?: PaletteDuplicateMode;
};

export type PaletteImportResult = {
  entry: PaletteLibraryEntry;
  issues: PaletteValidationIssue[];
};

const GPL_RGB_LINE_PATTERN = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+.*)?$/;

export function importPaletteLibraryEntry(
  fallbackName: string,
  text: string,
  format: PaletteImportFormat,
  options: PaletteImportOptions = {}
): PaletteImportResult {
  const parsed = parsePaletteTextByFormat(text, format);
  const name = parsed.name?.trim() || fallbackName.trim() || "Untitled Palette";
  const issues = [...parsed.issues];
  const colors = applyDuplicateMode(parsed.colors, options.duplicates ?? "dedupe", issues);
  const entry = createPaletteLibraryEntry(name, colors, format);

  return {
    entry,
    issues: [...issues, ...validatePaletteLibraryEntry(entry).filter((issue) => issue.code !== "duplicate-color")]
  };
}

export function exportPaletteLibraryEntry(entry: PaletteLibraryEntry, format: PaletteImportFormat): string {
  if (format === "hex") {
    return createHexPaletteFile(entry.colors);
  }

  if (format === "gpl") {
    return createGplPaletteFile(entry.colors, { name: entry.name });
  }

  return `${JSON.stringify(createPaletteJsonFile(entry.colors), null, 2)}\n`;
}

export function validatePaletteLibraryEntry(entry: PaletteLibraryEntry): PaletteValidationIssue[] {
  const issues: PaletteValidationIssue[] = [];
  const seen = new Set<string>();

  if (!entry.name.trim()) {
    issues.push({
      code: "missing-name",
      message: "Palette name is required.",
      severity: "error"
    });
  }

  for (let index = 0; index < entry.colors.length; index += 1) {
    const normalized = normalizePaletteHex(entry.colors[index] ?? "");
    if (!normalized) {
      issues.push({
        code: "invalid-color",
        message: `Color at index ${index} is not a valid RGB hex color.`,
        severity: "error"
      });
      continue;
    }

    if (seen.has(normalized)) {
      issues.push({
        code: "duplicate-color",
        message: `Palette contains duplicate color ${normalized}.`,
        severity: "warning"
      });
    } else {
      seen.add(normalized);
    }
  }

  if (entry.colors.length === 0) {
    issues.push({
      code: "empty-palette",
      message: "Palette must contain at least one color.",
      severity: "error"
    });
  }

  return issues;
}

export function renamePalette(entry: PaletteLibraryEntry, name: string): PaletteLibraryEntry {
  const trimmed = name.trim();
  return {
    ...entry,
    id: createPaletteId(trimmed || entry.name),
    name: trimmed
  };
}

export function addPaletteColor(entry: PaletteLibraryEntry, color: string, index = entry.colors.length): PaletteLibraryEntry {
  assertInsertIndex(entry.colors, index);
  const normalized = requirePaletteColor(color);
  return {
    ...entry,
    colors: [...entry.colors.slice(0, index), normalized, ...entry.colors.slice(index)]
  };
}

export function updatePaletteColor(entry: PaletteLibraryEntry, index: number, color: string): PaletteLibraryEntry {
  assertColorIndex(entry.colors, index);
  const normalized = requirePaletteColor(color);
  const colors = [...entry.colors];
  colors[index] = normalized;
  return { ...entry, colors };
}

export function removePaletteColor(entry: PaletteLibraryEntry, index: number): PaletteLibraryEntry {
  assertColorIndex(entry.colors, index);
  return {
    ...entry,
    colors: entry.colors.filter((_, colorIndex) => colorIndex !== index)
  };
}

export function reorderPaletteColor(entry: PaletteLibraryEntry, fromIndex: number, toIndex: number): PaletteLibraryEntry {
  assertColorIndex(entry.colors, fromIndex);
  assertColorIndex(entry.colors, toIndex);

  const colors = [...entry.colors];
  const [color] = colors.splice(fromIndex, 1);
  if (color === undefined) {
    throw new Error(`Color index ${fromIndex} is out of range.`);
  }
  colors.splice(toIndex, 0, color);
  return { ...entry, colors };
}

function createPaletteLibraryEntry(name: string, colors: string[], sourceFormat: PaletteImportFormat): PaletteLibraryEntry {
  return {
    id: createPaletteId(name),
    name,
    colors,
    sourceFormat
  };
}

function parsePaletteTextByFormat(
  text: string,
  format: PaletteImportFormat
): { name?: string; colors: string[]; issues: PaletteValidationIssue[] } {
  if (format === "gpl") {
    return parseGplPaletteText(text);
  }

  if (format === "json") {
    return parseJsonPaletteText(text);
  }

  return {
    colors: parseHexPaletteText(text),
    issues: []
  };
}

function parseHexPaletteText(text: string): string[] {
  const colors: string[] = [];

  for (const token of text.split(/[\s,;]+/)) {
    const normalized = normalizePaletteHex(token);
    if (normalized) {
      colors.push(normalized);
    }
  }

  return colors;
}

function parseGplPaletteText(text: string): { name?: string; colors: string[]; issues: PaletteValidationIssue[] } {
  const colors: string[] = [];
  let name: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Name:")) {
      name = trimmed.slice("Name:".length).trim();
      continue;
    }

    const match = GPL_RGB_LINE_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const red = Number.parseInt(match[1] ?? "", 10);
    const green = Number.parseInt(match[2] ?? "", 10);
    const blue = Number.parseInt(match[3] ?? "", 10);
    if (red > 255 || green > 255 || blue > 255) {
      continue;
    }

    colors.push(toHexColor(red, green, blue));
  }

  return name === undefined ? { colors, issues: [] } : { name, colors, issues: [] };
}

function parseJsonPaletteText(text: string): { name?: string; colors: string[]; issues: PaletteValidationIssue[] } {
  try {
    const parsed: unknown = JSON.parse(text);
    const colorsSource = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.colors)
        ? parsed.colors
        : [];
    const name = isRecord(parsed) && typeof parsed.name === "string" ? parsed.name : undefined;

    const result = {
      colors: colorsSource.flatMap((color) => {
        if (typeof color !== "string") {
          return [];
        }

        const normalized = normalizePaletteHex(color);
        return normalized ? [normalized] : [];
      }),
      issues: []
    };
    return name === undefined ? result : { ...result, name };
  } catch {
    return {
      colors: [],
      issues: [
        {
          code: "invalid-json",
          message: "Palette JSON could not be parsed.",
          severity: "error"
        }
      ]
    };
  }
}

function applyDuplicateMode(
  colors: string[],
  duplicates: PaletteDuplicateMode,
  issues: PaletteValidationIssue[]
): string[] {
  if (duplicates === "keep") {
    return colors;
  }

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const color of colors) {
    if (seen.has(color)) {
      issues.push({
        code: "duplicate-color",
        message: `Duplicate color ${color} was ignored.`,
        severity: "warning"
      });
      continue;
    }

    seen.add(color);
    deduped.push(color);
  }

  return deduped;
}

function createPaletteId(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "palette";
}

function requirePaletteColor(color: string): string {
  const normalized = normalizePaletteHex(color);
  if (!normalized) {
    throw new Error(`${color} is not a valid RGB hex color.`);
  }

  return normalized;
}

function assertColorIndex(colors: readonly string[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= colors.length) {
    throw new Error(`Color index ${index} is out of range.`);
  }
}

function assertInsertIndex(colors: readonly string[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > colors.length) {
    throw new Error(`Color index ${index} is out of range.`);
  }
}

function toHexColor(red: number, green: number, blue: number): string {
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
