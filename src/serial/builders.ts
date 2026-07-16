import type * as Template from './serial-types';
import { V, num, bool, str, numArray, obj, exprRaw } from './expr.js';
import { DecomposedTransform } from '../util/layout.js';

/**
 * Builders that assemble complete Bluepic Serial element property-bags with
 * correct defaults (sourced from real serials). Geometry/paint come from the
 * IDML converter; everything else is filled so the output is render-ready.
 */

/** A fill/stroke paint: hex color (with alpha), a gradient, or none. */
export type Paint = string | Template.Elements.Gradient | null;
const TRANSPARENT = '#00000000';

function paint(p: Paint): V {
  if (p === null) return str(TRANSPARENT);
  if (typeof p === 'string') return str(p);
  return obj(p);
}

/** All filters off — matches the `null` defaults in real serials. */
function defaultFilter(): Template.Filter {
  const n = exprRaw('null');
  return { blur: n, grayscale: n, sepia: n, exposure: n, contrast: n, saturate: n, brightness: n, invert: n, gradientMap: n, hueRotate: n, opacity: n, dropShadow: n, blendMode: n };
}

/** Set the element's CSS mix-blend-mode (null/'normal' = no-op). */
export function applyBlendMode(element: Template.Element, mode: string | null): void {
  if (!mode || mode === 'normal') return;
  element.filter.blendMode = str(mode);
}

/** The object shape Bluepic's renderer expects for `filter.dropShadow` (see
 * bluepic-core SvgFilter): offset is polar — dx = sin(rotation°)·distance,
 * dy = cos(rotation°)·distance — with `blur` = stdDeviation, `color` a CSS
 * color, `opacity` 0..1, and `quality` a render hint. */
export type DropShadowValue = { rotation: number; distance: number; color: string; opacity: number; blur: number; quality: number };

/** Set the drop-shadow filter on an already-built element (no-op when null). */
export function applyDropShadow(element: Template.Element, shadow: DropShadowValue | null): void {
  if (!shadow) return;
  element.filter.dropShadow = obj(shadow);
}

/** An identity serial transform — used to neutralise a child before its parent group
 * takes over the (frame) transform, so the transform is applied exactly once. */
export function identityTransform(): Template.Transform {
  return serialTransform({ translateX: 0, translateY: 0, rotate: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 });
}

function serialTransform(t: DecomposedTransform): Template.Transform {
  return {
    translateX: num(t.translateX),
    translateY: num(t.translateY),
    scaleX: num(t.scaleX),
    scaleY: num(t.scaleY),
    skewX: num(t.skewX),
    skewY: num(t.skewY),
    rotate: num(t.rotate),
  };
}

/**
 * Add (dx, dy) to a built element's translate. Transform values are always
 * bare-number expression sources (see serialTransform/num), so they round-trip
 * through Number(). Used to bake a dissolved wrapper group's translation into
 * its children.
 */
export function shiftElementTranslate(element: Template.Element, dx: number, dy: number): void {
  element.transform.translateX = num(Number(element.transform.translateX.value) + dx);
  element.transform.translateY = num(Number(element.transform.translateY.value) + dy);
}

// Absolute transform-origin at canvas (0,0) so core's compose matches our
// decomposition (T·R·skewX·S). See decomposeMatrix / useElementTransform.
const ORIGIN_0: V = numArray([0, 0]);
const POS_TL: V = numArray([0, 0]); // top-left anchor: x/y == bbox top-left

export type Box = { x: number; y: number; width: number; height: number };

export type SurfaceInput = {
  fill?: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  strokeAlignment?: 'inside' | 'center' | 'outside';
  radius?: [number, number, number, number];
  opacity?: number; // 0..1
};

export function makeRectangle(id: string, box: Box, radius: [number, number, number, number], transform: DecomposedTransform, surface: SurfaceInput): Template.Elements.Rectangle {
  return {
    name: 'rectangle',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      x: num(box.x),
      y: num(box.y),
      width: num(box.width),
      height: num(box.height),
      radius: numArray(radius),
      pos: POS_TL,
      fill: paint(surface.fill ?? null),
      stroke: paint(surface.stroke ?? null),
      strokeWidth: num(surface.strokeWidth ?? 0),
      opacity: num(surface.opacity ?? 1),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      strokeAlignment: str(surface.strokeAlignment ?? 'center'),
    },
    transform: serialTransform(transform),
    filter: defaultFilter(),
    iteration: null,
  };
}

