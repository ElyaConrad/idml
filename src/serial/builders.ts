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
  return { blur: n, grayscale: n, sepia: n, exposure: n, contrast: n, saturate: n, brightness: n, invert: n, gradientMap: n, hueRotate: n, opacity: n, dropShadow: n };
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
      strokeAlignment: str('center'),
    },
    transform: serialTransform(transform),
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
      strokeAlignment: str('center'),
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
      strokeAlignment: str('center'),
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
      strokeAlignment: str('center'),
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
      fontStretch: str('normal'),
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
