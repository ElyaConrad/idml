import { fileTypeFromBuffer } from 'file-type';
import { IDML } from './idml.js';
import { convertIDML2Serial, ConvertedSerial, ConvertIDML2SerialOptions, FontVariant, ImageGraphicType, ImageSrcResolver, ImageViewBoxResolver, RequiredFont } from './idml2serial.js';
import { AssetFile, AggregatedAssets, AggregatedFont, AggregatedImage, collectAssets, matchFontFiles, matchImageFile } from './assets.js';
import { loadFontsForMeasurement, LoadableFont } from './util/fontLoading.js';
import { typoAscentRatio } from './util/font.js';
import { isDisplayableImageMime, makeImagePreviewSrc } from './util/imagePreview.js';
import { parseSvgViewBox, type SvgViewBox } from './util/svgViewBox.js';
import type { Font as SerialFont } from './serial/serial-types.js';

/** Extension -> MIME for provided files (reliable, and catches SVG which byte
 * sniffing misses). */
const EXTENSION_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', psd: 'image/vnd.adobe.photoshop' };

/**
 * One image asset the import wizard must handle: its bytes (embedded or from a
 * provided file), how to display it, and every serial element that references it.
 */
export type PreparedImage = {
  imageId: string;
  linkURI?: string;
  graphicType: ImageGraphicType;
  /** true → not browser-renderable (PDF/EPS/WMF/TIFF/PSD); bx-files must convert it. */
  needsConversion: boolean;
  /** true → currently shown in the serial via a blob/data preview src. */
  hasPreview: boolean;
  /** Uploadable bytes: embedded IDML bytes, or a provided file. undefined = still missing. */
  bytes?: ArrayBuffer;
  source: 'embedded' | 'provided' | 'missing';
  /** Serial elements (across spreads) whose `image.src` this asset feeds. */
  occurrences: { serialIndex: number; elementId: string }[];
};

/**
 * Stateful, asset-aware IDML → Serial converter.
 *
 * `convertIDML2Serial` is a pure kernel: given an IDML it walks the document and
 * measures text against whatever fonts happen to be loaded in the ambient canvas.
 * That last part is the problem — measurement (the ascent baseline shift, auto-
 * wrap) is font-DEPENDENT, so a convert that runs before the document's fonts are
 * available bakes wrong geometry that the live renderer can't undo.
 *
 * This class makes assets a first-class INPUT instead of an after-the-fact report.
 * You hand it the IDML plus whatever files you have (a whole `Document fonts/` +
 * `Links/` package folder, or nothing), it matches them to what the document
 * needs, and {@link convert} performs the atomic step: resolve → inject fonts →
 * AWAIT real availability → measure precisely → emit the serial. Providing more
 * assets later and calling {@link convert} again re-derives the serial from the
 * new state — the same model bx-studio's import wizard drives by hand today, now
 * owned by the module so every consumer shares it.
 *
 * The kernel stays public and unchanged for callers that don't need any of this.
 */
export class IdmlSerialConverter {
  private assets: AssetFile[] = [];
  /** Font/image work list, derived once from a font-independent discovery pass. */
  private aggregated: AggregatedAssets = { fonts: [], images: [] };
  private lastResult: ConvertedSerial[] | null = null;
  /** Aggregated-image keys that got a preview src in the last convert (for the manifest). */
  private previewKeys = new Set<string>();
  /** Blob URLs minted last convert, revoked on the next so a re-convert doesn't leak. */
  private previewBlobUrls: string[] = [];

  private constructor(private readonly idml: IDML) {}

  /**
   * Parse the IDML and take stock of what it needs. `files` may be a whole
   * package folder (fonts, links) — anything unrecognized is simply ignored.
   */
  static async create(idmlBytes: ArrayBuffer, files: AssetFile[] = []): Promise<IdmlSerialConverter> {
    const idml = new IDML(idmlBytes);
    await new Promise<void>((resolve) => idml.addEventListener('ready', () => resolve(), { once: true }));
    const instance = new IdmlSerialConverter(idml);
    instance.assets = dedupeByName(files);
    // Discovery: a first walk to learn the required fonts/images. Its geometry is
    // discarded (fonts aren't loaded yet); only the font-independent asset list is
    // kept, so this is safe regardless of what's loaded.
    instance.aggregated = collectAssets(await convertIDML2Serial(idml));
    return instance;
  }

  /** Register more asset files (later files win on name collision). */
  ingest(files: AssetFile[]): void {
    this.assets = dedupeByName([...this.assets, ...files]);
  }
  /** Register a single asset (font or image). Convenience over {@link ingest}. */
  provideAsset(file: AssetFile): void {
    this.ingest([file]);
  }

