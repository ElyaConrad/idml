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
import { makeRectangle, makeCircle, makePath, makeImage, makeText, makeGroup, makeMask, emptySerial, shiftElementTranslate, Paint, SurfaceInput, Box, PathFeature, RichTextRun, SerialImageValue } from './serial/builders';
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
/** A linked image with no embedded source — the user must supply it. */
export type MissingImage = { elementId: string; imageId: string; linkURI?: string };
/** An embedded image whose bytes the wizard can upload, then swap the data URL
 * on `elementId` for the returned cloud URL. */
export type ImageToUpload = { elementId: string; imageId: string; data: ArrayBuffer; linkURI?: string };
/** Assets a single serial involves. */
export type SerialAssets = { fonts: RequiredFont[]; missingImages: MissingImage[]; imagesToUpload: ImageToUpload[] };
/** A produced serial plus its assets. */
export type ConvertedSerial = { serial: Template.Serial; assets: SerialAssets };
/** Options for {@link convertIDML2Serial}. */
export type ConvertIDML2SerialOptions = {
  /**
   * Emit a page-sized background rectangle filled with the document's InDesign
   * "Paper" swatch (`Color/Paper`) behind every populated page, so the serial
   * reproduces the page background InDesign paints implicitly. Default `true`.
   */
  paperBackground?: boolean;
};