/**
 * A rectangle iterated once per line of a target text element — the "Bauchbinde"
 * highlight bar behind each line, reconstructed from InDesign's thick offset
 * underline. It binds to `<targetTextId>.lines[i]` (exposed `{x, y, width, height}`),
 * so it tracks the text's wrap/line count live and, as a sibling under the same
 * (frame) group transform, rotates/scales with the text exactly as InDesign does.
 *
 * The bar's centre sits on `baseline + underlineOffset` (baseline = line top +
 * ascent) and its height = the underline weight. When the caller measured the font
 * ascent (`ascent` given), that's baked into a constant; without a canvas it falls
 * back to `0.8·lines[i].height` (the render-time font-bounding proportion).
 *
 * Horizontal: `pad` insets each side. When `leftAnchorX` is given (left-aligned text),
 * the bar's LEFT edge is pinned to that constant frame-left (minus pad) instead of the
 * per-line text start — so every line's bar shares one clean left edge, matching InDesign,
 * regardless of differing per-line font sizes/leading spaces. The right edge still tracks
 * the line's text end (+pad). When null (centre/right), the bar hugs the line box ±pad.
 */
export function makeLineBackgroundRectangle(id: string, targetTextId: string, opts: { fill: Paint; weight: number; offset: number; ascent: number | null; pad: number; leftAnchorX: number | null }): Template.Elements.Rectangle {
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  // ` + n` / ` - n`, so a negative constant reads `- 58.63` rather than `+ -58.63`.
  const signed = (n: number) => (n >= 0 ? ` + ${fmt(n)}` : ` - ${fmt(-n)}`);
  const L = `${targetTextId}.lines[i]`;
  const { pad, weight, offset, ascent, leftAnchorX } = opts;
  const k = offset - weight / 2; // bar top relative to the baseline
  const yExpr = ascent !== null ? `${L}.y${signed(ascent + k)}` : `${L}.y + 0.8 * ${L}.height${signed(k)}`;
  // Left-aligned: pin the left edge to the frame-left constant so all lines align;
  // width spans from there to the line's text end + pad. Otherwise hug the line box.
  const xExpr = leftAnchorX !== null ? fmt(leftAnchorX - pad) : `${L}.x${pad ? ` - ${fmt(pad)}` : ''}`;
  const widthExpr = leftAnchorX !== null ? `${L}.x + ${L}.width${signed(2 * pad - leftAnchorX)}` : `${L}.width${pad ? ` + ${fmt(2 * pad)}` : ''}`;
  return {
    name: 'rectangle',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      x: exprRaw(xExpr),
      y: exprRaw(yExpr),
      width: exprRaw(widthExpr),
      height: exprRaw(fmt(weight)),
      radius: numArray([0, 0, 0, 0]),
      pos: POS_TL,
      fill: paint(opts.fill),
      stroke: paint(null),
      strokeWidth: num(0),
      opacity: num(1),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      strokeAlignment: str('center'),
    },
    // Identity: the bar is positioned entirely by its line-bound x/y expressions,
    // in the same coordinate space as the sibling text under the shared group.
    transform: serialTransform({ translateX: 0, translateY: 0, rotate: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 }),
    filter: defaultFilter(),
    iteration: { expression: `${targetTextId}.lines.length`, key: 'i' },
  };
}

/**
 * InDesign paragraph shading (`ParagraphShadingOn`) — a fill drawn behind the WHOLE
 * paragraph, spanning the text frame's width from the first line's top to the last
 * line's bottom. Reconstructed as an iterated rectangle bound to `<textId>.lines[i]`:
 * one full-height tile per rendered line (contiguous line boxes tile into a solid
 * block), so it tracks the text's live wrap/line-count exactly like the Bauchbinde bar.
 *
 * Horizontal: static frame span (`box.x + leftOffset` .. width - left - right offsets),
 * matching InDesign's default column-width shading (not the per-line text width).
 * Vertical: each tile is the line's own box (`lines[i].y`, height `lines[i].height`);
 * `topOffset`/`bottomOffset` extend the FIRST/LAST tile beyond the line box (i===0 /
 * i===last), reproducing the Ascent/Descent origins' outset.
 */
