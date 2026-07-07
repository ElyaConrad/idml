import type * as Template from '../serial/serial-types.js';

/**
 * Make provided font bytes available to text MEASUREMENT before conversion runs.
 *
 * The point is atomicity: bluepic-core measures text against whatever font set is
 * registered in the ambient canvas registry — `document.fonts` in the browser,
 * skia's `FontLibrary` under headless. If a font isn't there yet, measureText
 * silently returns FALLBACK metrics and the converter bakes wrong geometry (the
 * ascent shift, auto-wrap). So we register the bytes into that SAME registry and
 * AWAIT real availability first; then conversion measures the real font.
 *
 * We deliberately don't reinvent core's measurement — we feed the exact registry
 * it reads (browser `FontFace`/`document.fonts`, node skia `FontLibrary`, both of
 * which core's canvas uses), so metrics match the eventual render 1:1.
 *
 * Returns the `Template.Font[]` (name + a local blob/data src) to attach to the
 * serial so the RENDERER loads the same faces; a consumer that persists the
 * serial swaps these local srcs for durable URLs at upload time.
 */

export type LoadableFace = { weight: number; italic: boolean; bytes: ArrayBuffer };
export type LoadableFont = { family: string; faces: LoadableFace[] };

// Headless (skia) is marked by core's `happyDOM` global; a real browser has a
// working `FontFace` + `document.fonts`. jsdom (used by paper) defines `document`
// but not those, so `document` alone must NOT be read as "browser" — otherwise a
// Node convert would take the browser path and never register with skia.
const RUNS_HEADLESS = typeof (globalThis as { happyDOM?: unknown }).happyDOM !== 'undefined';
function inRealBrowser(): boolean {
  return !RUNS_HEADLESS && typeof document !== 'undefined' && typeof (globalThis as { FontFace?: unknown }).FontFace === 'function' && typeof (document as unknown as { fonts?: { add?: unknown } }).fonts?.add === 'function';
}

/** CSS `@font-face` block for one face, over a freshly minted object URL. */
function faceRule(family: string, face: LoadableFace): { rule: string } {
  const url = URL.createObjectURL(new Blob([face.bytes]));
  const style = face.italic ? 'italic' : 'normal';
  return { rule: `@font-face{font-family:'${family.replace(/'/g, "\\'")}';font-weight:${face.weight};font-style:${style};src:url('${url}');}` };
}

async function loadBrowser(fonts: LoadableFont[]): Promise<Template.Font[]> {
  const fontSet = (document as unknown as { fonts: { add(f: FontFace): void; ready: Promise<unknown> } }).fonts;
  const entries: Template.Font[] = [];
  const pending: Promise<unknown>[] = [];
  for (const font of fonts) {
    const rules: string[] = [];
    for (const face of font.faces) {
      // Register into document.fonts (what canvas measureText reads) with the
      // right weight/style descriptors so `700 …` resolves to the bold binary.
      const ff = new FontFace(font.family, face.bytes as ArrayBuffer, { weight: String(face.weight), style: face.italic ? 'italic' : 'normal' });
      fontSet.add(ff);
      pending.push(ff.load().catch(() => undefined));
      rules.push(faceRule(font.family, face).rule);
    }
    const src = URL.createObjectURL(new Blob([rules.join('\n')], { type: 'text/css' }));
    entries.push({ name: font.family, src });
  }
  await Promise.all(pending);
  await fontSet.ready;
  // Small settle: mirrors core's waitForFonts — the canvas text-metrics cache can
  // lag one frame behind `fonts.ready`, and stale metrics are exactly the bug.
  await new Promise((r) => setTimeout(r, 60));
  return entries;
}

async function loadNode(fonts: LoadableFont[]): Promise<Template.Font[]> {
  // Headless: register with skia's FontLibrary (what core's headless canvas
  // measures against). Best-effort — if skia isn't installed the convert simply
  // measures with fallback metrics, same as before this class existed.
  let FontLibrary: { use: (family: string, paths: string[]) => unknown } | undefined;
  try {
    // @ts-ignore -- optional headless peer; may be absent at type-check time
    ({ FontLibrary } = (await import('skia-canvas')) as unknown as { FontLibrary: typeof FontLibrary });
  } catch {
    console.warn('[idml] skia-canvas not available — precise headless font measurement is off; convert will use fallback metrics.');
    return fonts.map((f) => ({ name: f.family, src: '' }));
  }
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'idml-fonts-'));
  const entries: Template.Font[] = [];
  for (const font of fonts) {
    const paths: string[] = [];
    for (const face of font.faces) {
      const file = path.join(dir, `${font.family.replace(/[^a-z0-9]/gi, '_')}-${face.weight}-${face.italic ? 'i' : 'n'}.font`);
      await fs.promises.writeFile(file, Buffer.from(face.bytes));
      paths.push(file);
    }
    try {
      FontLibrary!.use(font.family, paths);
    } catch (e) {
      console.warn(`[idml] FontLibrary.use failed for "${font.family}":`, e);
    }
    // A data: URL keeps the returned serial self-contained for a headless render.
    const first = font.faces[0];
    const src = first ? `data:font/ttf;base64,${Buffer.from(first.bytes).toString('base64')}` : '';
    entries.push({ name: font.family, src });
  }
  return entries;
}

/**
 * Register `fonts` into the ambient measurement registry and await availability.
 * No-op for an empty list. Returns the serial `Template.Font[]` to attach.
 */
export async function loadFontsForMeasurement(fonts: LoadableFont[]): Promise<Template.Font[]> {
  if (fonts.length === 0) return [];
  return inRealBrowser() ? loadBrowser(fonts) : loadNode(fonts);
}
