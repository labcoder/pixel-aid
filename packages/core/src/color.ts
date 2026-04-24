import type { RgbaTuple } from "./image";

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function quantizeToFiveBits(value: number): number {
  return clampByte(value) & 0xf8;
}

export function packQuantizedRgb(r: number, g: number, b: number): number {
  return (quantizeToFiveBits(r) << 16) | (quantizeToFiveBits(g) << 8) | quantizeToFiveBits(b);
}

export function unpackRgb(color: number, alpha = 255): RgbaTuple {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, alpha];
}

export function rgbToHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function parseHexColor(hex: string): number {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid color ${hex}`);
  }

  return Number.parseInt(normalized, 16);
}

export function colorDistanceSq(a: number, b: number): number {
  const dr = ((a >> 16) & 0xff) - ((b >> 16) & 0xff);
  const dg = ((a >> 8) & 0xff) - ((b >> 8) & 0xff);
  const db = (a & 0xff) - (b & 0xff);
  return dr * dr + dg * dg + db * db;
}
