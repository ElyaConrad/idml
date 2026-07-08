/**
 * Parse an SVG's `viewBox` (its rendered coordinate extent) from the file bytes.
 *
 * Why it matters for placement: InDesign records a placed SVG's `GraphicBounds` as the
 * CONTENT (ink) bounding box — it auto-crops the artboard padding — but a browser renders
 * the WHOLE viewBox. So a source-pixel crop must be expressed against the viewBox (what is
 * actually drawn), not GraphicBounds, or the ink lands at the wrong scale/offset. Returns
 * `{minX, minY, width, height}` in the SVG's user units, or undefined if there's no usable
 * viewBox. (Only the first 4KB is scanned — the `<svg>` root is always at the very top.)
 */
export function parseSvgViewBox(bytes: ArrayBuffer | Uint8Array): { minX: number; minY: number; width: number; height: number } | undefined {
  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const head = new TextDecoder('utf-8', { fatal: false }).decode(u8.subarray(0, 4096));
    const m = head.match(/<svg\b[^>]*\bviewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/i);
    if (!m) return undefined;
    const [minX, minY, width, height] = [1, 2, 3, 4].map((i) => parseFloat(m[i]));
    if (!(Number.isFinite(minX) && Number.isFinite(minY) && width > 0 && height > 0)) return undefined;
    return { minX, minY, width, height };
  } catch {
    return undefined;
  }
}

export type SvgViewBox = { minX: number; minY: number; width: number; height: number };

/**
 * Force an SVG's intrinsic size to equal its viewBox by writing `width`/`height` on the
 * root `<svg>` (= the viewBox dimensions). Adobe SVGs commonly declare only a `viewBox`, so
 * a browser reports a bogus default intrinsic size (e.g. 300×150) — which breaks a crop
 * expressed in viewBox coordinates (core's `fitImageV2` compares `crop.width` to the measured
 * `imageInfo.width`). With width/height pinned to the viewBox, `imageInfo` == the viewBox ==
 * the crop reference, so the placement is exact. No-op when there's no viewBox.
 */
export function ensureSvgIntrinsicSize(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const vb = parseSvgViewBox(u8);
  if (!vb) return u8;
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    const m = text.match(/<svg\b[^>]*>/i);
    if (!m || m.index === undefined) return u8;
    const tag = m[0].replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '').replace(/^<svg\b/i, `<svg width="${vb.width}" height="${vb.height}"`);
    return new TextEncoder().encode(text.slice(0, m.index) + tag + text.slice(m.index + m[0].length));
  } catch {
    return u8;
  }
}