  /** Every font the document uses (family + distinct weight/italic variants). */
  get requiredFonts(): RequiredFont[] {
    return this.aggregated.fonts.map((f) => ({ family: f.family, variants: f.variants }));
  }
  /** Required fonts with no matching file among the currently-provided assets. */
  get missingFonts(): AggregatedFont[] {
    // "Missing" = not a single file for the family (exact name OR fuzzy family match);
    // picking the right binary per weight is facesFor's job, not this presence check.
    return this.aggregated.fonts.filter((f) => matchFontFiles(f.family, f.variants.map((v) => v.fontFileName).filter((n): n is string => Boolean(n)), this.assets).length === 0);
  }
  /** Linked images with neither embedded bytes nor a matching provided file. */
  get missingImages(): AggregatedImage[] {
    return this.aggregated.images.filter((img) => !img.embedded && !this.assetForImage(img));
  }
  /** The current provided-asset set (read-only view). */
  get providedAssets(): readonly AssetFile[] {
    return this.assets;
  }

  /**
   * Convert with the current asset set. Injects the resolved fonts and AWAITS
   * their real availability before measuring, so the geometry is precise on the
   * first pass — no font-load race. Re-runnable after providing more assets. The
   * emitted serials carry `fonts[]` (local srcs) so the renderer loads the same
   * faces; a persisting consumer swaps those for durable URLs at upload time.
   */
  async convert(options?: ConvertIDML2SerialOptions): Promise<ConvertedSerial[]> {
    const loadable = await this.buildLoadableFonts();
    const serialFonts = await loadFontsForMeasurement(loadable);
    // Build the image preview resolver BEFORE converting: displayable images
    // (embedded, or a provided linked file) become a compressed blob (browser) /
    // data URL (node) that the kernel wires straight onto the element, instead of
    // the gray placeholder. Non-displayable (AI/EPS/PSD/PDF/TIFF) stay placeholders
    // and only ride the upload manifest for bx-files conversion.
    const resolveImageSrc = await this.buildImageResolver();
    // Supply SVG viewBoxes for LINKED SVGs (bytes not on the sprite) so their crop is placed
    // against the rendered artboard, not the auto-cropped content bbox (embedded read directly).
    const resolveImageViewBox = this.buildImageViewBoxResolver();
    // Per-family typographic ascent ratio (from the loaded font bytes) so the converter can place
    // the first baseline at InDesign's Ascent (typo ascender) rather than the canvas
    // fontBoundingBoxAscent, which over-drops fonts whose winAscent > typoAscender (e.g. DIN-Bold).
    const fontAscentRatios = new Map<string, number>();
    for (const font of loadable) {
      const r = font.faces[0]?.bytes ? typoAscentRatio(font.faces[0].bytes) : null;
      if (r && r > 0) fontAscentRatios.set(font.family, r);
    }
    const resolveFontAscentRatio = (family: string) => fontAscentRatios.get(family);
    const result = await convertIDML2Serial(this.idml, { ...options, resolveImageSrc, resolveImageViewBox, resolveFontAscentRatio });
    for (const { serial } of result) serial.fonts = mergeFonts(serial.fonts, serialFonts);
    this.lastResult = result;
    return result;
  }

  /**
   * The complete image work list for an import wizard: every image asset with its
   * uploadable bytes (embedded or provided), whether it needs bx-files conversion,
   * whether it currently previews, and the serial elements to patch with the final
   * durable URL. Images with `source: 'missing'` still need a file from the user.
   */
  get imageManifest(): PreparedImage[] {
    return this.aggregated.images.map((img) => {
      const provided = !img.embedded ? this.assetForImage(img) : undefined;
      const bytes = img.embedded ? img.data : provided?.bytes;
      const source: PreparedImage['source'] = img.embedded ? 'embedded' : provided ? 'provided' : 'missing';
      return { imageId: img.imageId, linkURI: img.linkURI, graphicType: img.graphicType, needsConversion: img.needsConversion, hasPreview: this.previewKeys.has(imageKey(img)), bytes, source, occurrences: img.occurrences };
    });
  }

  /** The serials from the most recent {@link convert} (null before the first). */
  get result(): ConvertedSerial[] | null {
    return this.lastResult;
  }

  /** The parsed IDML document (e.g. to also run idml2svg over the same instance). */
  get document(): IDML {
    return this.idml;
  }

  // -- internals ------------------------------------------------------------

