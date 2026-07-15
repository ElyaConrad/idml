import { base64ToArrayBuffer } from '../../util/arrayBuffer.js';
import { CMYK_LUT_BASE64, CMYK_LUT_GRID_SIZE } from '../../assets/CMYK_LUT.js';

/**
 * CMYK -> sRGB colour management.
 *
 * InDesign converts a CMYK swatch through the document's declared CMYK working profile
 * (`CMYKProfile` on the `<Document>` root of designmap.xml — almost always
 * "U.S. Web Coated (SWOP) v2", InDesign's out-of-the-box default) into sRGB for on-screen
 * display and RGB export. The naive device formula
 * (`r = 255·(1−c)·(1−k)` …) that idml used previously is NOT calibrated to any real press
 * condition and diverges sharply from InDesign for saturated colours — e.g. 100% cyan is
 * (0,255,255) naively vs InDesign's actual (0,174,239).
 *
 * This module ships a LOOKUP TABLE generated at build time (see
 * `scripts/generate-cmyk-lut.mjs`, output `assets/CMYK_LUT.ts`) by running the real SWOP v2
 * ICC profile through LittleCMS (Relative Colorimetric + Black Point Compensation — the
 * combination verified to reproduce InDesign's actual pixels exactly for the pure C/M/Y
 * primaries; see the generator script's header comment). The published package ships only
 * this derived numeric table — no WASM, no .icc file, no runtime color-management engine.
 * `cmykToSrgb` does pure-JS quadrilinear interpolation over the grid.
 *
 * This is unconditionally the best available default: even a document that declares a
 * different CMYK profile (FOGRA, GRACoL, …) still gets a categorically closer conversion
 * from the SWOP LUT than the uncalibrated naive formula, since both are targeting the same
 * general coated-stock CMYK gamut. `noteDocumentCmykProfile` only logs a heads-up when the
 * declared profile isn't a recognized SWOP alias — it never gates which formula runs.
 */

let lut: Uint8Array | null = null;
function getLut(): Uint8Array {
  if (!lut) lut = new Uint8Array(base64ToArrayBuffer(CMYK_LUT_BASE64));
  return lut;
}

const N = CMYK_LUT_GRID_SIZE;

/**
 * InDesign's default "Display All Blacks as Rich Black" preference overrides the
 * ICC-accurate conversion for solid K-only black: the SWOP-accurate conversion of
 * 0/0/0/100 is a dark gray (~35,31,32 — real ink on real stock isn't absolute black), but
 * InDesign shows/exports it as pure (0,0,0) on screen. Verified against feat-cmyk ground
 * truth. Only fires for PURE K black (C=M=Y=0, K effectively 100) — a rich/mixed black
 * (e.g. 30/20/20/100) still goes through the real ICC conversion, matching InDesign.
 */
function richBlackOverride(c: number, m: number, y: number, k: number): [number, number, number] | null {
  return c <= 0.05 && m <= 0.05 && y <= 0.05 && k >= 99.5 ? [0, 0, 0] : null;
}

/** Quadrilinear (4D linear) interpolation over the CMYK grid. c/m/y/k in 0..100. */
export function cmykToSrgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const override = richBlackOverride(c, m, y, k);
  if (override) return override;

  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const grid = (v: number) => (clamp(v) / 100) * (N - 1);
  const [gc, gm, gy, gk] = [grid(c), grid(m), grid(y), grid(k)];
  const c0 = Math.floor(gc), c1 = Math.min(c0 + 1, N - 1), fc = gc - c0;
  const m0 = Math.floor(gm), m1 = Math.min(m0 + 1, N - 1), fm = gm - m0;
  const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, N - 1), fy = gy - y0;
  const k0 = Math.floor(gk), k1 = Math.min(k0 + 1, N - 1), fk = gk - k0;

  const table = getLut();
  let r = 0, g = 0, b = 0;
  for (const [ci, wc] of [[c0, 1 - fc], [c1, fc]] as const) {
    for (const [mi, wm] of [[m0, 1 - fm], [m1, fm]] as const) {
      for (const [yi, wy] of [[y0, 1 - fy], [y1, fy]] as const) {
        for (const [ki, wk] of [[k0, 1 - fk], [k1, fk]] as const) {
          const w = wc * wm * wy * wk;
          if (w === 0) continue;
          const idx = ((ci * N + mi) * N + yi) * N + ki;
          r += table[idx * 3] * w;
          g += table[idx * 3 + 1] * w;
          b += table[idx * 3 + 2] * w;
        }
      }
    }
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// InDesign's exact profile-name string plus common punctuation/version variants seen
// across IDML versions. Any other declared profile still uses the SWOP LUT (see module
// doc) — this only decides whether to log a heads-up.
const KNOWN_SWOP_PROFILES = new Set(['u.s. web coated (swop) v2', 'u.s. web coated (swop) v3', 'us web coated (swop) v2', 'us web coated (swop) v3']);

let notedProfiles: Set<string> | null = null;
/**
 * Log (once per distinct profile name per process) when a document's declared CMYKProfile
 * isn't a recognized SWOP alias. Informational only — `cmykToSrgb` always uses the SWOP LUT
 * regardless, since it's still strictly better than the naive formula for any coated-stock
 * CMYK document. Call once per document at the top of the convert pipeline.
 */
export function noteDocumentCmykProfile(profileName: string | undefined): void {
  if (!profileName) return;
  const key = profileName.trim().toLowerCase();
  if (KNOWN_SWOP_PROFILES.has(key)) return;
  notedProfiles ??= new Set();
  if (notedProfiles.has(key)) return;
  notedProfiles.add(key);
  console.log(`[idml] document CMYK profile "${profileName}" is not SWOP v2/v3 — using the SWOP-derived LUT as the closest available approximation (no profile-specific LUT is bundled).`);
}