class AssetCollector {
  private fonts = new Map<string, Map<string, FontVariant>>(); // family -> styleName|"w|i" -> variant
  readonly missingImages: MissingImage[] = [];
  readonly imagesToUpload: ImageToUpload[] = [];

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
  addImage(elementId: string, image: ImageSprite) {
    // Only real raster bytes can be uploaded; vector placed graphics (PDF/EPS/WMF)
    // have no usable raster, so they go to missingImages with their link URI.
    const contents = image.getRasterContents();
    if (contents) this.imagesToUpload.push({ elementId, imageId: image.getId(), data: contents, linkURI: image.getLinkURI() });
    else this.missingImages.push({ elementId, imageId: image.getId(), linkURI: image.getLinkURI() });
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

async function imageDataUrl(image: ImageSprite): Promise<string | undefined> {
  const contents = image.getRasterContents();
  if (!contents) return PLACEHOLDER_IMAGE; // linked/vector image with no usable raster source
  let mime = 'image/png';
  try {
    const type = await image.getImageType();
    if (type?.mime) mime = type.mime;
  } catch {
    /* keep default */
  }
  return `data:${mime};base64,${arrayBufferToBase64(contents)}`;
}

function findImageChild(sprite: RectangleSprite | OvalSprite | PolygonSprite): ImageSprite | undefined {
  return sprite.getSprites().find((s): s is ImageSprite => s.type === 'Image');
}

async function fullImageElement(image: ImageSprite, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const box = image.getBBox();
  if (!box) return null;
  const src = await imageDataUrl(image);
  if (!src) return null;
  collector.addImage(image.getId(), image); // this element holds the image.src
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
async function frameImageValue(frame: RectangleSprite | OvalSprite | PolygonSprite, image: ImageSprite, pageMatrix: Matrix): Promise<SerialImageValue | null> {
  const src = await imageDataUrl(image);
  if (!src) return null;
  const base = { src, cropMode: 'cover' as const, innerAlign: 'center', mirrorX: false, mirrorY: false, innerRotate: 0 };

  let natural: { width: number; height: number };
  try {
    natural = await image.getNaturalSize();
  } catch {
    return { ...base, crop: null };
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

  const value = await frameImageValue(frame, image, pageMatrix);
  if (!value) return null;
  collector.addImage(frame.getId(), image); // the frame IS the image element here
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
 * The frame outline is the mask's single clip shape, and the frame's own
 * fill/stroke are painted by the mask itself onto that same clip-shape path
 * (`surfaceRegion: 'shape'`): the fill sits behind the clipped content, the
 * stroke on top and unclipped (so a center stroke shows at full width, like
 * InDesign) — no separate `-bg` element, and the frame path is authored once.
 *
 * Children are recursed via spriteToElement (same as the Group case), so their
 * transforms are baked relative to the frame — the mask element carries the
 * frame transform. reverseZOrder() flips the child order afterwards.
 */
async function frameWithContentAsMask(frame: RectangleSprite | OvalSprite | PolygonSprite, pageMatrix: Matrix, transform: DecomposedTransform, collector: AssetCollector): Promise<Template.Element | null> {
  const children = (await Promise.all(frame.getSprites().map((child) => spriteToElement(child, pageMatrix, collector)))).filter((c): c is Template.Element => c !== null);
  if (children.length === 0) return null;

  const surface = surfaceOf(frame);
  return makeMask(frame.getId(), children, [frameOutlineShape(frame)], transform, frame.getOpacity() / 100, surface, 'shape');
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
  };
}

function buildTextElement(frame: TextFrame, box: Box, transform: DecomposedTransform, collector: AssetCollector, id: string = frame.getId()): Template.Elements.Text | null {
  const paragraphs = frame.getStory()?.getParagraphs() ?? [];
  if (paragraphs.length === 0) return null;

  // The document's root default font ([No paragraph style] AppliedFont), used
  // when a paragraph/character style defines none (it inherits via BasedOn).
  const defaultFont = frame.context.idml.getParagraphStyleById('ParagraphStyle/$ID/[No paragraph style]')?.appliedFont ?? 'Arial';

  type Run = { text: string; style: EffectiveTextStyle };
  const runs: Run[] = [];
  const paragraphTexts: string[] = [];
  let firstAlign = 0;
  let firstJustify = false;
  paragraphs.forEach((paragraph, pIndex) => {
    // Local paragraph alignment OVERRIDES the applied style's alignment.
    if (pIndex === 0) {
      const align = (paragraph.localParagraphStyle?.align ?? paragraph.appliedParagraphStyle?.align ?? 'left') as string;
      firstAlign = ALIGN_TO_FRACTION[align] ?? 0;
      firstJustify = JUSTIFY_ALIGNS.has(align);
    }
    let paragraphText = '';
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
      const text = feature.content ?? '';
      paragraphText += text;
      runs.push({ text, style });
    }
    paragraphTexts.push(paragraphText);
    if (pIndex < paragraphs.length - 1) runs.push({ text: '\n', style: runs[runs.length - 1]?.style ?? effectiveTextStyle(paragraph, paragraph.features[0], defaultFont) });
  });

  const base = runs[0]?.style;
  if (!base) return null;
  const sameStyle = (a: EffectiveTextStyle, b: EffectiveTextStyle) =>
    a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.fontWeight === b.fontWeight && a.fontStyle === b.fontStyle && a.color === b.color && a.letterSpacing === b.letterSpacing;
  const uniform = runs.every((r) => sameStyle(r.style, base));

  const plainText = paragraphTexts.join('\n');
  if (plainText.trim() === '') return null; // empty frame -> no text element (caller still draws any background)
  const richText: RichTextRun[] = runs.map((r) => {
    const format: Record<string, unknown> = {};
    if (r.style.fontFamily !== base.fontFamily) format.fontFamily = r.style.fontFamily;
    if (r.style.fontSize !== base.fontSize) format.fontSize = r.style.fontSize;
    if (r.style.fontWeight !== base.fontWeight) format.fontWeight = r.style.fontWeight;
    if (r.style.fontStyle !== base.fontStyle) format.fontStyle = r.style.fontStyle;
    if (r.style.letterSpacing !== base.letterSpacing) format.letterSpacing = r.style.letterSpacing;
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
      lineHeight: base.lineHeight * 100, // relative %, e.g. 120
      letterSpacing: base.letterSpacing,
      textAlign: firstAlign,
      justifyText: firstJustify,
      verticalAlign: frame.getVerticalAlign(),
      autoLinebreaks: true,
      fill: base.color,
    },
    transform
  );
}

/**
 * A text frame can also carry a fill/stroke (it's a graphic frame too). When it
 * does, emit a background rectangle under the text — mirroring idml2svg. The
 * cyan-filled "square" in 4-pages.idml is actually a filled, empty text frame.
 */
function textFrameElement(frame: TextFrame, transform: DecomposedTransform, collector: AssetCollector): Template.Element | null {
  const box = frame.getBBox();
  const surface = surfaceOf(frame);
  const hasBackground = Boolean(surface.fill || surface.stroke);

  if (!hasBackground) {
    return buildTextElement(frame, box, transform, collector);
  }

  // Children in natural IDML paint order (background behind, text in front);
  // reverseZOrder() flips the whole tree to Bluepic's first-on-top convention.
  const background = makeRectangle(`${frame.getId()}_bg`, box, [0, 0, 0, 0], IDENTITY_DECOMP, { fill: surface.fill, stroke: surface.stroke, strokeWidth: surface.strokeWidth, opacity: 1 });
  // The wrapping group keeps the frame id; the text child is suffixed so the two
  // don't collide (a serial requires globally-unique, identifier-safe element ids).
  const text = buildTextElement(frame, box, IDENTITY_DECOMP, collector, `${frame.getId()}_text`);
  const children: Template.Element[] = text ? [background, text] : [background];
  return makeGroup(frame.getId(), children, transform, surface.opacity ?? 1);
}

// ---- dispatch --------------------------------------------------------------

async function spriteToElement(sprite: Sprite, pageMatrix: Matrix, collector: AssetCollector): Promise<Template.Element | null> {
  // A sprite's transform is its baked matrix RELATIVE TO ITS PARENT container
  // (a page group for top-level sprites, the parent sprite-group for nested
  // children). IDML group-child itemTransforms are already relative to the
  // group, so the baked matrix expresses exactly that — no parent subtraction.
  const baked = bakeSpriteMatrix(sprite, pageMatrix);
  const transform = decomposeMatrix(baked);

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
        const el = await frameWithContentAsMask(rect, pageMatrix, transform, collector);
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
        const el = await frameWithContentAsMask(oval, pageMatrix, transform, collector);
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
        const el = await frameWithContentAsMask(poly, pageMatrix, transform, collector);
        if (el) return el;
      }
      return makePath(sprite.getId(), pathFeatures(poly.getPath()), transform, surfaceOf(poly));
    }
    case 'TextFrame':
      return textFrameElement(sprite as TextFrame, transform, collector);
    case 'Group': {
      const group = sprite as GroupSprite;
      const children = (await Promise.all(group.getSprites().map((child) => spriteToElement(child, pageMatrix, collector)))).filter((c): c is Template.Element => c !== null);
      return makeGroup(sprite.getId(), children, transform, group.getOpacity() / 100);
    }
    case 'Image':
      return fullImageElement(sprite as ImageSprite, transform, collector);
    default:
      return null;
  }
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
  const { paperBackground = true } = options;
  const paper = paperBackground ? paperFill(idml) : null;
  const results: ConvertedSerial[] = [];
  for (const spreadPackage of idml.spreadPackages) {
    const spread = spreadPackage.getSpread();
    const viewBox = spreadViewBox(spread);
    const viewBoxShift = translate(-viewBox.x, -viewBox.y); // spread coords -> canvas-local
    const collector = new AssetCollector();

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
        const element = await spriteToElement(sprite, pageMatrix, collector);
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
