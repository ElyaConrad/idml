/**
 * Single source of truth for turning font binaries into a Bluepic `@font-face`
 * CSS document.
 *
 * The SAME builder produces (a) the CSS the conversion preview renders from and
 * (b) the CSS uploaded to the Bluepic font cloud — so the two can never drift.
 * Each `src` is a self-contained `data:` URL (NOT a session `blob:`), so the
 * document is immediately upload-ready and survives a reload.
 *
 * Descriptors (weight / style / stretch) are read from the font BINARY via
 * fontkit — the font's own OS/2 / fvar / head tables — not guessed from file
 * names, so a family's weights are described exactly as the browser will resolve
 * them. (Ported from bx-studio's `makeCSSFontFileV2`, kept identical in output.)
 */

/** A font binary to include, plus its file name (used for the `format()` hint). */
export type FontFileSource = { bytes: ArrayBuffer; fileName?: string };

/** One resolved `@font-face`, with the bytes so a caller can also register it for measurement. */
export type BuiltFontFace = {
  family: string;
  /** `font-weight` token: a single class (`"400"`) or a variable range (`"100 900"`). */
  weight: string;
  /** `font-style` token: `normal` | `italic` | `oblique`. */
  style: string;
  /** `font-stretch` token: keyword, or a variable range (`"75% 125%"`). */
  stretch: string;
  type: 'variable' | 'static';
  mime: string;
  bytes: ArrayBuffer;
};

export type BuiltFontCSS = {
  /** The `@font-face` document — data-URL `src`s, ready to render AND to upload. */
  css: string;
  /** The CSS `font-family` used (the override if given, else the binaries' own name). */
  family: string;
  weights: string[];
  styles: string[];
  type: 'variable' | 'static';
  /** The deduped, ordered faces (bytes included) — for canvas/skia measurement registration. */
  faces: BuiltFontFace[];
};

/** CSS `font-stretch` keyword per OS/2 `usWidthClass` (1–9). */
const WIDTH_CLASS_KEYWORDS: Record<number, string> = {
  1: 'ultra-condensed',
  2: 'extra-condensed',
  3: 'condensed',
  4: 'semi-condensed',
  5: 'normal',
  6: 'semi-expanded',
  7: 'expanded',
  8: 'extra-expanded',
  9: 'ultra-expanded',
};

/** CSS `src` `format()` hint + data-URL MIME type + priority (higher wins among
 * duplicate faces uploaded in several formats — keep the more web-optimal one). */
const SRC_FORMATS: Record<string, { format: string; mime: string; priority: number }> = {
  woff2: { format: "format('woff2')", mime: 'font/woff2', priority: 4 },
  woff: { format: "format('woff')", mime: 'font/woff', priority: 3 },
  ttf: { format: "format('truetype')", mime: 'font/ttf', priority: 2 },
  otf: { format: "format('opentype')", mime: 'font/otf', priority: 1 },
};

/** sfnt/wrapper signature (first 4 bytes) → format key, when the file name has no extension. */
function sniffFormat(bytes: ArrayBuffer): keyof typeof SRC_FORMATS | undefined {
  const u = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  const tag = String.fromCharCode(...u);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  // 0x00010000, 'true', 'ttcf' are all TrueType-flavoured sfnt.
  if (tag === 'true' || tag === 'ttcf' || (u[0] === 0 && u[1] === 1 && u[2] === 0 && u[3] === 0)) return 'ttf';
  return undefined;
}

function detectSrcFormat(source: FontFileSource): { format: string; mime: string; priority: number } {
  const ext = source.fileName?.split('.').pop()?.toLowerCase() ?? '';
  const byExt = SRC_FORMATS[ext];
  if (byExt) return byExt;
  const sniffed = sniffFormat(source.bytes);
  return sniffed ? SRC_FORMATS[sniffed] : { format: '', mime: 'application/octet-stream', priority: 0 };
}

/** Isomorphic base64 of raw bytes — `btoa` in the browser, `Buffer` under Node. */
function bytesToDataUrl(bytes: ArrayBuffer, mime: string): string {
  const u8 = new Uint8Array(bytes);
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(u8).toString('base64');
  } else {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK) binary += String.fromCharCode(...u8.subarray(i, i + CHUNK));
    base64 = btoa(binary);
  }
  return `data:${mime};base64,${base64}`;
}

type ResolvedFace = BuiltFontFace & { format: string; priority: number; dataUrl: string };