export function makeParagraphShadingRectangle(id: string, targetTextId: string, box: { x: number; width: number }, opts: { fill: Paint; topOffset: number; bottomOffset: number; leftOffset: number; rightOffset: number }): Template.Elements.Rectangle {
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  const L = `${targetTextId}.lines[i]`;
  const last = `${targetTextId}.lines.length - 1`;
  const { topOffset, bottomOffset, leftOffset, rightOffset } = opts;
  // First tile starts topOffset higher; last tile ends bottomOffset lower. `i` is the
  // iteration key, so gate the outset on i===0 / i===last via the expression engine.
  const yExpr = topOffset ? `${L}.y - (i == 0 ? ${fmt(topOffset)} : 0)` : `${L}.y`;
  const heightExpr = topOffset || bottomOffset ? `${L}.height + (i == 0 ? ${fmt(topOffset)} : 0) + (i == ${last} ? ${fmt(bottomOffset)} : 0)` : `${L}.height`;
  return {
    name: 'rectangle',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      x: num(box.x + leftOffset),
      y: exprRaw(yExpr),
      width: num(Math.max(0, box.width - leftOffset - rightOffset)),
      height: exprRaw(heightExpr),
      radius: numArray([0, 0, 0, 0]),
      pos: POS_TL,
      fill: paint(opts.fill),
      stroke: paint(null),
      strokeWidth: num(0),
      opacity: num(1),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      strokeAlignment: str('center'),
    },
    transform: serialTransform({ translateX: 0, translateY: 0, rotate: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 }),
    filter: defaultFilter(),
    iteration: { expression: `${targetTextId}.lines.length`, key: 'i' },
  };
}

/**
 * InDesign paragraph rule (`RuleAbove`/`RuleBelow`) — a colored line above the FIRST line
 * or below the LAST line of a paragraph, spanning the column width. A single (non-iterated)
 * rectangle bound to the relevant line so it tracks the text's live position/line count.
 *
 * Vertical: relative to that line's baseline (`line.y + ascent`). Above sits with its bottom
 * at the baseline (top = baseline − offset − weight); below sits with its top at the baseline
 * (top = baseline + offset) — matching InDesign's default (offset 0) rule placement.
 */
export function makeParagraphRuleRectangle(id: string, targetTextId: string, box: { x: number; width: number }, opts: { fill: Paint; weight: number; offset: number; ascent: number; position: 'above' | 'below' }): Template.Elements.Rectangle {
  const fmt = (n: number) => Number(n.toFixed(4)).toString();
  // Above binds to the first line; below to the last (dynamic index survives re-wrap).
  const L = opts.position === 'above' ? `${targetTextId}.lines[0]` : `${targetTextId}.lines[${targetTextId}.lines.length - 1]`;
  const baseline = `${L}.y + ${fmt(opts.ascent)}`;
  const k = opts.position === 'above' ? -(opts.offset + opts.weight) : opts.offset;
  const yExpr = `${baseline}${k >= 0 ? ` + ${fmt(k)}` : ` - ${fmt(-k)}`}`;
  return {
    name: 'rectangle',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      x: num(box.x),
      y: exprRaw(yExpr),
      width: num(box.width),
      height: num(opts.weight),
      radius: numArray([0, 0, 0, 0]),
      pos: POS_TL,
      fill: paint(opts.fill),
      stroke: paint(null),
      strokeWidth: num(0),
      opacity: num(1),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      strokeAlignment: str('center'),
    },
    transform: serialTransform({ translateX: 0, translateY: 0, rotate: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 }),
    filter: defaultFilter(),
    iteration: null,
  };
}

