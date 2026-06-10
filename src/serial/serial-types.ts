/**
 * Local, structurally-faithful mirror of the Bluepic Serial type surface we
 * produce (from `@bluepic/types` `Template`). We mirror rather than import
 * because `@bluepic/types`' index pulls in unrelated submodules (Studio/Embedded
 * → stripe) whose source has type errors, and because the standalone `idml`
 * library should not hard-depend on `@bluepic/*`.
 *
 * The objects produced here are structurally assignable to the real
 * `Template.Serial` in the playground (where the genuine types are present).
 * Keep field names/shapes in sync with @bluepic/types/src/Template.
 */

export type Value = { type: 'expression'; value: string };

export type Transform = {
  origin?: Value;
  scaleX: Value;
  scaleY: Value;
  skewX: Value;
  skewY: Value;
  translateX: Value;
  translateY: Value;
  rotate: Value;
};

export type Filter = {
  blur: Value;
  dropShadow: Value;
  grayscale: Value;
  sepia: Value;
  exposure: Value;
  contrast: Value;
  saturate: Value;
  brightness: Value;
  invert: Value;
  gradientMap: Value;
  hueRotate: Value;
  opacity: Value;
};

export type Font = { src: string; name: string };
export type Iteration = { expression: string; key: string };

export namespace Elements {
  export type ColorStop = { color: string; position: number };
  export type LinearGradient = { type: 'linear'; angle: number; stops: ColorStop[] };
  export type RadialGradient = { type: 'radial'; x1: number; y1: number; radius1: number; x2: number; y2: number; radius2: number; stops: ColorStop[] };
  export type ConicGradient = { type: 'conic'; x: number; y: number; angle: number; stops: ColorStop[] };
  export type Gradient = LinearGradient | RadialGradient | ConicGradient;

  type Common = { id: string; locked: boolean; 'bx-tracking-id'?: string; transform: Transform; filter: Filter; iteration: Iteration | null; description?: string };

  export type Rectangle = Common & {
    name: 'rectangle';
    properties: { 'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; x: Value; y: Value; width: Value; height: Value; radius: Value; pos: Value; fill: Value; stroke: Value; strokeWidth: Value; opacity: Value; strokeDasharray: Value; strokeDashoffset: Value; strokeAlignment: Value };
  };
  export type Circle = Common & {
    name: 'circle';
    properties: { 'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; x: Value; y: Value; radius: Value; pos: Value; fill: Value; stroke: Value; strokeWidth: Value; opacity: Value; strokeDasharray: Value; strokeAlignment: Value; strokeDashoffset: Value };
  };
  export type Path = Common & {
    name: 'path';
    properties: {
      'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; features: Value; fill: Value; stroke: Value; strokeWidth: Value; strokeAlignment: Value; opacity: Value; strokeDasharray: Value; strokeDashoffset: Value; displayMode: Value; text: Value; fontFamily: Value; fontSize: Value; fontWeight: Value; letterSpacing: Value; fontStyle: Value; side: Value; method: Value; lengthAdjust: Value; spacing: Value; align: Value; offset: Value; dy: Value;
    };
  };
  export type Image = Common & {
    name: 'image';
    properties: { 'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; image: Value; pos: Value; x: Value; y: Value; width: Value; height: Value; mode?: Value; stroke: Value; strokeWidth: Value; strokeAlignment: Value; strokeDasharray: Value; strokeDashoffset: Value; opacity: Value; radius: Value; fill: Value };
  };
  export type Text = Common & {
    name: 'text';
    properties: {
      'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; textMode: Value; text: Value; richText: Value; autoLinebreaks: Value; autoLinebreaksAllowBreakChars: Value; bounding: Value; uppercase: Value; pos: Value; x: Value; y: Value; width: Value; height: Value; fontFamily: Value; fontSize: Value; fontWeight: Value; fontStyle: Value; lineHeight: Value; letterSpacing: Value; fontStretch: Value; textAlign: Value; rotateLine: Value; rotateChar: Value; lineSkewX: Value; lineSkewY: Value; fill: Value; stroke: Value; strokeWidth: Value; strokeDasharray: Value; strokeDashoffset: Value; strokeAlignment: Value; opacity: Value; type: Value; features: Value; textOnPathInnerGlyphAnchor: Value; textOnPathBaseline: Value; textOnPathDelta: Value; textOnPathOffset: Value;
    };
  };
  export type Group = Common & {
    name: 'group';
    properties: { 'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; opacity: Value; layout: Value; layoutAxis: Value; layoutAxisDirection: Value; layoutGap: Value; layoutPos: Value; layoutX: Value; layoutY: Value; layoutCrossAxisAlign: Value };
    slots: { default: Element[]; mask?: Element[] };
  };
  export type Mask = Common & {
    name: 'mask';
    properties: { 'v-transform-origin'?: Value; 'v-show'?: Value; visible: Value; opacity: Value; invert: Value; colorMasking: Value };
    slots: { default: Element[]; mask: Element[] };
  };
}

export type Element = Elements.Rectangle | Elements.Circle | Elements.Path | Elements.Image | Elements.Text | Elements.Group | Elements.Mask;

export type Serial = {
  studioVersion: string;
  bxCoreVersion: string;
  width: number;
  height: number;
  fonts: Font[];
  context: Element[];
  bindings: { [k: string]: unknown };
  computedBindings: { [k: string]: string };
  fields: unknown[];
  format: string;
  meta: { fields: unknown[]; category?: string; dpi?: number; automation?: boolean };
  autosave: boolean;
  animation: { duration: number; fps: number };
  isOnboarding?: boolean;
  grid: { horizontal: number[]; vertical: number[] };
  frames?: { x: number; y: number };
  gridMode: 'alt' | 'manual';
  enforceServersideRendering: boolean;
  accessibilityDescription?: string;
  caption?: string;
};
