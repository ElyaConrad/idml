import type * as Template from './serial/serial-types';
import { compose, inverse, translate, applyToPoint, Matrix } from 'transformation-matrix';
import { IDML } from './idml';
import { Spread } from './controllers/Spread';
import { Sprite } from './controllers/sprites/Sprite';
import { RectangleSprite } from './controllers/sprites/Rectangle';
import { OvalSprite } from './controllers/sprites/Oval';
import { PolygonSprite } from './controllers/sprites/Polygon';
import { GroupSprite } from './controllers/sprites/Group';
import { ImageSprite } from './controllers/sprites/Image';
import { TextFrame } from './controllers/sprites/TextFrame';
import { Color } from './controllers/Color';
import { Gradient } from './controllers/Gradient';
import { CornerOptions } from './controllers/sprites/Rectangle';
import { ParagraphOutput } from './controllers/Story';
import { ColorInput } from './types/index';
import { PathCommand } from './idml';
import { bakeSpriteMatrix, decomposeMatrix, itemTransform2Matrix } from './util/layout';
import { arrayBufferToBase64 } from './util/arrayBuffer';
import { isDisplayableImageMime } from './util/imagePreview';
import { makeRectangle, makeCircle, makePath, makeImage, makeText, makeGroup, makeMask, emptySerial, shiftElementTranslate, applyDropShadow, DropShadowValue, Paint, SurfaceInput, Box, PathFeature, RichTextRun, SerialImageValue, TextBounding } from './serial/builders';
import { DecomposedTransform } from './util/layout';

/**
 * IDML -> Bluepic Serial converter. One Serial per IDML page. Walks the IDML
 * controllers directly (NOT the SVG projection) so non-visual fidelity (text
 * settings, crop geometry, tints) is preserved. Geometry reuses the shared
 * layout layer (same baked matrices idml2svg renders). Heuristics decide
 * image-element-vs-mask and plaintext-vs-richtext.
 */

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
/** Options for {@link convertIDML2Serial}. */
export type ConvertIDML2SerialOptions = {
  /**
   * Emit a page-sized background rectangle filled with the document's InDesign
   * "Paper" swatch (`Color/Paper`) behind every populated page, so the serial
   * reproduces the page background InDesign paints implicitly. Default `true`.
   */
  paperBackground?: boolean;
  /**
   * How aggressively a text frame is split into SEPARATE text elements (so each
   * can be connected to its own input field), instead of one element carrying
   * the whole frame's text:
   *
   *  - `'strict'` — every PARAGRAPH break (IDML `<Br/>`, Enter) starts a new
   *    element; a forced line break (U+2028, Shift+Enter) does too when the
   *    style changes across it. Maximises field-connectable elements, but
   *    also splits same-style stacked lines (e.g. a hyphenated "Firmen-\nlogo").
   *  - `'format-and-paragraph-only'` — a break starts a new element only when
   *    the style genuinely differs across it, OR it forms a visual GAP (a blank
   *    line between content). Same-style consecutive lines with no blank line
   *    between stay together as one multi-line element. **Default.**
   *  - `'never'` — never split; the frame is one element, and genuinely mixed
   *    styling is preserved via richText (the pre-split behaviour).
   *
   * When splitting, each element's box starts exactly where the merged frame
   * would render that line, and together the boxes tile the original frame.
   * Splitting needs a canvas for text measurement (browser, or Node with the
   * `@bluepic/core/headless` globals) — without one it degrades to `'never'`.
   */
  textSplittingHeuristic?: TextSplittingHeuristic;
  /**
   * Optional preview-src provider for image elements (by id). The asset-aware
   * converter passes this to inject blob/data previews for displayable images;
   * omitted for a bare kernel convert (embedded rasters/SVG still get data URLs).
   */
  resolveImageSrc?: ImageSrcResolver;
  /**
   * Which core line-box model reproduces InDesign's `VerticalJustification="JustifyAlign"`
   * (lines distributed to fill the frame height). Both emit uniform baseline gaps by
   * widening the line advance; they differ in how the block anchors and how close it
   * lands to InDesign:
   *
   *  - `'fontSize'` — advance = fontSize × lineHeight, first baseline placed via the
   *    canvas hanging offset. Near-exact InDesign match (gap within ~0.2%), and the
   *    grown box overshoots the frame the least. **Default.**
   *  - `'actual-outer'` — outer lines capped to their real ink, inner lines to the
   *    font box, so the block auto-anchors on the first line's actual cap-top. Slightly
   *    further from InDesign and needs a taller grown box, but never relies on the
   *    hanging-offset constant.
   */
  verticalJustifyImplementationBounding?: VerticalJustifyBounding;
  /**
   * How the vertical-justify element reconciles InDesign's behaviour (last line's
   * baseline at the frame bottom, descenders hanging *past* it) with core's rule that
   * text is shrunk to never overflow its box:
   *
   *  - `'grow'` — emit an element a few px TALLER than the IDML frame (= the natural
   *    block height) so the descenders overflow the frame just like InDesign and the
   *    font is never shrunk. Matches InDesign's gap exactly. **Default.**
   *  - `'contain'` — keep the element at the IDML frame height. No shrink, descenders
   *    stay inside, but gaps come out ~3–5% tighter than InDesign (the last line's
   *    descent is reserved instead of overflowing).
   */
  verticalJustifyImplementationFit?: VerticalJustifyFit;
};
/** See {@link ConvertIDML2SerialOptions.textSplittingHeuristic}. */
export type TextSplittingHeuristic = 'strict' | 'format-and-paragraph-only' | 'never';
/** See {@link ConvertIDML2SerialOptions.verticalJustifyImplementationBounding}. */
export type VerticalJustifyBounding = 'fontSize' | 'actual-outer';
/** See {@link ConvertIDML2SerialOptions.verticalJustifyImplementationFit}. */
export type VerticalJustifyFit = 'grow' | 'contain';
/** Resolved options, threaded through the sprite walk. */
type ConvertSettings = { textSplittingHeuristic: TextSplittingHeuristic; verticalJustifyBounding: VerticalJustifyBounding; verticalJustifyFit: VerticalJustifyFit };

class AssetCollector {
  private fonts = new Map<string, Map<string, FontVariant>>(); // family -> styleName|"w|i" -> variant
  readonly missingImages: MissingImage[] = [];
  readonly imagesToUpload: ImageToUpload[] = [];

  constructor(readonly resolveImageSrc?: ImageSrcResolver) {}

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

// ---- color -----------------------------------------------------------------

function channelHex(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}
function rgbToHex(red: number, green: number, blue: number, alpha = 255): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}${channelHex(alpha)}`;
}
/**
 * Apply an IDML tint (0..100 percentage; 100 = full color) to an RGB channel by
 * mixing toward paper-white, matching InDesign's on-screen tint: a 10% Black
 * becomes a light grey, 0% becomes white.
 */
function applyTintChannel(channel: number, tint: number): number {
  return 255 - (255 - channel) * (tint / 100);
}
function colorToHex(color: Color, tint = 100): string {
  const { red, green, blue } = color.getRBG();
  return rgbToHex(applyTintChannel(red, tint), applyTintChannel(green, tint), applyTintChannel(blue, tint));
}
function colorInputToHex(ci: ColorInput | undefined): string | undefined {
  if (!ci) return undefined;
  if (ci.type === 'rgb') return rgbToHex(ci.red, ci.green, ci.blue);
  const r = 255 * (1 - ci.cyan / 100) * (1 - ci.black / 100);
  const g = 255 * (1 - ci.magenta / 100) * (1 - ci.black / 100);
  const b = 255 * (1 - ci.yellow / 100) * (1 - ci.black / 100);
  return rgbToHex(r, g, b);
}
function gradientToSerial(gradient: Gradient, fillAngleDeg: number, tint = 100): Template.Elements.Gradient {
  // Bluepic ColorStop.position is a 0..100 percentage (core renders `${position}%`).
  // IDML stop Location is already 0..100 — do NOT divide.
  const stops = gradient
    .getColorStops()
    .filter((s) => s.color)
    .map((s) => ({ color: colorToHex(s.color!, tint), position: s.position }));
  if (gradient.getType() === 'radial') {
    return { type: 'radial', x1: 0.5, y1: 0.5, radius1: 0, x2: 0.5, y2: 0.5, radius2: 0.5, stops };
  }
  // The IDML gradient direction comes from the SPRITE's GradientFillAngle (θ),
  // whose direction is (cosθ, -sinθ) (see idml2svg/util/fill). Bluepic renders a
  // CSS `${angle}deg` whose direction is (sinφ, -cosφ), so φ = 90 - θ.
  return { type: 'linear', angle: 90 - fillAngleDeg, stops };
}
function paintFrom(value: Color | Gradient | undefined, gradientAngleDeg = 0, tint = 100): Paint {
  if (!value) return null;
  return value instanceof Color ? colorToHex(value, tint) : gradientToSerial(value, gradientAngleDeg, tint);
}
function surfaceOf(sprite: Sprite): SurfaceInput {
  return {
    fill: paintFrom(sprite.getEffectiveFill(), sprite.getGradientFillAngle() ?? 0, sprite.getEffectiveFillTint()),
    stroke: paintFrom(sprite.getEffectiveStroke(), 0, sprite.getEffectiveStrokeTint()),
    strokeWidth: sprite.getEffectiveStrokeWeight(),
    strokeAlignment: sprite.getEffectiveStrokeAlignment(),
    opacity: sprite.getOpacity() / 100,
  };
}

/**
 * Translate an InDesign drop shadow into the Bluepic `filter.dropShadow` value,
 * or null when the sprite has none. InDesign stores the offset (XOffset/YOffset)
 * and blur (Size) in the object's LOCAL, unscaled units; the serial applies them
 * in the element's local space and then scales/rotates by the element transform
 * — exactly how InDesign scales an effect with its object — so we pass them
 * through without compensation. The renderer wants a polar offset
 * (dx = sin(rot)·dist, dy = cos(rot)·dist), so cartesian -> (rotation°, distance).
 */
function dropShadowValue(sprite: Sprite): DropShadowValue | null {
  const ds = sprite.getDropShadow();
  if (!ds) return null;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    rotation: round(Math.atan2(ds.xOffset, ds.yOffset) * (180 / Math.PI)),
    distance: round(Math.hypot(ds.xOffset, ds.yOffset)),
    color: ds.effectColor ? colorToHex(ds.effectColor) : '#000000',
    opacity: round((ds.opacity ?? 100) / 100),
    blur: round(ds.size),
    quality: 3, // InDesign's default shadow quality; not represented in IDML
  };
}

// ---- geometry helpers ------------------------------------------------------

const IDENTITY_DECOMP: DecomposedTransform = { translateX: 0, translateY: 0, rotate: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 };

function cornerRadii(corners: CornerOptions | undefined, _box: Box): [number, number, number, number] {
  if (!corners) return [0, 0, 0, 0];
  const r = (c: { type: string; radius: number }) => (c.type !== 'none' ? c.radius : 0);
  return [r(corners.topLeft), r(corners.topRight), r(corners.bottomRight), r(corners.bottomLeft)];
}
function cornersAreSimple(corners: CornerOptions | undefined): boolean {
  if (!corners) return true;
  return Object.values(corners).every((c) => c.type === 'none' || c.type === 'rounded');
}

function pathFeatures(paths: PathCommand[][]): PathFeature[] {
  const features: PathFeature[] = [];
  for (const sub of paths) {
    for (const cmd of sub) {
      if (cmd.type === 'move') features.push({ type: 'move', x: cmd.x, y: cmd.y });
      else if (cmd.type === 'line') features.push({ type: 'line', x: cmd.x, y: cmd.y });
      else if (cmd.type === 'cubicBezier') features.push({ type: 'cubic-bezier', c1x: cmd.x1, c1y: cmd.y1, c2x: cmd.x2, c2y: cmd.y2, x: cmd.x, y: cmd.y });
      else if (cmd.type === 'close') features.push({ type: 'close' });
    }
  }
  return features;
}

// ---- image ----------------------------------------------------------------

// Gray image-icon placeholder for linked images with no embedded source (same
// graphic the SVG preview uses).
const PLACEHOLDER_SVG = `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#EFF1F3"/><path fill-rule="evenodd" clip-rule="evenodd" d="M33.2503 38.4816C33.2603 37.0472 34.4199 35.8864 35.8543 35.875H83.1463C84.5848 35.875 85.7503 37.0431 85.7503 38.4816V80.5184C85.7403 81.9528 84.5807 83.1136 83.1463 83.125H35.8543C34.4158 83.1236 33.2503 81.957 33.2503 80.5184V38.4816ZM80.5006 41.1251H38.5006V77.8751L62.8921 53.4783C63.9172 52.4536 65.5788 52.4536 66.6039 53.4783L80.5006 67.4013V41.1251ZM43.75 51.6249C43.75 54.5244 46.1005 56.8749 49 56.8749C51.8995 56.8749 54.25 54.5244 54.25 51.6249C54.25 48.7254 51.8995 46.3749 49 46.3749C46.1005 46.3749 43.75 48.7254 43.75 51.6249Z" fill="#687787"/></svg>`;
const PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

