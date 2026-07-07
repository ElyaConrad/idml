import type * as Template from './serial/serial-types';
import { compose, applyToPoint, translate, Matrix } from 'transformation-matrix';
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
import { bakeSpriteMatrix, decomposeMatrix, itemTransform2Matrix } from './util/layout';
import { makeRectangle, makeCircle, makePath, makeGroup, makeMask, emptySerial, shiftElementTranslate, applyDropShadow, Paint, SurfaceInput } from './serial/builders';
import { DecomposedTransform } from './util/layout';

import { IDENTITY_DECOMP } from './convert/constants';
import { AssetCollector } from './convert/assets';
import { ConvertSettings, ConvertIDML2SerialOptions } from './convert/types';
import { surfaceOf, colorToHex, dropShadowValue } from './convert/paint';
import { cornerRadii, pathFeatures, frameShape, frameOutlineShape } from './convert/shapes';
import { findImageChild, fullImageElement, imageFrameAsImage, imageFrameAsMask } from './convert/images';
import { textFrameElement } from './convert/text/layout';

// Re-exports: names that moved out but must remain importable from this module.
export type { FontVariant, RequiredFont, ImageGraphicType, MissingImage, ImageToUpload, SerialAssets, ConvertedSerial, ImageSrcResolver } from './convert/assets';
export type { ConvertIDML2SerialOptions, TextSplittingHeuristic, VerticalJustifyBounding, VerticalJustifyFit } from './convert/types';

/**
 * IDML -> Bluepic Serial converter. One Serial per IDML page. Walks the IDML
 * controllers directly (NOT the SVG projection) so non-visual fidelity (text
 * settings, crop geometry, tints) is preserved. Geometry reuses the shared
 * layout layer (same baked matrices idml2svg renders). Heuristics decide
 * image-element-vs-mask and plaintext-vs-richtext.
 */

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
export async function convertIDML2Serial(idml: IDML, options: ConvertIDML2SerialOptions = {}): Promise<import('./convert/assets').ConvertedSerial[]> {
  const { paperBackground = true, textSplittingHeuristic = 'format-and-paragraph-only', resolveImageSrc, verticalJustifyImplementationBounding = 'fontSize', verticalJustifyImplementationFit = 'grow' } = options;
  const settings: ConvertSettings = { textSplittingHeuristic, verticalJustifyBounding: verticalJustifyImplementationBounding, verticalJustifyFit: verticalJustifyImplementationFit };
  const paper = paperBackground ? paperFill(idml) : null;
  const results: import('./convert/assets').ConvertedSerial[] = [];
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
