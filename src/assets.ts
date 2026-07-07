import type { ConvertedSerial, FontVariant } from './idml2serial.js';

/**
 * Environment-agnostic asset matching for the IDML import flow.
 *
 * This is the resolution logic that used to live in bx-studio's `idmlImport.ts`,
 * lifted into the module so every consumer shares one matcher. It deals only in
 * `{ name, bytes }` pairs (no browser `File`), so it works in the studio, in
 * Node/CI, and anywhere else. {@link IdmlSerialConverter} drives it; callers that
 * want the low-level matchers can use them directly.
 */

/** A provided asset file: its name (for matching) and its bytes (for use). */
export type AssetFile = { name: string; bytes: ArrayBuffer };

// All image formats an IDML may link, INCLUDING non-web ones (AI/EPS/PDF/PSD),
// which a consumer rasterizes before the renderer sees them.
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'tif', 'tiff', 'psd', 'eps', 'ai', 'pdf'];
const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2', 'ttc'];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}
function baseNameOf(path: string): string {
  // Handle both POSIX and Windows separators (IDML link URIs carry either).
  return path.split(/[\\/]/).pop() ?? path;
}
function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
/** Collapse to a comparison key: lower-case, alnum only (drops spaces, dashes…). */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort resolution of a linked image URI against provided files, limited to
 * recognized image formats. Exact base-name match (incl. extension) first, then
 * base name without extension — catching the common case where InDesign wrote an
 * absolute `file:///…/Links/foo.png` but the user supplied the package folder.
 */
export function matchImageFile(linkURI: string | undefined, files: AssetFile[]): AssetFile | undefined {
  if (!linkURI) return undefined;
  const wantedFull = normalize(baseNameOf(linkURI));
  const wantedBase = normalize(stripExtension(baseNameOf(linkURI)));
  const candidates = files.filter((f) => IMAGE_EXTENSIONS.includes(extensionOf(f.name)));
  const exact = candidates.find((f) => normalize(baseNameOf(f.name)) === wantedFull);
  if (exact) return exact;
  return candidates.find((f) => normalize(stripExtension(baseNameOf(f.name))) === wantedBase);
}

/**
 * Resolution of a required font against provided font files (typically an
 * InDesign `Document fonts/` folder).
 *
 * `expectedFileNames` are the on-disk file names the IDML's XMP metadata recorded
 * for this family's variants (e.g. `DINBd_.ttf`), surfaced on each
 * {@link FontVariant.fontFileName}. When present they give an EXACT match even
 * though "DINBd_" bears no resemblance to the family "DIN-Bold". Only when the
 * metadata gave nothing do we fall back to the fuzzy family-name heuristic.
 */
export function matchFontFiles(family: string, expectedFileNames: string[], files: AssetFile[]): AssetFile[] {
  const fontEntries = files.filter((f) => FONT_EXTENSIONS.includes(extensionOf(f.name)));

  // 1) Exact match on the metadata file names (base name, case-insensitive).
  const wantedFiles = new Set(expectedFileNames.filter(Boolean).map((n) => normalize(baseNameOf(n))));
  if (wantedFiles.size) {
    const exact = fontEntries.filter((f) => wantedFiles.has(normalize(baseNameOf(f.name))));
    if (exact.length) return exact;
  }

  // 2) Fallback: fuzzy family-name match against the file stem.
  const wanted = normalize(family);
  return fontEntries.filter((f) => {
    const stem = normalize(stripExtension(baseNameOf(f.name)));
    return stem === wanted || stem.startsWith(wanted) || stem.includes(wanted);
  });
}

// ---------------------------------------------------------------------------
// Asset aggregation across all produced serials
// ---------------------------------------------------------------------------

export interface AggregatedImage {
  imageId: string;
  linkURI?: string;
  /** true → bytes are embedded in the IDML (always uploadable). */
  embedded: boolean;
  data?: ArrayBuffer;
  /** Every serial element that references this image (patch targets). */
  occurrences: { serialIndex: number; elementId: string }[];
}

export interface AggregatedFont {
  family: string;
  variants: FontVariant[];
  /** On-disk file names (from the IDML XMP metadata) for exact folder matching. */
  fileNames: string[];
  serialIndices: number[];
}

export interface AggregatedAssets {
  images: AggregatedImage[];
  fonts: AggregatedFont[];
}

/**
 * Identity of an image ASSET for de-duplication: the same linked file placed on
 * several frames/spreads is ONE asset (upload once) with many patch targets, so
 * we key by its link path. Only embedded images with no link fall back to their
 * per-placement sprite id (each carries its own bytes).
 */
function imageAssetKey(image: { imageId: string; linkURI?: string }): string {
  return image.linkURI ? `uri:${image.linkURI}` : `id:${image.imageId}`;
}

/** Merge the per-serial `SerialAssets` into one de-duplicated work list. */
export function collectAssets(serials: ConvertedSerial[]): AggregatedAssets {
  const images = new Map<string, AggregatedImage>();
  const fonts = new Map<string, AggregatedFont>();

  serials.forEach(({ assets }, serialIndex) => {
    for (const image of assets.imagesToUpload) {
      const key = imageAssetKey(image);
      const entry = images.get(key) ?? { imageId: image.imageId, linkURI: image.linkURI, embedded: false, occurrences: [] };
      entry.embedded = true;
      entry.data = image.data;
      entry.linkURI ??= image.linkURI;
      entry.occurrences.push({ serialIndex, elementId: image.elementId });
      images.set(key, entry);
    }
    for (const image of assets.missingImages) {
      const key = imageAssetKey(image);
      const entry = images.get(key) ?? { imageId: image.imageId, linkURI: image.linkURI, embedded: false, occurrences: [] };
      entry.linkURI ??= image.linkURI;
      entry.occurrences.push({ serialIndex, elementId: image.elementId });
      images.set(key, entry);
    }
    for (const font of assets.fonts) {
      const key = normalize(font.family);
      const entry = fonts.get(key) ?? { family: font.family, variants: [], fileNames: [], serialIndices: [] };
      for (const variant of font.variants) {
        if (!entry.variants.some((existing) => existing.weight === variant.weight && existing.italic === variant.italic)) entry.variants.push(variant);
        if (variant.fontFileName && !entry.fileNames.includes(variant.fontFileName)) entry.fileNames.push(variant.fontFileName);
      }
      if (!entry.serialIndices.includes(serialIndex)) entry.serialIndices.push(serialIndex);
      fonts.set(key, entry);
    }
  });

  return { images: [...images.values()], fonts: [...fonts.values()] };
}

export const _assetInternals = { normalize, baseNameOf, stripExtension, extensionOf, FONT_EXTENSIONS, IMAGE_EXTENSIONS };
