import type * as Template from '../serial/serial-types';
import { ImageSprite } from '../controllers/sprites/Image';
import { isDisplayableImageMime } from '../util/imagePreview';

// ---- asset collection (for the import wizard) ------------------------------

/**
 * A font weight/style combination encountered in a serial. When the document's
 * XMP metadata resolves it, the variant also carries the original PostScript
 * name, on-disk file name (`fontFileName`, e.g. "DINBd_.ttf") and font type —
 * letting a consumer match the exact binary shipped in a package's `Document
 * fonts/` folder instead of guessing from the family name.
 */
export type FontVariant = {
  weight: number;
  italic: boolean;
  /** Raw IDML FontStyle name, e.g. "Bold", "Bold Cond Italic". */
  styleName?: string;
  /** PostScript name from `Resources/Fonts.xml`, e.g. "DIN-Bold". */
  postScriptName?: string;
  /** Original on-disk file name from the XMP metadata, e.g. "DINBd_.ttf". */
  fontFileName?: string;
  /** e.g. "TrueType", "OpenTypeCFF". */
  fontType?: string;
};
/** A font family + the distinct weight/italic combinations used. */
export type RequiredFont = { family: string; variants: FontVariant[] };
/** The IDML page-item tag an image originated from. `'Image'` is a real raster
 * and `'SVG'` is directly browser-renderable; `'PDF'`/`'EPS'`/`'WMF'` are placed
 * vector graphics a browser can't render and bx-files must rasterize first. */
export type ImageGraphicType = 'Image' | 'PDF' | 'EPS' | 'WMF' | 'SVG';
/** True for graphic types whose bytes a browser can't render directly, so
 * bx-studio must convert them (via bx-files) before display. SVG and raster are
 * uploaded and shown directly. */
const NEEDS_CONVERSION: ReadonlySet<ImageGraphicType> = new Set(['PDF', 'EPS', 'WMF']);

/**
 * Whether an image's embedded bytes must be rasterized (bx-files) before a browser
 * can show them. PDF/EPS/WMF always do; SVG never does. graphicType 'Image' is the
 * subtle one — it covers TIFF and PSD too (not just PNG/JPEG), and those the browser
 * cannot render, so gate on the sniffed MIME.
 */
async function needsConversion(image: ImageSprite, graphicType: ImageGraphicType): Promise<boolean> {
  if (NEEDS_CONVERSION.has(graphicType)) return true;
  if (graphicType !== 'Image') return false; // SVG
  try {
    const type = await image.getImageType();
    return !isDisplayableImageMime(type?.mime);
  } catch {
    return false;
  }
}
/** A linked image with no embedded source — the user must supply it. */
export type MissingImage = { elementId: string; imageId: string; linkURI?: string; graphicType: ImageGraphicType };
/** An image whose bytes we recovered from the IDML (embedded raster, embedded
 * SVG source, or an embedded PDF/EPS/WMF source). The wizard uploads `data`,
 * then swaps the data URL on `elementId` for the returned cloud URL.
 * `needsConversion` is true only for EPS/PDF/WMF — bytes a browser can't render,
 * which bx-files must rasterize first. Raster and SVG upload directly. */
export type ImageToUpload = { elementId: string; imageId: string; data: ArrayBuffer; linkURI?: string; graphicType: ImageGraphicType; needsConversion: boolean };
/** Assets a single serial involves. */
export type SerialAssets = { fonts: RequiredFont[]; missingImages: MissingImage[]; imagesToUpload: ImageToUpload[] };
/** A produced serial plus its assets. */
export type ConvertedSerial = { serial: Template.Serial; assets: SerialAssets };
/**
 * Supplies a ready preview `src` for an image element by its id — how the
 * asset-aware converter injects blob previews for displayable images (embedded
 * or wizard-provided) into the serial. Returns undefined to fall back to the
 * kernel's own embedded data URL / placeholder.
 */
export type ImageSrcResolver = (info: { imageId: string; linkURI?: string }) => string | undefined;

/**
 * Supplies an SVG's `viewBox` (rendered coordinate extent) for LINKED SVGs, whose bytes
 * aren't embedded on the sprite — the converter parses the provided file and answers by
 * imageId/linkURI. Embedded SVGs read it straight off the sprite. Needed so a placed SVG's
 * crop is expressed against the artboard (what's drawn), not the auto-cropped content bbox.
 */
export type ImageViewBoxResolver = (info: { imageId: string; linkURI?: string }) => { minX: number; minY: number; width: number; height: number } | undefined;

export class AssetCollector {
  private fonts = new Map<string, Map<string, FontVariant>>(); // family -> styleName|"w|i" -> variant
  readonly missingImages: MissingImage[] = [];
  readonly imagesToUpload: ImageToUpload[] = [];

  constructor(readonly resolveImageSrc?: ImageSrcResolver, readonly resolveImageViewBox?: ImageViewBoxResolver) {}

  addFont(family: string, variant: FontVariant) {
    if (!family) return;
    // Dedup by the concrete style (distinct binaries) when known, else weight/italic.
    const key = variant.styleName ?? `${variant.weight}|${variant.italic}`;
    let variants = this.fonts.get(family);
    if (!variants) this.fonts.set(family, (variants = new Map()));
    if (!variants.has(key)) variants.set(key, variant);
  }
  /**
   * Record an image used at serial element `elementId` (the element that holds
   * the `image.src`). Embedded -> imagesToUpload (with bytes); linked with no
   * source -> missingImages.
   */
  async addImage(elementId: string, image: ImageSprite) {
    // Return the bytes whenever the IDML actually carries them — a real raster,
    // an embedded SVG (both browser-renderable, uploaded directly) or an embedded
    // PDF/EPS/WMF (flagged needsConversion so bx-files rasterizes it first). Only
    // a linked graphic with no embedded bytes is truly "missing".
    const graphicType = image.getGraphicType() as ImageGraphicType;
    const linkURI = image.getLinkURI();
    // getRasterContents() gates on raster; getContents() returns any embedded bytes.
    const embedded = image.getRasterContents() ?? image.getContents();
    if (embedded) this.imagesToUpload.push({ elementId, imageId: image.getId(), data: embedded, linkURI, graphicType, needsConversion: await needsConversion(image, graphicType) });
    else this.missingImages.push({ elementId, imageId: image.getId(), linkURI, graphicType });
  }
  result(): SerialAssets {
    return {
      fonts: [...this.fonts.entries()].map(([family, variants]) => ({ family, variants: [...variants.values()] })),
      missingImages: this.missingImages,
      imagesToUpload: this.imagesToUpload,
    };
  }
}