async function imageDataUrl(image: ImageSprite, resolveImageSrc?: ImageSrcResolver): Promise<string | undefined> {
  // A converter-supplied preview (compressed blob for any displayable image,
  // embedded or wizard-provided) wins over the kernel's own bytes.
  const provided = resolveImageSrc?.({ imageId: image.getId(), linkURI: image.getLinkURI() });
  if (provided) return provided;

  // Embedded SVG: browser-renderable vector bytes. getRasterContents() returns
  // undefined for vector graphics, so read the raw contents explicitly.
  if (image.getGraphicType() === 'SVG') {
    const svg = image.getContents();
    if (svg) return `data:image/svg+xml;base64,${arrayBufferToBase64(svg)}`;
  }

  // Embedded raster — only when the browser can render the format. TIFF/PSD (also
  // graphicType 'Image') and the vector formats fall through to the placeholder,
  // and ride the upload + bx-files conversion path instead.
  const contents = image.getRasterContents();
  if (contents) {
    let mime = 'image/png';
    try {
      const type = await image.getImageType();
      if (type?.mime) mime = type.mime;
    } catch {
      /* keep default */
    }
    if (isDisplayableImageMime(mime)) return `data:${mime};base64,${arrayBufferToBase64(contents)}`;
  }

  return PLACEHOLDER_IMAGE; // linked with no supplied file, or non-displayable embedded
}

function findImageChild(sprite: RectangleSprite | OvalSprite | PolygonSprite): ImageSprite | undefined {
  return sprite.getSprites().find((s): s is ImageSprite => s.type === 'Image');
}

async function fullImageElement(image: ImageSprite, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const box = image.getBBox();
  if (!box) return null;
  const src = await imageDataUrl(image, collector.resolveImageSrc);
  if (!src) return null;
  await collector.addImage(image.getId(), image); // this element holds the image.src
  const value: SerialImageValue = { src, crop: null, cropMode: 'cover', innerAlign: 'center', mirrorX: false, mirrorY: false, innerRotate: 0 };
  return makeImage(image.getId(), box, [0, 0, 0, 0], value, transform, {});
}

/**
 * The Bluepic image value (src + source-pixel crop) for the region of `image`
 * visible through `frame`'s window. The crop maps the frame-window corners
 * frame-local -> image-content (via inverse of the image's placement, which is
 * relative to its frame since it's nested) -> source pixels. Both the image and
 * mask paths use this so they fit the FRAME box identically. A placeholder /
 * unknown-size image returns crop=null (cover the frame box).
 */
