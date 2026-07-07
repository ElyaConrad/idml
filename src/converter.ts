import { IDML } from './idml.js';
import { convertIDML2Serial, ConvertedSerial, ConvertIDML2SerialOptions, RequiredFont } from './idml2serial.js';
import { AssetFile, AggregatedAssets, AggregatedFont, AggregatedImage, collectAssets, matchFontFiles, matchImageFile } from './assets.js';
import { loadFontsForMeasurement, LoadableFont } from './util/fontLoading.js';
import type { Font as SerialFont } from './serial/serial-types.js';

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
    const result = await convertIDML2Serial(this.idml, options);
    for (const { serial } of result) serial.fonts = mergeFonts(serial.fonts, serialFonts);
    this.lastResult = result;
    return result;
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