  /**
   * Provided font files matched to a required family, one binary per variant.
   *
   * `matchFontFiles` returns exact-metadata-name hits PLUS the family's other files
   * (a variant's stored file name is sometimes wrong — see matchFontFiles), so for a
   * multi-weight family every variant sees several candidates. Picking `matched[0]`
   * blindly gave EVERY weight the same (first) binary — the family collapsed to one
   * weight at render. Instead: trust an exact file-name hit, else pick the candidate
   * whose REAL weight/italic (read from the binary via fontkit) matches the variant,
   * preferring a file not already taken by another variant.
   */
  private async facesFor(font: AggregatedFont): Promise<LoadableFont['faces']> {
    const faces: LoadableFont['faces'] = [];
    const used = new Set<AssetFile>();
    for (const variant of font.variants) {
      const matched = matchFontFiles(font.family, variant.fontFileName ? [variant.fontFileName] : [], this.assets);
      if (matched.length === 0) continue;
      const exactName = variant.fontFileName ? baseName(variant.fontFileName) : undefined;
      const exact = exactName ? matched.find((m) => baseName(m.name) === exactName) : undefined;
      const file = exact ?? (await this.pickFaceByMetrics(matched, variant, used));
      if (file) {
        faces.push({ weight: variant.weight, italic: variant.italic, bytes: file.bytes, fileName: file.name });
        used.add(file);
      }
    }
    return faces;
  }

  /** Among candidate binaries, the one whose real weight/italic best fits `variant`. */
  private async pickFaceByMetrics(candidates: AssetFile[], variant: FontVariant, used: Set<AssetFile>): Promise<AssetFile | undefined> {
    if (candidates.length <= 1) return candidates[0];
    const scored: { file: AssetFile; score: number; order: number }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const meta = await this.faceMeta(candidates[i]);
      // Unknown metrics sort last (large, order-stable) so a parseable sibling wins.
      const weightDist = meta ? Math.abs(meta.weight - variant.weight) : 2000 + i;
      const italicPenalty = meta && meta.italic !== variant.italic ? 400 : 0;
      scored.push({ file: candidates[i], score: weightDist + italicPenalty, order: i });
    }
    scored.sort((a, b) => a.score - b.score || (used.has(a.file) ? 1 : 0) - (used.has(b.file) ? 1 : 0) || a.order - b.order);
    return scored[0].file;
  }

  private faceMetaCache = new Map<AssetFile, { weight: number; italic: boolean } | null>();
  private async faceMeta(file: AssetFile): Promise<{ weight: number; italic: boolean } | null> {
    if (this.faceMetaCache.has(file)) return this.faceMetaCache.get(file)!;
    const meta = await faceMetrics(file.bytes);
    this.faceMetaCache.set(file, meta);
    return meta;
  }

  private async buildLoadableFonts(): Promise<LoadableFont[]> {
    const built = await Promise.all(this.aggregated.fonts.map(async (f) => ({ family: f.family, faces: await this.facesFor(f) })));
    return built.filter((f) => f.faces.length > 0);
  }
  private assetForImage(img: AggregatedImage): AssetFile | undefined {
    return img.linkURI ? matchImageFile(img.linkURI, this.assets) : undefined;
  }

  /**
   * Preview-src provider for displayable images. Compresses each once (blob in the
   * browser, data URL in Node) and keys it so the kernel can look it up per element:
   * linked images by their shared linkURI (one blob serves every placement),
   * embedded images by their sprite id. Returns undefined when nothing is displayable.
   */
  private async buildImageResolver(): Promise<ImageSrcResolver | undefined> {
    for (const url of this.previewBlobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* Node, or already revoked */
      }
    }
    this.previewBlobUrls = [];
    this.previewKeys = new Set();

    const byLinkURI = new Map<string, string>();
    const byImageId = new Map<string, string>();
    for (const img of this.aggregated.images) {
      const resolved = await this.resolveDisplayableBytes(img);
      if (!resolved) continue;
      const src = await makeImagePreviewSrc(resolved.bytes, resolved.mime);
      if (!src) continue;
      if (src.startsWith('blob:')) this.previewBlobUrls.push(src);
      this.previewKeys.add(imageKey(img));
      if (img.linkURI) byLinkURI.set(img.linkURI, src);
      else byImageId.set(img.imageId, src);
    }
    if (byLinkURI.size === 0 && byImageId.size === 0) return undefined;
    return ({ imageId, linkURI }) => (linkURI ? byLinkURI.get(linkURI) : undefined) ?? byImageId.get(imageId);
  }

  /**
   * SVG viewBox provider (by linkURI / imageId) for LINKED SVGs — their bytes aren't on the
   * sprite, so the kernel can't read the viewBox itself. Parse it from the embedded-or-provided
   * bytes so the crop is placed against the rendered artboard (InDesign's GraphicBounds is the
   * auto-cropped content bbox). Undefined when no SVG has a resolvable viewBox.
   */
  private buildImageViewBoxResolver(): ImageViewBoxResolver | undefined {
    const byLinkURI = new Map<string, SvgViewBox>();
    const byImageId = new Map<string, SvgViewBox>();
    for (const img of this.aggregated.images) {
      if (img.graphicType !== 'SVG') continue;
      const bytes = img.embedded && img.data ? img.data : this.assetForImage(img)?.bytes;
      if (!bytes) continue;
      const vb = parseSvgViewBox(bytes);
      if (!vb) continue;
      if (img.linkURI) byLinkURI.set(img.linkURI, vb);
      else byImageId.set(img.imageId, vb);
    }
    if (byLinkURI.size === 0 && byImageId.size === 0) return undefined;
    return ({ imageId, linkURI }) => (linkURI ? byLinkURI.get(linkURI) : undefined) ?? byImageId.get(imageId);
  }

  /** Displayable bytes + MIME for one aggregated image: embedded IDML bytes, or a
   * provided linked file. Undefined for non-displayable formats and unresolved links. */
  private async resolveDisplayableBytes(img: AggregatedImage): Promise<{ bytes: ArrayBuffer; mime: string } | undefined> {
    if (img.needsConversion) return undefined; // AI/EPS/PSD/PDF/WMF/TIFF — bx-files only
    if (img.embedded && img.data) {
      const mime = img.graphicType === 'SVG' ? 'image/svg+xml' : await sniffMime(img.data);
      return mime && isDisplayableImageMime(mime) ? { bytes: img.data, mime } : undefined;
    }
    const file = this.assetForImage(img);
    if (file) {
      const mime = mimeFromName(file.name) ?? (await sniffMime(file.bytes));
      if (mime && isDisplayableImageMime(mime)) return { bytes: file.bytes, mime };
    }
    return undefined;
  }
}

