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
import { makeRectangle, makeCircle, makePath, makeImage, makeText, makeGroup, makeMask, emptySerial, Paint, SurfaceInput, Box, PathFeature, RichTextRun, SerialImageValue } from './serial/builders';
import { DecomposedTransform } from './util/layout';

/**
 * IDML -> Bluepic Serial converter. One Serial per IDML page. Walks the IDML
 * controllers directly (NOT the SVG projection) so non-visual fidelity (text
 * settings, crop geometry, tints) is preserved. Geometry reuses the shared
 * layout layer (same baked matrices idml2svg renders). Heuristics decide
 * image-element-vs-mask and plaintext-vs-richtext.
 */

// ---- color -----------------------------------------------------------------

function channelHex(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}
function rgbToHex(red: number, green: number, blue: number, alpha = 255): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}${channelHex(alpha)}`;
}
function colorToHex(color: Color): string {
  const { red, green, blue } = color.getRBG();
  return rgbToHex(red, green, blue);
}
function colorInputToHex(ci: ColorInput | undefined): string | undefined {
  if (!ci) return undefined;
  if (ci.type === 'rgb') return rgbToHex(ci.red, ci.green, ci.blue);
  const r = 255 * (1 - ci.cyan / 100) * (1 - ci.black / 100);
  const g = 255 * (1 - ci.magenta / 100) * (1 - ci.black / 100);
  const b = 255 * (1 - ci.yellow / 100) * (1 - ci.black / 100);
  return rgbToHex(r, g, b);
}
function gradientToSerial(gradient: Gradient, fillAngleDeg: number): Template.Elements.Gradient {
  // Bluepic ColorStop.position is a 0..100 percentage (core renders `${position}%`).
  // IDML stop Location is already 0..100 — do NOT divide.
  const stops = gradient
    .getColorStops()
    .filter((s) => s.color)
    .map((s) => ({ color: colorToHex(s.color!), position: s.position }));
  if (gradient.getType() === 'radial') {
    return { type: 'radial', x1: 0.5, y1: 0.5, radius1: 0, x2: 0.5, y2: 0.5, radius2: 0.5, stops };
  }
  // The IDML gradient direction comes from the SPRITE's GradientFillAngle (θ),
  // whose direction is (cosθ, -sinθ) (see idml2svg/util/fill). Bluepic renders a
  // CSS `${angle}deg` whose direction is (sinφ, -cosφ), so φ = 90 - θ.
  return { type: 'linear', angle: 90 - fillAngleDeg, stops };
}
function paintFrom(value: Color | Gradient | undefined, gradientAngleDeg = 0): Paint {
  if (!value) return null;
  return value instanceof Color ? colorToHex(value) : gradientToSerial(value, gradientAngleDeg);
}
function surfaceOf(sprite: Sprite): SurfaceInput {
  return {
    fill: paintFrom(sprite.getEffectiveFill(), sprite.getGradientFillAngle() ?? 0),
    stroke: paintFrom(sprite.getEffectiveStroke()),
    strokeWidth: sprite.getEffectiveStrokeWeight(),
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
  // TEMP test hook: inject a src for a specific image sprite id (e.g. a re-linked
  // image that IDML couldn't embed). Set globalThis.__imageOverrides = { 'u18f': '<url|dataurl>' }.
  const override = (globalThis as { __imageOverrides?: Record<string, string> }).__imageOverrides?.[image.getId()];
  if (override) return override;
  const contents = image.getContents();
  if (!contents) return PLACEHOLDER_IMAGE; // linked image with no embedded source
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

async function fullImageElement(image: ImageSprite, transform: DecomposedTransform): Promise<Template.Element | null> {
  const box = image.getBBox();
  if (!box) return null;
  const src = await imageDataUrl(image);
  if (!src) return null;
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
async function imageFrameAsImage(frame: RectangleSprite, image: ImageSprite, pageMatrix: Matrix, transform: DecomposedTransform): Promise<Template.Element | null> {
  const imagePlacement = decomposeMatrix(bakeSpriteMatrix(image, pageMatrix));
  // Only the simple, representable case; otherwise let the caller use a mask.
  if (Math.abs(imagePlacement.rotate) > 0.5 || Math.abs(imagePlacement.skewX) > 0.5) return null;
  if (!cornersAreSimple(frame.getCornerOptions())) return null;

  const value = await frameImageValue(frame, image, pageMatrix);
  if (!value) return null;
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
async function imageFrameAsMask(frame: RectangleSprite | OvalSprite | PolygonSprite, image: ImageSprite, pageMatrix: Matrix, transform: DecomposedTransform): Promise<Template.Element | null> {
  const imageEl = await fullImageElement(image, decomposeMatrix(bakeSpriteMatrix(image, pageMatrix)));
  if (!imageEl) return null;
  const shape = frameOutlineShape(frame);
  if (!shape) return null;
  return makeMask(frame.getId(), [imageEl], [shape], transform, frame.getOpacity() / 100);
}

const MASK_FILL: SurfaceInput = { fill: '#ffffffff', opacity: 1 };

/** The frame's clip shape, in frame-local coords with identity transform. */
function frameOutlineShape(frame: RectangleSprite | OvalSprite | PolygonSprite): Template.Element | null {
  const id = `${frame.getId()}-maskshape`;
  if (frame.type === 'Rectangle') {
    const rect = frame as RectangleSprite;
    const box = rect.getBBox();
    return makeRectangle(id, box, cornerRadii(rect.getCornerOptions(), box), IDENTITY_DECOMP, MASK_FILL);
  }
  if (frame.type === 'Oval') {
    const e = (frame as OvalSprite).getEllipse();
    return makeCircle(id, { x: e.x - e.radiusX, y: e.y - e.radiusY, width: e.radiusX * 2, height: e.radiusY * 2 }, IDENTITY_DECOMP, MASK_FILL);
  }
  return makePath(id, pathFeatures((frame as PolygonSprite).getPath()), IDENTITY_DECOMP, MASK_FILL);
}

// ---- text ------------------------------------------------------------------

type EffectiveTextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  letterSpacing: number;
  lineHeight: number;
  color: string;
};

// Bluepic textAlign is a 0..1 fraction: offset = (maxLineWidth - lineWidth) * textAlign.
const ALIGN_TO_FRACTION: Record<string, number> = { left: 0, justifyLeft: 0, justify: 0, justifyAll: 0, center: 0.5, justifyCenter: 0.5, right: 1, justifyRight: 1 };

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
    // Bluepic letterSpacing is a RATIO: core applies (value - 1) * fontSize as
    // extra px, so 1 = normal (0 would mean -1em = catastrophic). IDML tracking
    // is in 1/1000 em, i.e. extra-em = tracking/1000.
    letterSpacing: 1 + tracking / 1000,
    lineHeight: leading && leading > 0 ? leading / fontSize : 1.2,
    color: colorInputToHex(fillColor) ?? '#000000ff',
  };
}

function buildTextElement(frame: TextFrame, box: Box, transform: DecomposedTransform): Template.Elements.Text | null {
  const paragraphs = frame.getStory()?.getParagraphs() ?? [];
  if (paragraphs.length === 0) return null;

  // The document's root default font ([No paragraph style] AppliedFont), used
  // when a paragraph/character style defines none (it inherits via BasedOn).
  const defaultFont = frame.context.idml.getParagraphStyleById('ParagraphStyle/$ID/[No paragraph style]')?.appliedFont ?? 'Arial';

  type Run = { text: string; style: EffectiveTextStyle };
  const runs: Run[] = [];
  const paragraphTexts: string[] = [];
  let firstAlign = 0;
  paragraphs.forEach((paragraph, pIndex) => {
    // Local paragraph alignment OVERRIDES the applied style's alignment.
    if (pIndex === 0) firstAlign = ALIGN_TO_FRACTION[(paragraph.localParagraphStyle?.align ?? paragraph.appliedParagraphStyle?.align ?? 'left') as string] ?? 0;
    let paragraphText = '';
    for (const feature of paragraph.features) {
      const style = effectiveTextStyle(paragraph, feature, defaultFont);
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
    frame.getId(),
    {
      box,
      textMode: uniform ? 'plaintext' : 'richtext',
      text: plainText,
      richText,
      fontFamily: base.fontFamily,
      fontSize: base.fontSize,
      fontWeight: base.fontWeight,
      fontStyle: base.fontStyle,
      lineHeight: base.lineHeight,
      letterSpacing: base.letterSpacing,
      textAlign: firstAlign,
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
function textFrameElement(frame: TextFrame, transform: DecomposedTransform): Template.Element | null {
  const box = frame.getBBox();
  const surface = surfaceOf(frame);
  const hasBackground = Boolean(surface.fill || surface.stroke);

  if (!hasBackground) {
    return buildTextElement(frame, box, transform);
  }

  // Children in natural IDML paint order (background behind, text in front);
  // reverseZOrder() flips the whole tree to Bluepic's first-on-top convention.
  const background = makeRectangle(`${frame.getId()}-bg`, box, [0, 0, 0, 0], IDENTITY_DECOMP, { fill: surface.fill, stroke: surface.stroke, strokeWidth: surface.strokeWidth, opacity: 1 });
  const text = buildTextElement(frame, box, IDENTITY_DECOMP);
  const children: Template.Element[] = text ? [background, text] : [background];
  return makeGroup(frame.getId(), children, transform, surface.opacity ?? 1);
}

// ---- dispatch --------------------------------------------------------------

async function spriteToElement(sprite: Sprite, pageMatrix: Matrix): Promise<Template.Element | null> {
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
        const el = (await imageFrameAsImage(rect, image, pageMatrix, transform)) ?? (await imageFrameAsMask(rect, image, pageMatrix, transform));
        if (el) return el; // else: linked image (no contents) -> render frame as placeholder
      }
      const box = rect.getBBox();
      return makeRectangle(sprite.getId(), box, cornerRadii(rect.getCornerOptions(), box), transform, surfaceOf(rect));
    }
    case 'Oval': {
      const oval = sprite as OvalSprite;
      const image = findImageChild(oval);
      if (image) {
        const el = await imageFrameAsMask(oval, image, pageMatrix, transform);
        if (el) return el;
      }
      const e = oval.getEllipse();
      return makeCircle(sprite.getId(), { x: e.x - e.radiusX, y: e.y - e.radiusY, width: e.radiusX * 2, height: e.radiusY * 2 }, transform, surfaceOf(oval));
    }
    case 'Polygon': {
      const poly = sprite as PolygonSprite;
      const image = findImageChild(poly);
      if (image) {
        const el = await imageFrameAsMask(poly, image, pageMatrix, transform);
        if (el) return el;
      }
      return makePath(sprite.getId(), pathFeatures(poly.getPath()), transform, surfaceOf(poly));
    }
    case 'TextFrame':
      return textFrameElement(sprite as TextFrame, transform);
    case 'Group': {
      const group = sprite as GroupSprite;
      const children = (await Promise.all(group.getSprites().map((child) => spriteToElement(child, pageMatrix)))).filter((c): c is Template.Element => c !== null);
      return makeGroup(sprite.getId(), children, transform, group.getOpacity() / 100);
    }
    case 'Image':
      return fullImageElement(sprite as ImageSprite, transform);
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

/**
 * One Serial per IDML spread (matching idml2svg's per-spread documents). A
 * multi-page spread becomes a single Serial whose canvas is the combined page
 * bounds, so facing/stacked pages and all their sprites live together.
 */
export async function convertIDML2Serial(idml: IDML): Promise<Template.Serial[]> {
  const serials: Template.Serial[] = [];
  for (const spreadPackage of idml.spreadPackages) {
    const spread = spreadPackage.getSpread();
    const viewBox = spreadViewBox(spread);
    const viewBoxShift = translate(-viewBox.x, -viewBox.y); // spread coords -> canvas-local

    // One Bluepic group per IDML page (mirrors idml2svg's per-page nesting), so
    // every sprite transform is simply its baked matrix relative to its parent.
    const context: Template.Element[] = [];
    for (const page of spread.pages) {
      const pageMatrix = itemTransform2Matrix(page.itemTransform);
      const pageGroupTransform = decomposeMatrix(compose(viewBoxShift, pageMatrix));
      const pageChildren: Template.Element[] = [];
      for (const sprite of spread.getSprites()) {
        if (sprite.getParentPage().id !== page.id) continue;
        const element = await spriteToElement(sprite, pageMatrix);
        if (element) pageChildren.push(element);
      }
      context.push(makeGroup(`page-${page.id}`, pageChildren, pageGroupTransform));
    }
    serials.push(emptySerial(viewBox.width, viewBox.height, reverseZOrder(context)));
  }
  return serials;
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