async function frameImageValue(frame: RectangleSprite | OvalSprite | PolygonSprite, image: ImageSprite, pageMatrix: Matrix, resolveImageSrc?: ImageSrcResolver): Promise<SerialImageValue | null> {
  const src = await imageDataUrl(image, resolveImageSrc);
  if (!src) return null;
  const base = { src, cropMode: 'cover' as const, innerAlign: 'center', mirrorX: false, mirrorY: false, innerRotate: 0 };

  // Natural pixel size: decode embedded bytes when we have them, else fall back to
  // the IDML metadata (GraphicBounds x ppi) so a LINKED image whose file the wizard
  // provided still gets the exact InDesign crop, not just a cover fit.
  let natural: { width: number; height: number };
  try {
    natural = await image.getNaturalSize();
  } catch {
    const metadata = image.getMetadataNaturalSize();
    if (!metadata) return { ...base, crop: null };
    natural = metadata;
  }

  const fb = frame.getGeometricBounds();
  const ib = image.getBBox();
  if (!ib || ib.width === 0 || ib.height === 0) return { ...base, crop: null };

  const frameToImage = inverse(bakeSpriteMatrix(image, pageMatrix));
  const corners = [
    { x: fb.x, y: fb.y },
    { x: fb.x + fb.width, y: fb.y },
    { x: fb.x + fb.width, y: fb.y + fb.height },
    { x: fb.x, y: fb.y + fb.height },
  ].map((c) => {
    const local = applyToPoint(frameToImage, c);
    return { x: ((local.x - ib.x) / ib.width) * natural.width, y: ((local.y - ib.y) / ib.height) * natural.height };
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { ...base, crop: { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top } };
}

/**
 * Heuristic: a rectangular frame containing an axis-aligned image becomes a
 * Bluepic image element with per-corner radius + a source-pixel crop. Falls
 * back to a mask for rotated images / non-rounded corners (handled by caller).
 */
async function imageFrameAsImage(frame: RectangleSprite, image: ImageSprite, pageMatrix: Matrix, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const imagePlacement = decomposeMatrix(bakeSpriteMatrix(image, pageMatrix));
  // Only the simple, representable case; otherwise let the caller use a mask.
  if (Math.abs(imagePlacement.rotate) > 0.5 || Math.abs(imagePlacement.skewX) > 0.5) return null;
  if (!cornersAreSimple(frame.getCornerOptions())) return null;

  const value = await frameImageValue(frame, image, pageMatrix, collector.resolveImageSrc);
  if (!value) return null;
  await collector.addImage(frame.getId(), image); // the frame IS the image element here
  const fb = frame.getBBox();
  return makeImage(frame.getId(), fb, cornerRadii(frame.getCornerOptions(), fb), value, transform, surfaceOf(frame));
}

/**
 * Mask fallback (oval / polygon / rotated frames): the frame outline clips the
 * image at its OWN placement (bbox + itemTransform), preserving IDML's intended
 * crop — the image is positioned against the mask shape, not refit to the frame.
 * The image's itemTransform is relative to the frame (nested), so its placement
 * is decompose(imageBaked) directly.
 */
async function imageFrameAsMask(frame: RectangleSprite | OvalSprite | PolygonSprite, image: ImageSprite, pageMatrix: Matrix, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const imageEl = await fullImageElement(image, decomposeMatrix(bakeSpriteMatrix(image, pageMatrix)), collector);
  if (!imageEl) return null;
  const shape = frameOutlineShape(frame);
  if (!shape) return null;
  return makeMask(frame.getId(), [imageEl], [shape], transform, frame.getOpacity() / 100);
}

const MASK_FILL: SurfaceInput = { fill: '#ffffffff', opacity: 1 };

/**
 * The frame's outline as a Bluepic element in frame-local coords (identity
 * transform), painted with `surface` and tagged `${id}-${suffix}`. Shared by
 * both the white mask-clip shape and the frame's own filled background.
 */
function frameShape(frame: RectangleSprite | OvalSprite | PolygonSprite, suffix: string, surface: SurfaceInput): Template.Element {
  // Underscore (not '-'): serial element ids must be valid JS identifiers —
  // bluepic-core turns them into `new Function` parameter names for scoping.
  const id = `${frame.getId()}_${suffix}`;
  if (frame.type === 'Rectangle') {
    const rect = frame as RectangleSprite;
    const box = rect.getBBox();
    return makeRectangle(id, box, cornerRadii(rect.getCornerOptions(), box), IDENTITY_DECOMP, surface);
  }
  if (frame.type === 'Oval') {
    const e = (frame as OvalSprite).getEllipse();
    return makeCircle(id, { x: e.x - e.radiusX, y: e.y - e.radiusY, width: e.radiusX * 2, height: e.radiusY * 2 }, IDENTITY_DECOMP, surface);
  }
  return makePath(id, pathFeatures((frame as PolygonSprite).getPath()), IDENTITY_DECOMP, surface);
}

/** The frame's clip shape, in frame-local coords with identity transform. */
function frameOutlineShape(frame: RectangleSprite | OvalSprite | PolygonSprite): Template.Element {
  return frameShape(frame, 'maskshape', MASK_FILL);
}

/**
 * General frame-with-content: a Rectangle/Oval/Polygon frame that contains
 * nested sprites (a group, polygons, another frame) — the non-image counterpart
 * to imageFrameAsMask. Mirrors idml2svg's "sprite has children => mask".
 *
 * The frame outline is the mask's single clip shape. The frame's own fill and
 * stroke must cover the WHOLE frame (InDesign paints the frame regardless of
 * its content), so they cannot ride on `surfaceRegion: 'shape'` — core computes
 * that surface as UNION(children) ∩ mask shape, which collapses to the content
 * silhouette whenever the content doesn't span the frame (e.g. a vector cutout
 * smaller than its frame gets the frame fill painted on itself and a stroke
 * around its outline). Instead:
 *
 * - The FILL goes on a frame-shaped `_bg` child inside the mask, behind the
 *   content. Being a child, it also anchors the mask's clipped bbox / surface
 *   region to the full frame, even when the fill is empty.
 * - The STROKE (and, for rectangles, the corner radius) stays on the mask
 *   itself, so it draws on top and unclipped (a center stroke shows at full
 *   width, like InDesign). Rectangles use `surfaceRegion: 'bbox'` — with the
 *   `_bg` child present the clipped bbox IS the frame rect; ovals/polygons use
 *   'shape', which now resolves to the full frame outline for the same reason.
 *
 * Children are recursed via spriteToElement (same as the Group case), so their
 * transforms are baked relative to the frame — the mask element carries the
 * frame transform. reverseZOrder() flips the child order afterwards, so the
 * `_bg` child is prepended in natural bottom-first paint order.
 */
async function frameWithContentAsMask(frame: RectangleSprite | OvalSprite | PolygonSprite, pageMatrix: Matrix, transform: DecomposedTransform, collector: AssetCollector, settings: ConvertSettings): Promise<Template.Element | null> {
  const children = (await Promise.all(frame.getSprites().map((child) => spriteToElement(child, pageMatrix, collector, settings)))).filter((c): c is Template.Element => c !== null);
  if (children.length === 0) return null;

  const surface = surfaceOf(frame);
  const opacity = frame.getOpacity() / 100;
  if (!surface.fill && !surface.stroke) {
    return makeMask(frame.getId(), children, [frameOutlineShape(frame)], transform, opacity);
  }

  const background = frameShape(frame, 'bg', { fill: surface.fill, opacity: 1 });
  const strokeSurface: SurfaceInput = { stroke: surface.stroke, strokeWidth: surface.strokeWidth, strokeAlignment: surface.strokeAlignment };
  if (frame.type === 'Rectangle') {
    const rect = frame as RectangleSprite;
    strokeSurface.radius = cornerRadii(rect.getCornerOptions(), rect.getBBox());
    return makeMask(frame.getId(), [background, ...children], [frameOutlineShape(frame)], transform, opacity, strokeSurface, 'bbox');
  }
  return makeMask(frame.getId(), [background, ...children], [frameOutlineShape(frame)], transform, opacity, strokeSurface, 'shape');
}

// ---- text ------------------------------------------------------------------

type EffectiveTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  /** Raw IDML FontStyle name (e.g. "Bold"), used to resolve the exact font binary. */
  styleName?: string;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  /** IDML `Capitalization="AllCaps"` -> renders uppercase (serial `uppercase` prop). */
  uppercase: boolean;
};

// Bluepic textAlign is a 0..1 fraction: offset = (maxLineWidth - lineWidth) * textAlign.
const ALIGN_TO_FRACTION: Record<string, number> = { left: 0, justifyLeft: 0, justify: 0, justifyAll: 0, center: 0.5, justifyCenter: 0.5, right: 1, justifyRight: 1 };
// The IDML *Justified alignments — core's `justifyText` stretches interior lines;
// the last / single-word line falls back to `textAlign` (the fraction above, which
// encodes each variant's last-line position: justifyLeft→0, Center→0.5, Right→1).
const JUSTIFY_ALIGNS = new Set(['justify', 'justifyLeft', 'justifyRight', 'justifyCenter', 'justifyAll']);

function weightFromFontStyle(fontStyle?: string): number {
  const s = (fontStyle ?? '').toLowerCase();
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold')) return 700;
  if (s.includes('semibold') || s.includes('demi')) return 600;
  if (s.includes('medium')) return 500;
  if (s.includes('light')) return 300;
  if (s.includes('thin')) return 100;
  return 400;
}
function italicFromFontStyle(fontStyle?: string): string {
  return (fontStyle ?? '').toLowerCase().includes('italic') ? 'italic' : 'normal';
}

function effectiveTextStyle(paragraph: ParagraphOutput, feature: ParagraphOutput['features'][number], defaultFont: string): EffectiveTextStyle {
  // Precedence (later wins): applied para -> local para -> applied char -> local char.
  const layers: Array<Record<string, unknown> | undefined> = [paragraph.appliedParagraphStyle, paragraph.localParagraphStyle, feature.appliedCharacterStyle, feature.localCharacterStyleInput];
  const pick = (key: string): unknown => {
    let value: unknown;
    for (const layer of layers) {
      const v = layer?.[key];
      if (v !== undefined) value = v;
    }
    return value;
  };
  const fontStyle = pick('fontStyle') as string | undefined;
  const fontSize = (pick('fontSize') as number | undefined) ?? 12;
  const leading = pick('leading') as number | undefined;
  const tracking = (pick('tracking') as number | undefined) ?? 0;
  const fillColor = pick('fillColor') as ColorInput | undefined;
  // Only AllCaps maps to the serial's boolean `uppercase`; SmallCaps has no
  // Bluepic equivalent, so it renders as-is (not forced to full caps).
  const capitalization = pick('capitalization') as string | undefined;
  return {
    // No explicit font in any style layer -> the document's root default
    // ([No paragraph style] AppliedFont), which is what unstyled IDML text
    // inherits via the BasedOn chain.
    fontFamily: (pick('appliedFont') as string | undefined) ?? defaultFont,
    fontSize,
    fontWeight: weightFromFontStyle(fontStyle),
    fontStyle: italicFromFontStyle(fontStyle),
    styleName: fontStyle,
    // Bluepic letterSpacing is a RATIO: core applies (value - 1) * fontSize as
    // extra px, so 1 = normal (0 would mean -1em = catastrophic). IDML tracking
    // is in 1/1000 em, i.e. extra-em = tracking/1000.
    letterSpacing: 1 + tracking / 1000,
    lineHeight: leading && leading > 0 ? leading / fontSize : 1.2,
    color: colorInputToHex(fillColor) ?? '#000000ff',
    uppercase: capitalization === 'allCaps',
  };
}

// InDesign optical fitting leaves tiny per-range Tracking values (e.g. 15/1000
// em to squeeze one line) that are visually negligible but would otherwise
// force the whole element into richtext mode. Bluepic prefers plaintext, so
// letterSpacing ratios within this distance count as equal — deliberate
// letterspacing (spaced caps etc.) uses much larger tracking (>= 50/1000 em).
const LETTER_SPACING_TOLERANCE = 0.03;
const sameLetterSpacing = (a: number, b: number) => Math.abs(a - b) <= LETTER_SPACING_TOLERANCE;
// NB: `uppercase` is deliberately NOT compared here. The serial's `uppercase` is
// an element-level flag with no per-run richText equivalent, so making it split
// runs would only churn plaintext->richtext without actually rendering mixed
// caps correctly. Element uppercase is instead derived from ALL runs (every), so
// a uniform AllCaps frame gets it; a mixed frame renders as-is (as before).
const sameTextStyle = (a: EffectiveTextStyle, b: EffectiveTextStyle) =>
  a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.fontWeight === b.fontWeight && a.fontStyle === b.fontStyle && a.color === b.color && sameLetterSpacing(a.letterSpacing, b.letterSpacing);

// Baseline-to-baseline distances (leading = lineHeight * fontSize) within this many
// points count as equal. Core has no per-LINE leading, so two lines that differ only
// in leading can't be spaced correctly inside one element — they must become separate
// elements, each positioned on the InDesign baseline grid. Used ONLY for the split
// decision, deliberately NOT part of `sameTextStyle` (which also gates plaintext vs
// richtext — leading has no per-run richText equivalent, so it must not churn that).
const LEADING_TOLERANCE = 0.5;
const sameLeading = (a: EffectiveTextStyle, b: EffectiveTextStyle) => Math.abs(a.lineHeight * a.fontSize - b.lineHeight * b.fontSize) <= LEADING_TOLERANCE;

// `spaceBefore` = extra vertical space (pt) above this run's FIRST line, from IDML
// paragraph spacing (SpaceAfter of the previous paragraph + SpaceBefore of this
// one). Set only on the first run of a paragraph (never the frame's first). It
// both forces a chunk split at that boundary and feeds the baseline grid.
type TextRun = { text: string; style: EffectiveTextStyle; align: number; justify: boolean; spaceBefore?: number };
/** One future text element: a paragraph (or a style-delimited piece of one). */
type TextChunk = { runs: TextRun[]; align: number; justify: boolean };

const chunkText = (chunk: TextChunk) => chunk.runs.map((r) => r.text).join('');

/**
 * Split runs into chunks (= future text elements) at hard breaks. What counts
 * as "hard" (starts a new element) vs "soft" (kept as a `\n` inside the same
 * element) depends on the heuristic. A style OR leading change across a break is
 * always "differs" — differing leading forces a split because core has no per-line
 * leading, so the two lines can only be spaced correctly as separate elements:
 *
 *  - `'strict'`: every PARAGRAPH break (IDML `<Br/>`, Enter) is hard; a forced
 *    break (U+2028, Shift+Enter) is hard only when the style/leading differs.
 *  - `'format-and-paragraph-only'`: ANY break is hard only when the style/leading
 *    differs across it OR it forms a GAP (a blank line between content) — so
 *    same-style consecutive lines with no blank line between (a hyphenated
 *    "Firmen-\nlogo", a wrapped address) stay together as one element.
 *
 * `'never'` is handled by the caller (one element, richText for real diffs)
 * and never reaches here. Returned chunks are in order and may include empty
 * ones (blank-line gaps); callers skip those when emitting but need them for
 * line accounting.
 */
function splitRunsIntoChunks(runs: TextRun[], heuristic: 'strict' | 'format-and-paragraph-only'): TextChunk[] {
  // 1. Cut the runs into segments at every hard-break character, tagging each
  //    with the kind of break that precedes it.
  type Segment = { runs: TextRun[]; breakBefore: 'paragraph' | 'forced' | null };
  const segments: Segment[] = [{ runs: [], breakBefore: null }];
  for (const run of runs) {
    // `spaceBefore` belongs to the run's FIRST line only (the paragraph's first
    // line). When a run spans several lines via internal forced breaks, the later
    // lines must not inherit it, or they'd look like spaced paragraph starts and
    // split spuriously (Anuga's "Cologne...Anuga..." is one run over two lines).
    let firstPart = true;
    for (const part of run.text.split(/(\n|\u2028)/)) {
      if (part === '') continue;
      if (part === '\n' || part === '\u2028') segments.push({ runs: [], breakBefore: part === '\n' ? 'paragraph' : 'forced' });
      else {
        segments[segments.length - 1].runs.push({ ...run, text: part, spaceBefore: firstPart ? run.spaceBefore : undefined });
        firstPart = false;
      }
    }
  }

  const lastContent = (chunk: TextChunk) => [...chunk.runs].reverse().find((r) => r.text.trim() !== '');
  const firstContent = (seg: Segment) => seg.runs.find((r) => r.text.trim() !== '');
  const isEmpty = (chunk: TextChunk) => chunk.runs.every((r) => r.text.trim() === '');

  // 2. Fold segments into chunks: a soft break joins with a `\n`, a hard break
  //    starts a new chunk.
  const chunks: TextChunk[] = [];
  let current: TextChunk = { runs: [], align: 0, justify: false };
  segments.forEach((seg, index) => {
    if (index > 0) {
      const prev = lastContent(current);
      const next = firstContent(seg);
      // A GAP is a break with no real content on one side = a blank line.
      const gap = !prev || !next;
      const styleDiffers = !!prev && !!next && (!sameTextStyle(prev.style, next.style) || !sameLeading(prev.style, next.style));
      // Paragraph spacing (SpaceBefore/After) can only be reproduced across
      // separate elements, so a spaced boundary is always a hard break.
      const spaced = !!next?.spaceBefore;
      const hard = spaced || (heuristic === 'strict' ? seg.breakBefore === 'paragraph' || styleDiffers : styleDiffers || gap);
      if (hard) {
        chunks.push(current);
        current = { runs: [], align: 0, justify: false };
      } else {
        // Soft break: keep it as a line break within the element.
        const styleSource = prev ?? next;
        if (styleSource) current.runs.push({ ...styleSource, text: '\n' });
      }
    }
    // The chunk inherits the alignment of the first paragraph that contributes
    // real content to it.
    const firstReal = firstContent(seg);
    if (firstReal && isEmpty(current)) {
      current.align = firstReal.align;
      current.justify = firstReal.justify;
    }
    current.runs.push(...seg.runs);
  });
  chunks.push(current);
  return chunks;
}

/**
 * Text measurement/layout comes from @bluepic/core (single source of truth
 * with the renderer) and needs a canvas, which plain Node lacks — so it is
 * loaded lazily on the first frame that actually wants splitting, and on
 * failure conversion degrades gracefully to unsplit text elements.
 */
let textLayoutModulePromise: Promise<typeof import('@bluepic/core/text') | null> | undefined;
function loadTextLayout() {
  textLayoutModulePromise ??= import('@bluepic/core/text').catch((error) => {
    console.warn('[idml2serial] @bluepic/core/text unavailable (no canvas in this environment?) — text frames will not be split at line breaks.', error);
    return null;
  });
  return textLayoutModulePromise;
}

/** Build one text element from runs (uniform runs collapse to plaintext). */
function textElementFromRuns(id: string, runs: TextRun[], box: Box, align: number, justify: boolean, verticalAlign: number, lineHeightPercent: number, transform: DecomposedTransform, bounding?: TextBounding): Template.Elements.Text {
  const base = runs[0].style;
  const uniform = runs.every((r) => sameTextStyle(r.style, base));
  const plainText = runs.map((r) => r.text).join('');
  // `uppercase` is element-level (no per-run equivalent in the richText format).
  // Set it only when EVERY run is AllCaps, so a mixed element never force-caps a
  // normal run — since `uppercase` is part of sameTextStyle, uniform elements are
  // consistently all-caps or all-not anyway; splitting keeps them apart.
  const uppercase = runs.length > 0 && runs.every((r) => r.style.uppercase);
  const richText: RichTextRun[] = runs.map((r) => {
    const format: Record<string, unknown> = {};
    if (r.style.fontFamily !== base.fontFamily) format.fontFamily = r.style.fontFamily;
    if (r.style.fontSize !== base.fontSize) format.fontSize = r.style.fontSize;
    if (r.style.fontWeight !== base.fontWeight) format.fontWeight = r.style.fontWeight;
    if (r.style.fontStyle !== base.fontStyle) format.fontStyle = r.style.fontStyle;
    if (!sameLetterSpacing(r.style.letterSpacing, base.letterSpacing)) format.letterSpacing = r.style.letterSpacing;
    if (r.style.color !== base.color) format.color = r.style.color;
    return { text: r.text, format };
  });

  return makeText(
    id,
    {
      box,
      textMode: uniform ? 'plaintext' : 'richtext',
      text: plainText,
      richText,
      fontFamily: base.fontFamily,
      fontSize: base.fontSize,
      fontWeight: base.fontWeight,
      fontStyle: base.fontStyle,
      lineHeight: lineHeightPercent,
      letterSpacing: base.letterSpacing,
      textAlign: align,
      justifyText: justify,
      verticalAlign,
      bounding,
      autoLinebreaks: true,
      uppercase,
      fill: base.color,
    },
    transform
  );
}

/**
 * Vertical offset (px, frame-local) to add to a TOP-aligned text frame's box so
 * bluepic-core renders its baselines where InDesign does.
 *
 * InDesign's default First Baseline Offset is "Ascent": the first line's baseline
 * sits at `frameTop + fontAscent`. bluepic-core, because {@link makeText} emits
 * `bounding: 'fontSize'`, draws every line with canvas `textBaseline: 'hanging'`,
 * which sits at `frameTop + 0.8*fontAscent` (the canvas hanging baseline is a
 * fixed 0.8*ascent for every font without a BASE table, i.e. all Latin fonts;
 * verified across Barlow/Minion/Arial/Georgia/Times). So core places EVERY line
 * `0.2*ascent` too high; since later lines advance by leading in both systems,
 * the whole block is a constant `0.2*ascent` too high, and shifting the box down
 * by that amount (from the first line's font) corrects all lines at once.
 *
 * `fontAscent` is the canvas `fontBoundingBoxAscent` of the first run: the same
 * metric InDesign's "Ascent" reads (measured equal for the document fonts) and
 * the same canvas core measures against, so the correction is self-consistent
 * with the renderer rather than an independent guess. Returns 0 when no canvas is
 * available, leaving the box (and thus the prior, slightly-high output) unchanged.
 *
 * Only top alignment is corrected; center/bottom justification anchors the block
 * differently and is left untouched for now.
 */
// The canvas 'hanging' baseline sits a fixed 0.8*ascent above the alphabetic
// baseline for every font without a BASE table (all Latin fonts; verified across
// Barlow/Minion/Arial/Georgia/Times), so the alphabetic baseline a top-aligned
// line renders at is 0.8*ascent below its box top. The first-baseline shift adds
// the remaining 0.2*ascent to match InDesign's Ascent first-baseline.
const HANGING_BASELINE_FRACTION = 0.8;

/** Canvas `fontBoundingBoxAscent` for a style at a given size (default the style's
 * own) — the metric InDesign's Ascent first-baseline and core both read. 0 if no
 * canvas / unmeasurable. */
function fontAscent(core: typeof import('@bluepic/core/text'), style: EffectiveTextStyle, fontSize: number = style.fontSize): number {
  try {
    const metrics = core.textInfo('Mg', { fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize, letterSpacing: style.letterSpacing }, 'alphabetic', false);
    const ascent = metrics?.fontBoundingBoxAscent;
    return ascent && Number.isFinite(ascent) ? ascent : 0;
  } catch {
    return 0;
  }
}

/** A layout probe over the merged frame: `(lineHeight%, bounding, blockTopY, maxHeight)`.
 * Vertical justify uses it to read the natural (huge maxHeight = un-shrunk) block. */
type ProbeLayout = (lineHeight: number, bounding: TextBounding, y: number, maxHeight: number) => import('@bluepic/core/text').TextLayoutResult;

/** actualBoundingBox ascent/descent of ONE rendered line's text at the base style — the
 * real ink extent (content-dependent), used to anchor vertical justify on InDesign's grid. */
function lineActualMetrics(core: typeof import('@bluepic/core/text'), style: EffectiveTextStyle, text: string): { ascent: number; descent: number } {
  try {
    const m = core.textInfo(text || 'M', { fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: style.fontSize, letterSpacing: style.letterSpacing }, 'alphabetic', false);
    const asc = m?.actualBoundingBoxAscent;
    const desc = m?.actualBoundingBoxDescent;
    return { ascent: asc && Number.isFinite(asc) ? asc : 0, descent: desc && Number.isFinite(desc) ? desc : 0 };
  } catch {
    return { ascent: 0, descent: 0 };
  }
}

/** Binary-search the lineHeight % whose natural (un-shrunk) block height equals `target`
 * — the widest line spread that still fits a frame without core shrinking the font. */
function fitLineHeightForBlockHeight(probe: ProbeLayout, bounding: TextBounding, y: number, target: number): number {
  let lo = 50;
  let hi = 1000;
  for (let k = 0; k < 32; k++) {
    const mid = (lo + hi) / 2;
    if (probe(mid, bounding, y, 1e6).virtualBBox.height < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function firstBaselineAscentShift(core: typeof import('@bluepic/core/text'), style: EffectiveTextStyle): number {
  try {
    return (1 - HANGING_BASELINE_FRACTION) * fontAscent(core, style);
  } catch {
    return 0;
  }
}

/**
 * Reproduce InDesign `VerticalJustification="JustifyAlign"` as ONE Bluepic text
 * element: the lines are spread to a uniform baseline gap that fills the frame, with
 * the first baseline on InDesign's grid (frameTop + the first line's actual ascent).
 *
 * Core has no vertical-justify mode and ALWAYS shrinks text that would overflow its
 * box, so we widen the line advance (lineHeight) to the justified gap and place the
 * box ourselves. Two knobs, from {@link ConvertSettings}:
 *  - bounding `'fontSize'` (advance = fontSize×lineHeight; near-exact InDesign match,
 *    box grows the least) or `'actual-outer'` (block auto-anchors on the first line's
 *    real ink, never needs the hanging-offset constant).
 *  - fit `'grow'` (box a few px TALLER than the frame so the last line's descenders
 *    overflow it like InDesign and the font is never shrunk — gap exact) or `'contain'`
 *    (box = frame height; descenders kept inside, gap ~3–5% tighter).
 *
 * The baseline advance is linear in lineHeight with slope fontSize/100 in BOTH bounding
 * modes (verified), so one calibration probe fixes the constant offset and lets us solve
 * lineHeight for a target gap. Returns null (caller falls through to the normal path)
 * for a single line, a frame too short to spread into, or unusable measurements.
 */
function buildVerticalJustifyElement(
  id: string,
  runs: TextRun[],
  box: Box,
  align: number,
  justify: boolean,
  transform: DecomposedTransform,
  core: typeof import('@bluepic/core/text'),
  base: EffectiveTextStyle,
  settings: ConvertSettings,
  probe: ProbeLayout
): Template.Elements.Text | null {
  const frameTop = box.y;
  const bounding = settings.verticalJustifyBounding;
  const naturalLineHeight = base.lineHeight * 100;
  const HUGE = 1e6;

  // How many lines the text naturally wraps to at its own leading (un-shrunk).
  const natural = probe(naturalLineHeight, bounding, frameTop, HUGE);
  const N = natural.lines.length;
  if (N < 2) return null; // one line: nothing to distribute — normal path applies.

  // InDesign anchors the justified block so the first line's ink cap-top meets the
  // frame top: first baseline = frameTop + that line's actual ascent.
  const mTop = lineActualMetrics(core, base, natural.lines[0]?.text ?? '').ascent;

  // BASELINE advance(lineHeight) = offset + (fontSize/100)*lineHeight — calibrate once.
  // Must be measured baseline-to-baseline (`y + ascent`), NOT box-top to box-top: in
  // 'actual-outer' the outer line's box is shorter, so its box-top gap differs from the
  // (uniform) baseline gap we target. For 'fontSize' ascent is 0, so the two coincide.
  const slope = base.fontSize / 100;
  const calib = probe(150, bounding, frameTop, HUGE);
  const baselineOf = (l: { y: number; ascent: number }) => l.y + l.ascent;
  const advRef = calib.lines.length > 1 ? baselineOf(calib.lines[1]) - baselineOf(calib.lines[0]) : base.fontSize * 1.5;
  const offset = advRef - slope * 150;
  // Where the first VISUAL baseline sits below the block top for this bounding mode:
  // 'actual-outer' reports it as the first line's ascent; 'fontSize' draws hanging.
  const firstBaselineOffset = bounding === 'actual-outer' ? (calib.lines[0]?.ascent ?? mTop) : HANGING_BASELINE_FRACTION * fontAscent(core, base);

  let lineHeightPercent: number;
  let boxHeight: number;
  if (settings.verticalJustifyFit === 'contain') {
    // Widest spread whose natural block still fits the frame (no shrink, descenders in).
    lineHeightPercent = fitLineHeightForBlockHeight(probe, bounding, frameTop, box.height);
    boxHeight = box.height;
  } else {
    // grow: uniform gap from the first baseline down to the frame bottom (descent overflows).
    const gap = (box.height - mTop) / (N - 1);
    lineHeightPercent = (gap - offset) / slope;
    // Grow the box to the natural block height so core never shrinks the overflowing text.
    const block = probe(lineHeightPercent, bounding, frameTop, HUGE).virtualBBox.height;
    boxHeight = Math.max(box.height, block + 0.5);
  }

  // Only justify when it actually SPREADS the lines (widens past their natural leading);
  // a frame shorter than the natural block would compress/shrink — leave that to the
  // normal path, which fits it the usual way.
  if (!Number.isFinite(lineHeightPercent) || lineHeightPercent <= naturalLineHeight) return null;

  const justifyBox = { ...box, y: frameTop + mTop - firstBaselineOffset, height: boxHeight };
  return textElementFromRuns(id, runs, justifyBox, align, justify, 0, lineHeightPercent, transform, bounding);
}

/**
 * Convert a text frame's story into one or more Bluepic text elements.
 *
 * Bluepic connects text elements to input fields, so a frame that stacks
 * several statements can become one element per statement. How eagerly that
 * happens is controlled by `settings.textSplittingHeuristic` — see
 * {@link splitRunsIntoChunks} for the split rules and {@link
 * ConvertIDML2SerialOptions.textSplittingHeuristic} for the modes.
 *
 * Geometry: the ORIGINAL merged frame is laid out ONCE via @bluepic/core/text
 * (the renderer's own fitting + line stacking, so positions are exactly what
 * bluepic-core will render). Each chunk's box then starts at its first line's
 * y, ends where the next emitted chunk starts (the last one at the frame
 * bottom), keeps the full frame width, and is top-anchored (verticalAlign 0)
 * — so every line renders exactly where the merged frame would have put it,
 * and together the boxes tile the frame's vertical extent. Line-x math is
 * width-invariant (offset = (max - line) * align), so alignment is preserved
 * per chunk. All chunks keep the MERGED element's lineHeight ratio — IDML
 * per-paragraph leading is (as before) not preserved — which keeps each
 * chunk's own rendering self-consistent with the merged layout above.
 *
 * With `bounding: 'fontSize'` (what makeText emits) line advances depend only
 * on fontSize × lineHeight, NOT on font metrics — so chunk positions are
 * exact even when the document's fonts aren't loaded at conversion time; only
 * auto-wrap points (and therefore how many lines a chunk occupies) need real
 * measurements.
 *
 * When splitting is off, unnecessary (single statement) or unavailable (no
 * canvas), the result is a single element equal to the pre-split output —
 * except that U+2028 is now always normalized to '\n' (core only breaks
 * lines on '\n'; a raw U+2028 would render as a glyph, not a break).
 */
async function buildTextElements(frame: TextFrame, box: Box, singleElementTransform: DecomposedTransform, collector: AssetCollector, id: string, settings: ConvertSettings): Promise<Template.Elements.Text[]> {
  const paragraphs = frame.getStory()?.getParagraphs() ?? [];
  if (paragraphs.length === 0) return [];

  // The document's root default font ([No paragraph style] AppliedFont), used
  // when a paragraph/character style defines none (it inherits via BasedOn).
  const defaultFont = frame.context.idml.getParagraphStyleById('ParagraphStyle/$ID/[No paragraph style]')?.appliedFont ?? 'Arial';

  // Paragraph spacing (local override wins over the applied style). InDesign adds
  // SpaceAfter(prev) + SpaceBefore(this) between paragraphs, and ignores SpaceBefore
  // on the very first paragraph of a frame.
  const paraSpaceBefore = (p: (typeof paragraphs)[number]) => p.localParagraphStyle?.spaceBefore ?? p.appliedParagraphStyle?.spaceBefore ?? 0;
  const paraSpaceAfter = (p: (typeof paragraphs)[number]) => p.localParagraphStyle?.spaceAfter ?? p.appliedParagraphStyle?.spaceAfter ?? 0;

  const runs: TextRun[] = [];
  let firstAlign = 0;
  let firstJustify = false;
  paragraphs.forEach((paragraph, pIndex) => {
    // Local paragraph alignment OVERRIDES the applied style's alignment.
    const alignName = (paragraph.localParagraphStyle?.align ?? paragraph.appliedParagraphStyle?.align ?? 'left') as string;
    const align = ALIGN_TO_FRACTION[alignName] ?? 0;
    const justify = JUSTIFY_ALIGNS.has(alignName);
    if (pIndex === 0) {
      firstAlign = align;
      firstJustify = justify;
    }
    const incomingSpace = pIndex === 0 ? 0 : paraSpaceAfter(paragraphs[pIndex - 1]) + paraSpaceBefore(paragraph);
    let firstRunOfPara = true;
    for (const feature of paragraph.features) {
      const style = effectiveTextStyle(paragraph, feature, defaultFont);
      // Resolve the concrete binary: family + IDML style -> Fonts.xml font (for
      // its PostScript name) -> XMP metadata (for the original file name).
      const idml = frame.context.idml;
      const font = idml.getFont(style.fontFamily, style.styleName);
      const documentFont = idml.resolveFontFile({ family: style.fontFamily, styleName: style.styleName, postScriptName: font?.postScriptName });
      collector.addFont(style.fontFamily, {
        weight: style.fontWeight,
        italic: style.fontStyle === 'italic',
        styleName: style.styleName,
        postScriptName: font?.postScriptName ?? documentFont?.fontName,
        fontFileName: documentFont?.fontFileName,
        fontType: documentFont?.fontType ?? font?.type,
      });
      runs.push({ text: feature.content ?? '', style, align, justify, spaceBefore: firstRunOfPara && incomingSpace > 0 ? incomingSpace : undefined });
      firstRunOfPara = false;
    }
    // Paragraph boundary = hard break. InDesign usually carries it as a
    // trailing <Br/> INSIDE the last CharacterStyleRange of the range (already
    // a '\n' in that run's content) — only add one when the paragraph's own
    // content didn't supply it, otherwise we'd emit a double break.
    const lastFeatureText = paragraph.features.length > 0 ? (paragraph.features[paragraph.features.length - 1].content ?? '') : '';
    if (pIndex < paragraphs.length - 1 && !lastFeatureText.endsWith('\n')) {
      runs.push({ text: '\n', style: runs[runs.length - 1]?.style ?? effectiveTextStyle(paragraph, paragraph.features[0], defaultFont), align, justify });
    }
  });

  const base = runs[0]?.style;
  if (!base) return [];
  const verticalAlign = frame.getVerticalAlign();
  const verticalJustify = frame.isVerticalJustify();
  let lineHeightPercent = base.lineHeight * 100; // relative %, e.g. 120 (widened below for vertical justify)

  // Drop a trailing empty paragraph: a final line break with no content after it
  // (often styled at the largest size) is an invisible last line for TOP-aligned
  // text, but core would count it in the frame fit and shrink the whole block to
  // make room \u2014 InDesign never shrinks visible text to fit it. For center/bottom
  // that empty line legitimately shifts the visible text, so leave it there.
  // Only trailing NEWLINES are stripped: trailing spaces stay (they can matter
  // for a right/center-aligned last line's position and never add a phantom line).
  // Leading of the trailing pilcrow(s) trimmed here. In InDesign the paragraph-end
  // character sits ON the last visible line, so a trailing empty range styled larger
  // than the last content (e.g. "Position"(14pt lead) followed by an empty 23pt range
  // \u2192 24.85) raises that line's effective leading. Captured to fold into the last
  // chunk's leading when we position split lines on InDesign's baseline grid.
  let trimmedTrailingLeading = 0;
  if (verticalAlign === 0) {
    const isBlankLine = (t: string) => t === '' || (/[\n\u2028\u2029]/.test(t) && t.trim() === '');
    while (runs.length > 1 && isBlankLine(runs[runs.length - 1].text)) {
      const dropped = runs.pop()!;
      trimmedTrailingLeading = Math.max(trimmedTrailingLeading, dropped.style.lineHeight * dropped.style.fontSize);
    }
    const lastRun = runs[runs.length - 1];
    if (lastRun) lastRun.text = lastRun.text.replace(/[\n\u2028\u2029]+$/, '');
  }

  const fullText = runs.map((r) => r.text).join('');
  if (fullText.trim() === '') return []; // empty frame -> no text element (caller still draws any background)

  // `core` is null without a canvas (plain Node) \u2014 vertical justify and the ascent-vs-
  // hanging first-baseline correction both need measurement, so they no-op there and the
  // frame keeps its natural leading / box.
  const core = await loadTextLayout();

  // Forced breaks normalized: core only breaks lines on '\n', so a raw U+2028 would
  // render as a glyph. Reused by every layout + emit path below.
  const normalizedRuns = runs.map((r) => ({ ...r, text: r.text.replace(/\u2028/g, '\n') }));

  // Lay out the merged frame exactly as bluepic-core would render it. `bounding`, block
  // top `y` and `maxHeight` are params: the split path uses the emit bounding at the
  // shifted box, while vertical justify probes the natural (huge maxHeight = un-shrunk)
  // block and may measure 'actual-outer'. `lineHeight` is a param because justify widens it.
  const probeLayout: ProbeLayout = (lineHeight, bounding, y, maxHeight) =>
    core!.layoutText({
      // Measure AllCaps runs as uppercase \u2014 capitals are wider, so wrapping matches.
      features: normalizedRuns.map((r) => ({
        text: r.style.uppercase ? r.text.toUpperCase() : r.text,
        style: { fontFamily: r.style.fontFamily, fontSize: r.style.fontSize, fontWeight: r.style.fontWeight, fontStyle: r.style.fontStyle === 'italic' ? 'italic' : 'normal', letterSpacing: r.style.letterSpacing, color: r.style.color, rotate: 0, scale: 1 },
      })),
      fontSize: base.fontSize, x: box.x, y, maxWidth: box.width, maxHeight,
      anchor: [firstAlign, verticalAlign], lineHeight, bounding, textAlign: firstAlign, justifyText: firstJustify,
      autoLinebreaks: true, allowBreakChars: false, cachingEnabled: false,
    });

  // Vertical justify short-circuits to ONE distributed element: it owns its box.y (first
  // baseline on InDesign's grid) and box.height (grown past the frame, or contained), so
  // it runs BEFORE the generic top shift and INSTEAD of the split path. Returns null
  // (fall through) for <2 lines, too-short frames, or if measurement fails.
  if (verticalJustify && core) {
    const justified = buildVerticalJustifyElement(id, normalizedRuns, box, firstAlign, firstJustify, singleElementTransform, core, base, settings, probeLayout);
    if (justified) return [justified];
  }

  // Compensate the ascent-vs-hanging first-baseline mismatch for ordinary top-aligned text.
  if (verticalAlign === 0 && core) box = { ...box, y: box.y + firstBaselineAscentShift(core, base) };

  // The unsplit fallback: everything in one element.
  const singleElement = () => [textElementFromRuns(id, normalizedRuns, box, firstAlign, firstJustify, verticalAlign, lineHeightPercent, singleElementTransform)];

  // Line-stacking layout for the split path: emit bounding ('fontSize'), the shifted box.
  const runLayout = (lineHeight: number) => probeLayout(lineHeight, 'fontSize', box.y, box.height);

  // 'never' keeps the whole frame as one element (richText carries real diffs).
  if (settings.textSplittingHeuristic === 'never') return singleElement();

  const chunks = splitRunsIntoChunks(runs, settings.textSplittingHeuristic);
  const emittable = chunks.filter((chunk) => chunkText(chunk).trim() !== '');
  if (emittable.length <= 1) return singleElement();

  if (!core) return singleElement();

  // Lay out the merged frame (justify already widened lineHeightPercent above, so
  // split chunks distribute to fill the frame just like the single-element path).
  let layout: import('@bluepic/core/text').TextLayoutResult;
  try {
    layout = runLayout(lineHeightPercent);
  } catch (error) {
    console.warn(`[idml2serial] text layout failed for frame ${frame.getId()} — emitting it unsplit.`, error);
    return singleElement();
  }

  // The merged fit may have shrunk the text to fit the frame (uniformly — the
  // fitter multiplies every run by one factor). Chunks must inherit that
  // scale, otherwise a chunk with slack in its box would bounce back to the
  // original size and render bigger than its shrunken siblings. The maximum
  // run size is invariant under the uniform scale, so it recovers the factor.
  const originalMaxFontSize = Math.max(...runs.map((r) => r.style.fontSize));
  const fittedMaxFontSize = Math.max(...layout.lines.flatMap((line) => line.features.map((f) => f.style.fontSize)));
  const fitScale = Number.isFinite(fittedMaxFontSize) && originalMaxFontSize > 0 ? fittedMaxFontSize / originalMaxFontSize : 1;

  // Every '\n'-terminated piece of the merged text is one "segment"; the
  // layout marks each segment's last wrapped line via paragraphEnd. Record
  // where each segment starts vertically and how many lines it wrapped to.
  const segmentTops: number[] = [];
  const segmentLineCounts: number[] = [];
  let segmentOpen = false;
  let segLines = 0;
  for (const line of layout.lines) {
    if (!segmentOpen) {
      segmentTops.push(line.y);
      segmentOpen = true;
      segLines = 0;
    }
    segLines++;
    if (line.paragraphEnd) {
      segmentLineCounts.push(segLines);
      segmentOpen = false;
    }
  }
  if (segmentOpen) segmentLineCounts.push(segLines);
  // A chunk covers (inline '\n' count + 1) segments. Sanity: the totals must
  // agree with the layout, otherwise fall back to the unsplit element.
  const segmentCounts = chunks.map((chunk) => (chunkText(chunk).match(/\n/g)?.length ?? 0) + 1);
  if (segmentCounts.reduce((a, b) => a + b, 0) !== segmentTops.length) {
    console.warn(`[idml2serial] line/segment mismatch for frame ${frame.getId()} — emitting it unsplit.`);
    return singleElement();
  }

  // Per-segment effective leading = the max IDML leading of the runs on that
  // segment (auto-leading is already baked into run.lineHeight = leading/fontSize).
  // This is InDesign's baseline-to-baseline distance PER LINE, which core's single
  // frame line-height flattens — so a small subtitle under a big name (or vice
  // versa) mis-spaces. Built by mirroring splitRunsIntoChunks' segment cut so it
  // lines up 1:1 with segmentTops. The last visible segment also inherits the
  // trimmed trailing pilcrow's leading (its ¶ sits on that line: Anuga 14->24.85).
  // `segmentSpaceBefore` carries IDML paragraph spacing (SpaceAfter(prev) +
  // SpaceBefore(this)) as extra room above a paragraph's first line \u2014 kept 1:1 with
  // segmentLeadings and added into the baseline grid below.
  const runLeading = (r: TextRun) => r.style.lineHeight * r.style.fontSize;
  const segmentLeadings: number[] = [0];
  const segmentSpaceBefore: number[] = [0];
  for (const run of runs) {
    let spaceApplied = false;
    for (const part of run.text.split(/(\n|\u2028)/)) {
      if (part === '') continue;
      if (part === '\n' || part === '\u2028') {
        segmentLeadings.push(0);
        segmentSpaceBefore.push(0);
      } else {
        const i = segmentLeadings.length - 1;
        segmentLeadings[i] = Math.max(segmentLeadings[i], runLeading(run));
        if (run.spaceBefore && !spaceApplied) {
          segmentSpaceBefore[i] = Math.max(segmentSpaceBefore[i], run.spaceBefore);
          spaceApplied = true;
        }
      }
    }
  }
  segmentLeadings[segmentLeadings.length - 1] = Math.max(segmentLeadings[segmentLeadings.length - 1], trimmedTrailingLeading);

  // InDesign baseline grid (offset from segment 0's first line): each line advances
  // by its OWN leading; a wrapped segment's inner lines share that segment's
  // leading, then the next segment's first line advances by its leading PLUS any
  // paragraph spacing above it. All in original (pre-fitScale) units; scaled at use.
  const baselineGrid: number[] = new Array(segmentTops.length).fill(0);
  for (let s = 1; s < segmentTops.length; s++) {
    const prevWrapped = Math.max(0, (segmentLineCounts[s - 1] ?? 1) - 1);
    baselineGrid[s] = baselineGrid[s - 1] + prevWrapped * segmentLeadings[s - 1] + segmentLeadings[s] + segmentSpaceBefore[s];
  }

  // Top y of each chunk = its first segment's first line; skip empty chunks
  // (their vertical space folds into the preceding emitted chunk).
  const emitted: { chunk: TextChunk; top: number; segIndex: number }[] = [];
  let segmentCursor = 0;
  chunks.forEach((chunk, index) => {
    const segIndex = segmentCursor;
    const top = segmentTops[segmentCursor];
    segmentCursor += segmentCounts[index];
    if (chunkText(chunk).trim() !== '') emitted.push({ chunk, top, segIndex });
  });

  // Re-seat each chunk's first line onto the InDesign baseline grid instead of
  // core's single-line-height stacking. Two terms: the grid offset (per-line
  // leading), and the ascent float (a smaller line's hanging baseline sits higher
  // inside its own box). A frame with uniform size AND leading needs neither — skip
  // it entirely so its output stays byte-identical to the pre-grid behaviour.
  const firstContentStyle = (chunk: TextChunk) => chunk.runs.find((r) => r.text.trim() !== '')?.style ?? chunk.runs[0]?.style ?? base;
  const uniformSize = emitted.every((e) => firstContentStyle(e.chunk).fontSize === base.fontSize);
  const uniformLeading = segmentLeadings.every((l) => l === segmentLeadings[0]);
  const noParagraphSpacing = segmentSpaceBefore.every((s) => s === 0);
  // Vertical justify already widened the layout so segmentTops distribute the lines;
  // the natural-leading grid would undo that, so skip it for justify frames.
  const applyGrid = !verticalJustify && verticalAlign === 0 && segmentLeadings.length === segmentTops.length && emitted.length > 0 && !(uniformSize && uniformLeading && noParagraphSpacing);
  const refAscent = applyGrid ? fontAscent(core, base, base.fontSize * fitScale) : 0;

  const frameBottom = box.y + box.height;
  const elements: Template.Elements.Text[] = [];
  for (let i = 0; i < emitted.length; i++) {
    const { chunk, top, segIndex } = emitted[i];
    const bottom = emitted[i + 1]?.top ?? Math.max(frameBottom, top);
    if (bottom - top <= 0) {
      console.warn(`[idml2serial] non-positive chunk height for frame ${frame.getId()} — emitting it unsplit.`);
      return singleElement();
    }
    let y = top;
    if (applyGrid) {
      const first = firstContentStyle(chunk);
      const gridOffset = (baselineGrid[segIndex] - baselineGrid[emitted[0].segIndex]) * fitScale;
      const ascentFloat = HANGING_BASELINE_FRACTION * (refAscent - fontAscent(core, first, first.fontSize * fitScale));
      y = emitted[0].top + gridOffset + ascentFloat;
    }
    const chunkBox: Box = { x: box.x, y, width: box.width, height: bottom - top };
    const chunkRuns = fitScale === 1 ? chunk.runs : chunk.runs.map((r) => ({ ...r, style: { ...r.style, fontSize: r.style.fontSize * fitScale } }));
    // Children are positioned inside the caller's group -> identity transform.
    elements.push(textElementFromRuns(`${id}_${i + 1}`, chunkRuns, chunkBox, chunk.align, chunk.justify, 0, lineHeightPercent, IDENTITY_DECOMP));
  }
  return elements;
}

/**
 * A text frame can also carry a fill/stroke (it's a graphic frame too). When it
 * does, emit a background rectangle under the text — mirroring idml2svg. The
 * cyan-filled "square" in 4-pages.idml is actually a filled, empty text frame.
 */
async function textFrameElement(frame: TextFrame, transform: DecomposedTransform, collector: AssetCollector, settings: ConvertSettings): Promise<Template.Element | null> {
  const box = frame.getBBox();
  const surface = surfaceOf(frame);
  const hasBackground = Boolean(surface.fill || surface.stroke);

  // The text child is suffixed when a background shares the frame id (a serial
  // requires globally-unique element ids). A SINGLE text element carries the
  // frame transform itself when it stands alone; split elements always come
  // back identity-transformed and get wrapped in a transform-carrying group.
  const texts = await buildTextElements(frame, box, hasBackground ? IDENTITY_DECOMP : transform, collector, hasBackground ? `${frame.getId()}_text` : frame.getId(), settings);

  if (!hasBackground) {
    if (texts.length === 0) return null;
    if (texts.length === 1) return texts[0];
    return makeGroup(frame.getId(), texts, transform, surface.opacity ?? 1);
  }

  // Children in natural IDML paint order (background behind, text in front);
  // reverseZOrder() flips the whole tree to Bluepic's first-on-top convention.
  const background = makeRectangle(`${frame.getId()}_bg`, box, cornerRadii(frame.getCornerOptions(), box), IDENTITY_DECOMP, { fill: surface.fill, stroke: surface.stroke, strokeWidth: surface.strokeWidth, opacity: 1 });
  return makeGroup(frame.getId(), [background, ...texts], transform, surface.opacity ?? 1);
}

// ---- dispatch --------------------------------------------------------------

async function spriteToElement(sprite: Sprite, pageMatrix: Matrix, collector: AssetCollector, settings: ConvertSettings): Promise<Template.Element | null> {
  // A sprite's transform is its baked matrix RELATIVE TO ITS PARENT container
  // (a page group for top-level sprites, the parent sprite-group for nested
  // children). IDML group-child itemTransforms are already relative to the
  // group, so the baked matrix expresses exactly that — no parent subtraction.
  const baked = bakeSpriteMatrix(sprite, pageMatrix);
  const transform = decomposeMatrix(baked);

  // Build the element, then stamp any InDesign drop shadow onto its root. Doing
  // it here (the single choke point every sprite — top-level AND nested group
  // children — passes through) covers the whole tree in one place.
  const element = await (async (): Promise<Template.Element | null> => {
  switch (sprite.type) {
    case 'Rectangle': {
      const rect = sprite as RectangleSprite;
      const image = findImageChild(rect);
      if (image) {
        const el = (await imageFrameAsImage(rect, image, pageMatrix, transform, collector)) ?? (await imageFrameAsMask(rect, image, pageMatrix, transform, collector));
        if (el) return el; // else: linked image (no contents) -> render frame as placeholder
      } else if (rect.getSprites().length > 0) {
        // Non-image nested content (a group, polygons, another frame): the frame
        // clips its children, like idml2svg's mask case.
        const el = await frameWithContentAsMask(rect, pageMatrix, transform, collector, settings);
        if (el) return el;
      }
      // A compound baked path (>1 subpath, e.g. a rectangle with a cut-out hole)
      // can't be expressed as a bbox rect — emit the real path. Bluepic's path uses
      // nonzero fill-rule, and IDML holes wind opposite, so the hole renders.
      const rectPaths = rect.getPath();
      if (rectPaths.length > 1) return makePath(sprite.getId(), pathFeatures(rectPaths), transform, surfaceOf(rect));
      const box = rect.getBBox();
      return makeRectangle(sprite.getId(), box, cornerRadii(rect.getCornerOptions(), box), transform, surfaceOf(rect));
    }
    case 'Oval': {
      const oval = sprite as OvalSprite;
      const image = findImageChild(oval);
      if (image) {
        const el = await imageFrameAsMask(oval, image, pageMatrix, transform, collector);
        if (el) return el;
      } else if (oval.getSprites().length > 0) {
        const el = await frameWithContentAsMask(oval, pageMatrix, transform, collector, settings);
        if (el) return el;
      }
      // Compound baked path (hole) — same as Rectangle.
      const ovalPaths = oval.getPath();
      if (ovalPaths.length > 1) return makePath(sprite.getId(), pathFeatures(ovalPaths), transform, surfaceOf(oval));
      const e = oval.getEllipse();
      return makeCircle(sprite.getId(), { x: e.x - e.radiusX, y: e.y - e.radiusY, width: e.radiusX * 2, height: e.radiusY * 2 }, transform, surfaceOf(oval));
    }
    case 'Polygon': {
      const poly = sprite as PolygonSprite;
      const image = findImageChild(poly);
      if (image) {
        const el = await imageFrameAsMask(poly, image, pageMatrix, transform, collector);
        if (el) return el;
      } else if (poly.getSprites().length > 0) {
        const el = await frameWithContentAsMask(poly, pageMatrix, transform, collector, settings);
        if (el) return el;
      }
      return makePath(sprite.getId(), pathFeatures(poly.getPath()), transform, surfaceOf(poly));
    }
    case 'TextFrame':
      return textFrameElement(sprite as TextFrame, transform, collector, settings);
    case 'Group': {
      const group = sprite as GroupSprite;
      const children = (await Promise.all(group.getSprites().map((child) => spriteToElement(child, pageMatrix, collector, settings)))).filter((c): c is Template.Element => c !== null);
      return makeGroup(sprite.getId(), children, transform, group.getOpacity() / 100);
    }
    case 'Image':
      return fullImageElement(sprite as ImageSprite, transform, collector);
    default:
      return null;
  }
  })();
  if (element) applyDropShadow(element, dropShadowValue(sprite));
  return element;
}

/** Combined bounding box of all of a spread's pages, in spread space (= the SVG viewBox). */
function spreadViewBox(spread: Spread): { x: number; y: number; width: number; height: number } {
  const corners = spread.pages.flatMap((page) => {
    const m = itemTransform2Matrix(page.itemTransform);
    const gb = page.geometricBounds;
    return [
      { x: gb.x, y: gb.y },
      { x: gb.x + gb.width, y: gb.y },
      { x: gb.x + gb.width, y: gb.y + gb.height },
      { x: gb.x, y: gb.y + gb.height },
    ].map((p) => applyToPoint(m, p));
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** No rotation/scale/skew — the matrix only moves things. */
function isTranslationOnly(m: Matrix): boolean {
  const eps = 1e-6;
  return Math.abs(m.a - 1) < eps && Math.abs(m.b) < eps && Math.abs(m.c) < eps && Math.abs(m.d - 1) < eps;
}

/**
 * The document's page-background color. InDesign paints every page with its
 * built-in "Paper" swatch (`Color/Paper` in Resources/Graphic.xml) — a real,
 * user-editable swatch (default `0 0 0 0` CMYK = white, but a document may set a
 * cream/tinted paper). It has no sprite, so a plain sprite walk misses it; we
 * synthesize a background rect per page from it. Returns undefined only if the
 * swatch is somehow absent or not a flat color (e.g. a gradient paper).
 */
function paperFill(idml: IDML): Paint {
  const paper = idml.getColorById('Color/Paper');
  return paper instanceof Color ? colorToHex(paper) : null;
}

/** A page-sized background rect (page-local coords, identity transform), painted
 * with the document's Paper color. Sits at the bottom of the page's stack. */
function paperBackgroundElement(page: Spread['pages'][number], fill: Paint): Template.Element {
  const gb = page.geometricBounds;
  return makeRectangle(`page_${page.id}_paper`, { x: gb.x, y: gb.y, width: gb.width, height: gb.height }, [0, 0, 0, 0], IDENTITY_DECOMP, { fill, opacity: 1 });
}

/**
 * One Serial per IDML spread (matching idml2svg's per-spread documents). A
 * multi-page spread becomes a single Serial whose canvas is the combined page
 * bounds, so facing/stacked pages and all their sprites live together.
 */
export async function convertIDML2Serial(idml: IDML, options: ConvertIDML2SerialOptions = {}): Promise<ConvertedSerial[]> {
  const { paperBackground = true, textSplittingHeuristic = 'format-and-paragraph-only', resolveImageSrc, verticalJustifyImplementationBounding = 'fontSize', verticalJustifyImplementationFit = 'grow' } = options;
  const settings: ConvertSettings = { textSplittingHeuristic, verticalJustifyBounding: verticalJustifyImplementationBounding, verticalJustifyFit: verticalJustifyImplementationFit };
  const paper = paperBackground ? paperFill(idml) : null;
  const results: ConvertedSerial[] = [];
  for (const spreadPackage of idml.spreadPackages) {
    const spread = spreadPackage.getSpread();
    const viewBox = spreadViewBox(spread);
    const viewBoxShift = translate(-viewBox.x, -viewBox.y); // spread coords -> canvas-local
    const collector = new AssetCollector(resolveImageSrc);

    // One Bluepic group per IDML page (mirrors idml2svg's per-page nesting), so
    // every sprite transform is simply its baked matrix relative to its parent.
    // Pages without any real elements are dropped entirely.
    type BuiltPage = { id: string; matrix: Matrix; children: Template.Element[] };
    const builtPages: BuiltPage[] = [];
    for (const page of spread.pages) {
      const pageMatrix = itemTransform2Matrix(page.itemTransform);
      const pageChildren: Template.Element[] = [];
      for (const sprite of spread.getSprites()) {
        if (sprite.getParentPage().id !== page.id) continue;
        const element = await spriteToElement(sprite, pageMatrix, collector, settings);
        if (element) pageChildren.push(element);
      }
      // Only populated pages survive (empty pages are dropped, no white rect for
      // them). The Paper background goes first — bottom of the natural IDML
      // back-to-front stack — so it sits behind every sprite after reverseZOrder.
      if (pageChildren.length > 0) {
        if (paper) pageChildren.unshift(paperBackgroundElement(page, paper));
        builtPages.push({ id: page.id, matrix: compose(viewBoxShift, pageMatrix), children: pageChildren });
      }
    }

    // A single populated page whose group transform is a pure translation (the
    // normal case — pages are never rotated/scaled within a spread) doesn't
    // need the synthetic page wrapper: bake the offset into each top-level
    // child and emit them directly, so the studio doesn't open on one big group.
    let context: Template.Element[];
    if (builtPages.length === 1 && isTranslationOnly(builtPages[0].matrix)) {
      const { e: dx, f: dy } = builtPages[0].matrix;
      if (dx !== 0 || dy !== 0) for (const child of builtPages[0].children) shiftElementTranslate(child, dx, dy);
      context = builtPages[0].children;
    } else {
      context = builtPages.map((p) => makeGroup(`page_${p.id}`, p.children, decomposeMatrix(p.matrix)));
    }
    const assets = collector.result();
    const ordered = reverseZOrder(context);
    // A serial requires globally-unique element ids. Guarantee it as a final
    // step (protecting image ids, which SerialAssets reference by elementId).
    const protectedIds = new Set([...assets.missingImages, ...assets.imagesToUpload].map((a) => a.elementId));
    ensureUniqueIds(ordered, protectedIds);
    results.push({ serial: emptySerial(viewBox.width, viewBox.height, ordered), assets });
  }
  return results;
}

/**
 * Guarantee globally-unique element ids across the whole tree (incl. group/mask
 * slots). Any element reusing an already-seen id is given a `-N` suffix. When a
 * collision involves a protected id (an image referenced by SerialAssets), the
 * protected element keeps the id and the other occurrence is renamed, so asset
 * `elementId` references stay valid.
 */
/**
 * Coerce an id into a valid JS identifier. bluepic-core builds the element
 * scope by using ids as `new Function` parameter names, so a non-identifier id
 * (containing '-', '.', spaces, or leading digits) throws "Arg string
 * terminates parameters early" at evaluation time. IDML `Self` ids are normally
 * identifier-safe already; this guards generated and any exotic ids.
 */
function sanitizeElementId(id: string): string {
  let safe = id.replace(/[^A-Za-z0-9_$]/g, '_');
  if (!/^[A-Za-z_$]/.test(safe)) safe = `_${safe}`;
  return safe;
}

function ensureUniqueIds(elements: Template.Element[], protectedIds: ReadonlySet<string>): void {
  const holders = new Map<string, Template.Element>();
  let counter = 0;
  const freshId = (base: string): string => {
    let candidate: string;
    do {
      candidate = `${base}_${++counter}`;
    } while (holders.has(candidate));
    return candidate;
  };
  const rename = (el: Template.Element, base: string) => {
    const id = freshId(base);
    el.id = id;
    holders.set(id, el);
  };
  const walk = (list: Template.Element[]) => {
    for (const el of list) {
      el.id = sanitizeElementId(el.id);
      const existing = holders.get(el.id);
      if (!existing) {
        holders.set(el.id, el);
      } else if (protectedIds.has(el.id) && !protectedIds.has(existing.id)) {
        // Keep the protected id on this element; move the earlier holder aside.
        rename(existing, existing.id);
        holders.set(el.id, el);
      } else {
        rename(el, el.id);
      }
      const slots = (el as { slots?: { default?: Template.Element[]; mask?: Template.Element[] } }).slots;
      if (slots?.default) walk(slots.default);
      if (slots?.mask) walk(slots.mask);
    }
  };
  walk(elements);
}

/**
 * IDML/SVG paint order is back-to-front (last element on top); Bluepic's
 * ElementsSlot renders `toReversed()`, so the FIRST element in a slot paints on
 * top. We build everything in natural IDML order, then flip the whole tree once
 * here so z-order matches.
 */
function reverseZOrder(elements: Template.Element[]): Template.Element[] {
  const reversed = [...elements].reverse();
  for (const el of reversed) {
    const slots = (el as { slots?: { default?: Template.Element[]; mask?: Template.Element[] } }).slots;
    if (slots?.default) slots.default = reverseZOrder(slots.default);
    if (slots?.mask) slots.mask = reverseZOrder(slots.mask);
  }
  return reversed;
}
