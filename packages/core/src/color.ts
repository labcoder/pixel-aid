import type { ColorSpace } from "@pixelaid/shared";
import type { RgbaTuple } from "./image";

export type ColorVector = {
  x: number;
  y: number;
  z: number;
};

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

export function normalizeColorSpace(value: ColorSpace | undefined): ColorSpace {
  return value === "cielab" || value === "srgb" || value === "oklab" ? value : "oklab";
}

export function srgbByteToLinear(value: number): number {
  const normalized = Math.max(0, Math.min(255, value)) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgbByte(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return clampByte(encoded * 255);
}

export function rgbToOklab(color: number): ColorVector {
  return rgbChannelsToOklab((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
}

export function rgbChannelsToOklab(r8: number, g8: number, b8: number): ColorVector {
  const r = srgbByteToLinear(r8);
  const g = srgbByteToLinear(g8);
  const b = srgbByteToLinear(b8);
  return linearRgbToOklab(r, g, b);
}

export function linearRgbToOklab(r: number, g: number, b: number): ColorVector {
  // Bjorn Ottosson's OKLab transform. The LMS cube root gives a nearly perceptual,
  // D65-referenced space while remaining numerically stable for all in-gamut sRGB values.
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    x: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    y: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    z: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  };
}

export function oklabToRgb(lab: ColorVector): number {
  return oklabChannelsToRgb(lab.x, lab.y, lab.z);
}

export function oklabChannelsToRgb(l: number, a: number, b: number): number {
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const blue = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return (linearToSrgbByte(r) << 16) | (linearToSrgbByte(g) << 8) | linearToSrgbByte(blue);
}

export function rgbToXyzD65(color: number): ColorVector {
  const r = srgbByteToLinear((color >> 16) & 0xff);
  const g = srgbByteToLinear((color >> 8) & 0xff);
  const b = srgbByteToLinear(color & 0xff);
  return linearRgbToXyzD65(r, g, b);
}

export function linearRgbToXyzD65(r: number, g: number, b: number): ColorVector {
  // sRGB -> XYZ matrix for D65, scaled to the conventional 0..100 XYZ domain used by CIELAB.
  return {
    x: (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100,
    y: (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100,
    z: (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100
  };
}

export function xyzD65ToRgb(xyz: ColorVector): number {
  const x = xyz.x / 100;
  const y = xyz.y / 100;
  const z = xyz.z / 100;
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return (linearToSrgbByte(r) << 16) | (linearToSrgbByte(g) << 8) | linearToSrgbByte(b);
}

const D65_X = 95.047;
const D65_Y = 100;
const D65_Z = 108.883;
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

export function rgbToCielab(color: number): ColorVector {
  return xyzD65ToCielab(rgbToXyzD65(color));
}

export function xyzD65ToCielab(xyz: ColorVector): ColorVector {
  const fx = labPivot(xyz.x / D65_X);
  const fy = labPivot(xyz.y / D65_Y);
  const fz = labPivot(xyz.z / D65_Z);
  return {
    x: 116 * fy - 16,
    y: 500 * (fx - fy),
    z: 200 * (fy - fz)
  };
}

export function cielabToRgb(lab: ColorVector): number {
  return xyzD65ToRgb(cielabToXyzD65(lab));
}

export function cielabToXyzD65(lab: ColorVector): ColorVector {
  const fy = (lab.x + 16) / 116;
  const fx = fy + lab.y / 500;
  const fz = fy - lab.z / 200;
  return {
    x: D65_X * labPivotInverse(fx),
    y: D65_Y * labPivotInverse(fy),
    z: D65_Z * labPivotInverse(fz)
  };
}

function labPivot(value: number): number {
  return value > LAB_EPSILON ? Math.cbrt(value) : (LAB_KAPPA * value + 16) / 116;
}

function labPivotInverse(value: number): number {
  const cubed = value * value * value;
  return cubed > LAB_EPSILON ? cubed : (116 * value - 16) / LAB_KAPPA;
}

export function rgbToColorSpace(color: number, colorSpace: ColorSpace = "oklab"): ColorVector {
  if (colorSpace === "srgb") {
    return { x: (color >> 16) & 0xff, y: (color >> 8) & 0xff, z: color & 0xff };
  }
  return colorSpace === "cielab" ? rgbToCielab(color) : rgbToOklab(color);
}

export function colorSpaceToRgb(vector: ColorVector, colorSpace: ColorSpace = "oklab"): number {
  if (colorSpace === "srgb") {
    return (clampByte(vector.x) << 16) | (clampByte(vector.y) << 8) | clampByte(vector.z);
  }
  return colorSpace === "cielab" ? cielabToRgb(vector) : oklabToRgb(vector);
}

export function perceptualColorDistanceSq(a: number, b: number, colorSpace: ColorSpace = "oklab"): number {
  if (colorSpace === "srgb") {
    return colorDistanceSq(a, b);
  }
  const av = rgbToColorSpace(a, colorSpace);
  const bv = rgbToColorSpace(b, colorSpace);
  const dx = av.x - bv.x;
  const dy = av.y - bv.y;
  const dz = av.z - bv.z;
  return dx * dx + dy * dy + dz * dz;
}