/** Circle/ellipse — radius accepts [rx, ry]. x/y is the bbox top-left (pos [0,0]). */
export function makeCircle(id: string, box: Box, transform: DecomposedTransform, surface: SurfaceInput): Template.Elements.Circle {
  return {
    name: 'circle',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      x: num(box.x),
      y: num(box.y),
      radius: numArray([box.width / 2, box.height / 2]),
      pos: POS_TL,
      fill: paint(surface.fill ?? null),
      stroke: paint(surface.stroke ?? null),
      strokeWidth: num(surface.strokeWidth ?? 0),
      opacity: num(surface.opacity ?? 1),
      strokeDasharray: numArray([0, 0]),
      strokeAlignment: str(surface.strokeAlignment ?? 'center'),
      strokeDashoffset: num(0),
    },
    transform: serialTransform(transform),
    filter: defaultFilter(),
    iteration: null,
  };
}

export type PathFeature =
  | { type: 'move'; x: number; y: number }
  | { type: 'line'; x: number; y: number }
  | { type: 'cubic-bezier'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { type: 'close' };

export function makePath(id: string, features: PathFeature[], transform: DecomposedTransform, surface: SurfaceInput): Template.Elements.Path {
  return {
    name: 'path',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      features: obj(features),
      fill: paint(surface.fill ?? null),
      stroke: paint(surface.stroke ?? null),
      strokeWidth: num(surface.strokeWidth ?? 0),
      strokeAlignment: str(surface.strokeAlignment ?? 'center'),
      opacity: num(surface.opacity ?? 1),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      displayMode: str('shape'),
      text: str(''),
      fontFamily: str('Arial'),
      fontSize: num(16),
      fontWeight: num(400),
      letterSpacing: num(0),
      fontStyle: str('normal'),
      side: str('left'),
      method: str('align'),
      lengthAdjust: str('spacing'),
      spacing: str('auto'),
      align: num(0),
      offset: num(0),
      dy: num(0),
    },
    transform: serialTransform(transform),
    filter: defaultFilter(),
    iteration: null,
  };
}

export type SerialImageValue = {
  src: string;
  crop: { top: number; left: number; width: number; height: number } | null;
  cropMode: 'cover' | 'contain' | 'stretch';
  innerAlign: string;
  mirrorX: boolean;
  mirrorY: boolean;
  innerRotate: number;
  /** Pixel size the `crop` is expressed in (the asset's intrinsic size at convert time).
   * Lets a consumer that resizes the asset rescale the crop by finalSize/natural. The
   * renderer ignores these; an editor interaction (ensureImageValue) drops them. */
  naturalWidth?: number;
  naturalHeight?: number;
};

export function makeImage(id: string, box: Box, radius: [number, number, number, number], image: SerialImageValue, transform: DecomposedTransform, surface: SurfaceInput): Template.Elements.Image {
  return {
    name: 'image',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      image: obj(image),
      pos: POS_TL,
      x: num(box.x),
      y: num(box.y),
      width: num(box.width),
      height: num(box.height),
      stroke: paint(surface.stroke ?? null),
      strokeWidth: num(surface.strokeWidth ?? 0),
      strokeAlignment: str(surface.strokeAlignment ?? 'center'),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      opacity: num(surface.opacity ?? 1),
      radius: numArray(radius),
      // Image fill MUST be 'none'. In @bluepic/core a valid fill switches the
      // image into "fill masked by image alpha" mode (hasValidFill = fill &&
      // fill !== 'none') — wrong for a real cropped photo. The IDML frame's own
      // fill is irrelevant to the Bluepic image element.
      fill: str('none'),
    },
    transform: serialTransform(transform),
    filter: defaultFilter(),
    iteration: null,
  };
}

export type RichTextRun = { text: string; format: Record<string, unknown> };

/** The core line-box models a Text element's `bounding` may select. */
export type TextBounding = 'font' | 'actual' | 'actual-outer' | 'fontSize';