/** Same de-dup identity as `collectAssets` (linkURI, else sprite id). */
function imageKey(img: { imageId: string; linkURI?: string }): string {
  return img.linkURI ? `uri:${img.linkURI}` : `id:${img.imageId}`;
}
async function sniffMime(bytes: ArrayBuffer): Promise<string | undefined> {
  try {
    return (await fileTypeFromBuffer(new Uint8Array(bytes)))?.mime;
  } catch {
    return undefined;
  }
}
function mimeFromName(name: string): string | undefined {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? EXTENSION_MIME[ext] : undefined;
}

function dedupeByName(files: AssetFile[]): AssetFile[] {
  const byName = new Map<string, AssetFile>();
  for (const file of files) byName.set(file.name.toLowerCase(), file);
  return [...byName.values()];
}

/** Lower-cased base name (no directory) — the font file-name match key. */
function baseName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? name).toLowerCase();
}

/**
 * A font binary's real weight/italic, read from the file itself (OS/2 `usWeightClass`
 * + italic flags) via fontkit — the same source of truth bx-studio's uploader uses. Lets
 * the converter assign the right binary to each weight variant even when the IDML's
 * per-variant file names are wrong. Returns null on a collection/unparseable file.
 */
async function faceMetrics(bytes: ArrayBuffer): Promise<{ weight: number; italic: boolean } | null> {
  try {
    const { create } = await import('fontkit');
    const u8 = new Uint8Array(bytes);
    // fontkit wants a Buffer under Node, accepts a Uint8Array in the browser.
    const input = typeof Buffer !== 'undefined' ? Buffer.from(u8) : u8;
    const font = create(input as Buffer);
    // A collection (.ttc/.dfont) has no single familyName — skip (rare for IDML fonts).
    if (!font || typeof (font as { familyName?: unknown }).familyName !== 'string') return null;
    const f = font as unknown as { 'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } }; head?: { macStyle?: { italic?: boolean } }; italicAngle?: number };
    const weight = f['OS/2']?.usWeightClass ?? 400;
    const italic = Boolean(f['OS/2']?.fsSelection?.italic || f.head?.macStyle?.italic || (typeof f.italicAngle === 'number' && f.italicAngle !== 0));
    return { weight, italic };
  } catch {
    return null;
  }
}

function mergeFonts(existing: SerialFont[], added: SerialFont[]): SerialFont[] {
  const byName = new Map(existing.map((f) => [f.name, f]));
  for (const font of added) byName.set(font.name, font);
  return [...byName.values()];
}
