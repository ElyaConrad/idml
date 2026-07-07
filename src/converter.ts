import { fileTypeFromBuffer } from 'file-type';
import { IDML } from './idml.js';
import { convertIDML2Serial, ConvertedSerial, ConvertIDML2SerialOptions, ImageGraphicType, ImageSrcResolver, RequiredFont } from './idml2serial.js';
import { AssetFile, AggregatedAssets, AggregatedFont, AggregatedImage, collectAssets, matchFontFiles, matchImageFile } from './assets.js';
import { loadFontsForMeasurement, LoadableFont } from './util/fontLoading.js';
import { isDisplayableImageMime, makeImagePreviewSrc } from './util/imagePreview.js';
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
    return this.aggregated.fonts.filter((f) => this.facesFor(f).length === 0);
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
    const loadable = this.buildLoadableFonts();
    const serialFonts = await loadFontsForMeasurement(loadable);
    // Build the image preview resolver BEFORE converting: displayable images
    // (embedded, or a provided linked file) become a compressed blob (browser) /
    // data URL (node) that the kernel wires straight onto the element, instead of
    // the gray placeholder. Non-displayable (AI/EPS/PSD/PDF/TIFF) stay placeholders
    // and only ride the upload manifest for bx-files conversion.
    const resolveImageSrc = await this.buildImageResolver();
    const result = await convertIDML2Serial(this.idml, { ...options, resolveImageSrc });
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

  /** Provided font files matched to a required family, paired to their variants. */
  private facesFor(font: AggregatedFont): LoadableFont['faces'] {
    const faces: LoadableFont['faces'] = [];
    for (const variant of font.variants) {
      const matched = matchFontFiles(font.family, variant.fontFileName ? [variant.fontFileName] : [], this.assets);
      const file = matched[0];
      if (file) faces.push({ weight: variant.weight, italic: variant.italic, bytes: file.bytes });
    }
    return faces;
  }
  private buildLoadableFonts(): LoadableFont[] {
    return this.aggregated.fonts.map((f) => ({ family: f.family, faces: this.facesFor(f) })).filter((f) => f.faces.length > 0);
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

function mergeFonts(existing: SerialFont[], added: SerialFont[]): SerialFont[] {
  const byName = new Map(existing.map((f) => [f.name, f]));
  for (const font of added) byName.set(font.name, font);
  return [...byName.values()];
}