export type TextInput = {
  box: Box;
  textMode: 'plaintext' | 'richtext';
  text: string;
  richText: RichTextRun[];
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  lineHeight: number;
  letterSpacing: number;
  textAlign: number; // 0..1 fraction (also the last-line position when justifyText)
  justifyText: boolean; // stretch interior lines to fill the width
  verticalAlign: number; // 0 top, 0.5 center, 1 bottom (vertical anchor within the frame)
  uppercase?: boolean; // render text force-uppercased (IDML AllCaps)
  textDecoration?: string; // 'underline' | 'line-through' | 'underline line-through' (IDML thin Underline / StrikeThru); thick offset underlines take the Bauchbinde path instead
  hyphenate?: boolean; // IDML paragraph Hyphenation — emits hyphenation + knuth-plass (hyphenation only works under knuth-plass)
  hyphenationLanguage?: string; // BCP-47 tag (mapped from IDML AppliedLanguage); '' when off
  horizontalScale?: number; // IDML HorizontalScale as a ratio (0.99 = 99%); rides the fontStretch prop, core scales measurement + glyphs
  // Line-box model core uses for advance + first-baseline. Default 'fontSize'
  // (advance = fontSize * lineHeight, matches InDesign leading). Vertical-justify
  // may emit 'actual-outer' (outer lines capped to their real ink, inner lines to
  // the font box) so the block anchors on the first line's actual cap-top.
  bounding?: TextBounding;
  autoLinebreaks: boolean;
  fill: Paint;
  stroke?: Paint;
  strokeWidth?: number;
  opacity?: number;
};

export function makeText(id: string, input: TextInput, transform: DecomposedTransform): Template.Elements.Text {
  return {
    name: 'text',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      textMode: str(input.textMode),
      text: str(input.text),
      richText: obj(input.richText),
      autoLinebreaks: bool(input.autoLinebreaks),
      autoLinebreaksAllowBreakChars: bool(false),
      // Default 'font' (the system-wide default): line advance = (fontBoundingBox
      // ascent+descent) * lineHeight and the first line's alphabetic baseline sits at
      // frameTop + fontAscent — matching InDesign's "Ascent" first-baseline with no
      // extra shift. The idml text pipeline compensates 'font''s extra descent in the
      // emitted lineHeight so the physical leading still equals InDesign's. lineHeight
      // is the relative percentage (120 = 120%).
      bounding: str(input.bounding ?? 'font'),
      uppercase: bool(input.uppercase ?? false),
      // pos[0]/pos[1] are the horizontal/vertical anchors: they position the text
      // block within the frame (core: offset = (max - block) * pos), and x/y are the
      // anchor points (= frame.x/y + size * pos). pos[0] mirrors textAlign so the
      // block hugs the same edge its lines align to; pos[1] is the vertical
      // justification (0 top / 0.5 center / 1 bottom).
      pos: numArray([input.textAlign, input.verticalAlign]),
      x: num(input.box.x + input.box.width * input.textAlign),
      y: num(input.box.y + input.box.height * input.verticalAlign),
      width: num(input.box.width),
      height: num(input.box.height),
      fontFamily: str(input.fontFamily),
      fontSize: num(input.fontSize),
      fontWeight: num(input.fontWeight),
      fontStyle: str(input.fontStyle),
      lineHeight: num(input.lineHeight),
      letterSpacing: num(input.letterSpacing),
      textDecoration: str(input.textDecoration ?? 'none'),
      // Hyphenation: knuth-plass is required for it to take effect (core gates hyphenation
      // on the algorithm). Non-hyphenated text keeps the historical greedy-first-fit so its
      // line breaks are unchanged.
      linebreakingAlgorithm: str(input.hyphenate ? 'knuth-plass' : 'greedy-first-fit'),
      hyphenation: bool(input.hyphenate ?? false),
      hyphenationLanguage: str(input.hyphenationLanguage ?? ''),
      // Element-level HorizontalScale ratio (core reads a NUMBER here as the horizontal
      // glyph scale; the historical string 'normal' means 1). Per-run overrides ride the
      // richText `format.scale`.
      fontStretch: input.horizontalScale && input.horizontalScale !== 1 ? num(input.horizontalScale) : str('normal'),
      textAlign: num(input.textAlign),
      justifyText: bool(input.justifyText),
      rotateLine: num(0),
      rotateChar: num(0),
      lineSkewX: num(0),
      lineSkewY: num(0),
      fill: paint(input.fill),
      stroke: paint(input.stroke ?? null),
      strokeWidth: num(input.strokeWidth ?? 0),
      strokeDasharray: numArray([0, 0]),
      strokeDashoffset: num(0),
      strokeAlignment: str('center'),
      opacity: num(input.opacity ?? 1),
      type: str('box'),
      features: exprRaw('[]'),
      textOnPathInnerGlyphAnchor: str('middle'),
      textOnPathBaseline: str('baseline'),
      textOnPathDelta: num(0),
      textOnPathOffset: numArray([0, 0]),
    },
    transform: serialTransform(transform),
    filter: defaultFilter(),
    iteration: null,
  };
}