/** Parse a single binary and derive its `@font-face` descriptors from the font itself. */
async function resolveFontFace(source: FontFileSource): Promise<ResolvedFace> {
  const u8 = new Uint8Array(source.bytes);
  const { create } = await import('fontkit');
  const input = typeof Buffer !== 'undefined' ? Buffer.from(u8) : u8;
  // The typed surface is narrower than the real table access we need (head, OS/2
  // sub-flags, single-arg getName), so read metadata through a loose view.
  const font = create(input as Buffer) as unknown as {
    familyName?: string;
    italicAngle?: number;
    getName(key: string): string | null;
    variationAxes?: Partial<Record<string, { min: number; max: number }>>;
    'OS/2'?: { usWeightClass?: number; usWidthClass?: number; fsSelection?: { italic?: boolean; oblique?: boolean } };
    head?: { macStyle?: { italic?: boolean } };
  };

  if (typeof font.familyName !== 'string') {
    throw new Error(`"${source.fileName ?? 'font'}" is a font collection, which is not supported here.`);
  }
  // Typographic family (name ID 16) over legacy family (ID 1): the legacy field
  // splits heavier/lighter weights into separate "families" (e.g. "Roboto Light").
  const family = (font.getName('preferredFamily') || font.familyName || '').trim();
  if (!family) throw new Error(`Font "${source.fileName ?? ''}" declares no family name.`);

  const os2 = font['OS/2'];
  const axes = font.variationAxes ?? {};
  const isVariable = Object.keys(axes).length > 0;

  const wght = axes.wght;
  const weight = wght ? `${Math.round(wght.min)} ${Math.round(wght.max)}` : String(os2?.usWeightClass ?? 400);

  const italic = Boolean(os2?.fsSelection?.italic || font.head?.macStyle?.italic || (typeof font.italicAngle === 'number' && font.italicAngle !== 0));
  const style = os2?.fsSelection?.oblique && !italic ? 'oblique' : italic ? 'italic' : 'normal';

  const wdth = axes.wdth;
  const stretch = wdth ? `${Math.round(wdth.min)}% ${Math.round(wdth.max)}%` : (WIDTH_CLASS_KEYWORDS[os2?.usWidthClass ?? 5] ?? 'normal');

  const { format, mime, priority } = detectSrcFormat(source);
  return { family, weight, style, stretch, type: isVariable ? 'variable' : 'static', mime, bytes: source.bytes, format, priority, dataUrl: bytesToDataUrl(source.bytes, mime) };
}

/**
 * Build the Bluepic `@font-face` document for one family from its binaries.
 *
 * @param sources one or more font binaries (all of the same family)
 * @param opts.family  CSS `font-family` to emit (defaults to the binaries' own name)
 * @param opts.strictFamily  throw if the binaries declare different internal families
 *        (bx-studio's manual multi-file upload wants this; the converter, which
 *        pre-selects a family's files, leaves it off). Default `false`.
 * @throws if a file can't be parsed / is a collection, or (strict) families disagree.
 */
export async function buildBluepicFontCSSDocument(sources: FontFileSource[], opts: { family?: string; strictFamily?: boolean } = {}): Promise<BuiltFontCSS> {
  if (sources.length === 0) throw new Error('No font sources provided.');

  const resolved = await Promise.all(sources.map((s) => resolveFontFace(s)));

  const baseFamily = resolved[0].family;
  if (opts.strictFamily) {
    const bad = resolved.findIndex((f) => f.family !== baseFamily);
    if (bad > -1) throw new Error(`Font family mismatch: "${baseFamily}" vs "${resolved[bad].family}". All files must be one family.`);
  }
  const family = (opts.family ?? baseFamily).trim();

  // Collapse duplicate faces (same weight/style/stretch shipped in several formats),
  // keeping the most web-optimal format.
  const byFace = new Map<string, ResolvedFace>();
  for (const face of resolved) {
    const key = `${face.weight}|${face.style}|${face.stretch}`;
    const kept = byFace.get(key);
    if (!kept || face.priority > kept.priority) byFace.set(key, face);
  }
  const ordered = [...byFace.values()].sort((a, b) => (parseInt(a.weight, 10) || 0) - (parseInt(b.weight, 10) || 0) || a.style.localeCompare(b.style));

  const css = ordered
    .map(
      (f) => `@font-face {
  font-family: '${family.replace(/'/g, "\\'")}';
  font-weight: ${f.weight};
  font-style: ${f.style};
  font-stretch: ${f.stretch};
  src: url('${f.dataUrl}')${f.format ? ` ${f.format}` : ''};
}`
    )
    .join('\n\n');

  const uniqSorted = (values: string[]) => values.filter((v, i) => values.indexOf(v) === i).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));

  return {
    css,
    family,
    weights: uniqSorted(ordered.map((f) => f.weight)),
    styles: uniqSorted(ordered.map((f) => f.style)),
    type: ordered.some((f) => f.type === 'variable') ? 'variable' : 'static',
    faces: ordered.map(({ family: _f, weight, style, stretch, type, mime, bytes }) => ({ family, weight, style, stretch, type, mime, bytes })),
  };
}
