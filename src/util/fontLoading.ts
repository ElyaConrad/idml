import type * as Template from '../serial/serial-types.js';
import { buildBluepicFontCSSDocument } from './fontCss.js';

/**
 * Make provided font bytes available to text MEASUREMENT before conversion runs,
 * and attach the matching `@font-face` document to each serial for the RENDERER.
 *
 * The point is atomicity: bluepic-core measures text against whatever font set is
 * registered in the ambient canvas registry — `document.fonts` in the browser,
 * skia's `FontLibrary` under headless. If a font isn't there yet, measureText
 * silently returns FALLBACK metrics and the converter bakes wrong geometry. So we
 * register the bytes into that SAME registry and AWAIT real availability first.
 *
 * The serial `Template.Font.src` is a CSS document built by the ONE shared builder
 * ({@link buildBluepicFontCSSDocument}) whose `@font-face` `src`s are self-contained
 * `data:` URLs — the SAME document a persisting consumer uploads to the font cloud,
 * so the preview and the upload can never disagree. (Browser: the document is served
 * over a session `blob:` URL to keep the serial JSON small; Node: a `data:text/css`
 * URL so it's fully portable.)
 */

export type LoadableFace = { weight: number; italic: boolean; bytes: ArrayBuffer; fileName?: string };
export type LoadableFont = { family: string; faces: LoadableFace[] };

// Headless (skia) is marked by core's `happyDOM` global; a real browser has a
// working `FontFace` + `document.fonts`. jsdom defines `document` but not those, so
// `document` alone must NOT be read as "browser".
const RUNS_HEADLESS = typeof (globalThis as { happyDOM?: unknown }).happyDOM !== 'undefined';
function inRealBrowser(): boolean {
  return !RUNS_HEADLESS && typeof document !== 'undefined' && typeof (globalThis as { FontFace?: unknown }).FontFace === 'function' && typeof (document as unknown as { fonts?: { add?: unknown } }).fonts?.add === 'function';
}

const toSources = (font: LoadableFont) => font.faces.map((f) => ({ bytes: f.bytes, fileName: f.fileName }));

async function loadBrowser(fonts: LoadableFont[]): Promise<Template.Font[]> {
  const fontSet = (document as unknown as { fonts: { add(f: FontFace): void; ready: Promise<unknown> } }).fonts;
  const entries: Template.Font[] = [];
  const pending: Promise<unknown>[] = [];
  for (const font of fonts) {
    let built: Awaited<ReturnType<typeof buildBluepicFontCSSDocument>>;
    try {
      built = await buildBluepicFontCSSDocument(toSources(font), { family: font.family });
    } catch (error) {
      console.warn(`[idml] font CSS build failed for "${font.family}" — its text will measure/render with a fallback.`, error);
      continue;
    }
    // Register each resolved face into document.fonts (what canvas measureText reads)
    // with the binary's real weight/style/stretch, so `700 …` resolves to the bold binary.
    for (const face of built.faces) {
      const ff = new FontFace(font.family, face.bytes as ArrayBuffer, { weight: face.weight, style: face.style, stretch: face.stretch });
      fontSet.add(ff);
      pending.push(ff.load().catch(() => undefined));
    }
    // The document (data-URL srcs) is self-contained; the blob only keeps the serial small.
    const src = URL.createObjectURL(new Blob([built.css], { type: 'text/css' }));
    entries.push({ name: font.family, src });
  }
  await Promise.all(pending);
  await fontSet.ready;
  // Small settle: the canvas text-metrics cache can lag one frame behind `fonts.ready`.
  await new Promise((r) => setTimeout(r, 60));
  return entries;
}

async function loadNode(fonts: LoadableFont[]): Promise<Template.Font[]> {
  // Headless: register with skia's FontLibrary (what core's headless canvas measures
  // against). Best-effort — without skia the convert still emits a valid font document,
  // it just measures with fallback metrics.
  let FontLibrary: { use: (family: string, paths: string[]) => unknown } | undefined;
  try {
    // @ts-ignore -- optional headless peer; may be absent at type-check time
    ({ FontLibrary } = (await import('skia-canvas')) as unknown as { FontLibrary: typeof FontLibrary });
  } catch {
    console.warn('[idml] skia-canvas not available — precise headless font measurement is off; convert will use fallback metrics.');
  }
  const nodeFs = FontLibrary ? await import('fs') : undefined;
  const nodePath = FontLibrary ? await import('path') : undefined;
  const dir = FontLibrary ? await nodeFs!.promises.mkdtemp(nodePath!.join((await import('os')).tmpdir(), 'idml-fonts-')) : undefined;

  const entries: Template.Font[] = [];
  for (const font of fonts) {
    let built: Awaited<ReturnType<typeof buildBluepicFontCSSDocument>>;
    try {
      built = await buildBluepicFontCSSDocument(toSources(font), { family: font.family });
    } catch (error) {
      console.warn(`[idml] font CSS build failed for "${font.family}".`, error);
      continue;
    }
    if (FontLibrary && nodeFs && nodePath && dir) {
      const paths: string[] = [];
      for (let i = 0; i < built.faces.length; i++) {
        const file = nodePath.join(dir, `${font.family.replace(/[^a-z0-9]/gi, '_')}-${i}.font`);
        await nodeFs.promises.writeFile(file, Buffer.from(new Uint8Array(built.faces[i].bytes)));
        paths.push(file);
      }
      try {
        FontLibrary.use(font.family, paths);
      } catch (e) {
        console.warn(`[idml] FontLibrary.use failed for "${font.family}":`, e);
      }
    }
    // A self-contained data: URL keeps the serial portable for a headless render.
    const src = `data:text/css;base64,${Buffer.from(built.css).toString('base64')}`;
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