export function makeGroup(id: string, children: Template.Element[], transform: DecomposedTransform, opacity = 1): Template.Elements.Group {
  return {
    name: 'group',
    id,
    locked: false,
    properties: {
      'v-transform-origin': ORIGIN_0,
      visible: bool(true),
      opacity: num(opacity),
      // MUST be false (boolean). A truthy value turns on core's flex-layout
      // engine, which overrides each child's transform with a layoutMatrixShift
      // — NaN for absolutely-positioned children, blanking their transform.
      layout: bool(false),
      layoutAxis: str('horizontal'),
      layoutAxisDirection: str('positive'),
      layoutGap: num(0),
      layoutPos: numArray([0, 0]),
      layoutX: num(0),
      layoutY: num(0),
      layoutCrossAxisAlign: str('start'),
    },
    transform: serialTransform(transform),
    filter: defaultFilter(),
    slots: { default: children },
    iteration: null,
  };
}

export function makeMask(id: string, content: Template.Element[], maskShapes: Template.Element[], transform: DecomposedTransform, opacity = 1, surface?: SurfaceInput, surfaceRegion: 'bbox' | 'shape' = 'bbox'): Template.Elements.Mask {
  const properties: Template.Elements.Mask['properties'] = {
    'v-transform-origin': ORIGIN_0,
    visible: bool(true),
    opacity: num(opacity),
    invert: bool(false),
    colorMasking: bool(false),
  };
  // Emit the surface (fill/stroke drawn behind/on top of the masked content) only
  // when requested, so plain clipping masks stay minimal. `surfaceRegion: 'shape'`
  // paints on the clip-shape path itself (radius ignored — corners come from the
  // shape); 'bbox' paints a rounded rectangle over the clipped combined bbox.
  if (surface || surfaceRegion !== 'bbox') {
    // Stroke MUST be `none` (not transparent) when absent — core skips stroke on `!== 'none'`.
    properties.fill = surface?.fill != null ? paint(surface.fill) : str('none');
    properties.stroke = surface?.stroke != null ? paint(surface.stroke) : str('none');
    properties.strokeWidth = num(surface?.strokeWidth ?? 0);
    properties.strokeDasharray = numArray([0]);
    properties.strokeDashoffset = num(0);
    properties.strokeAlignment = str(surface?.strokeAlignment ?? 'center');
    properties.radius = numArray(surface?.radius ?? [0, 0, 0, 0]);
    properties.surfaceRegion = str(surfaceRegion);
  }
  return {
    name: 'mask',
    id,
    locked: false,
    properties,
    transform: serialTransform(transform),
    filter: defaultFilter(),
    slots: { default: content, mask: maskShapes },
    iteration: null,
  };
}

/** An empty render-ready Serial of the given canvas size. */
export function emptySerial(width: number, height: number, context: Template.Element[], fonts: Template.Font[] = []): Template.Serial {
  return {
    studioVersion: '0.0.0',
    bxCoreVersion: '0.0.0',
    width,
    height,
    fonts,
    context,
    bindings: {},
    computedBindings: {},
    fields: [],
    format: 'png',
    meta: { fields: [] },
    autosave: false,
    animation: { duration: 60, fps: 30 },
    grid: { horizontal: [], vertical: [] },
    gridMode: 'alt',
    enforceServersideRendering: false,
  };
}
