export type ColorDescriptor = {
  type: 'color';
  red: number;
  green: number;
  blue: number;
  alpha: number;
};
export type ColorStopDescriptor = {
  position: number;
  color: ColorDescriptor;
};
export type LinearGradientDescriptor = {
  type: 'gradient';
  gradientType: 'linear';
  angle: number;
  stops: ColorStopDescriptor[];
};
export type RadialGradientDescriptor = {
  type: 'gradient';
  gradientType: 'radial';
  angle: number;
  stops: ColorStopDescriptor[];
};
export type GradientDescriptor = LinearGradientDescriptor | RadialGradientDescriptor;


export type SVGColorStop = {
  offset: number; // 0–1
  stopColor: string; // CSS rgba()
  stopOpacity: number; // 0–1
};


export type SVGLinearGradientDescriptor = {
  type: 'linearGradient';
  attrs: {
  gradientUnits: 'objectBoundingBox';
  x1: string;
  y1: string;
  x2: string;
  y2: string;
};
  stops: SVGColorStop[];
};

export type SVGRadialGradientDescriptor = {
  type: 'radialGradient';
  attrs: {
  gradientUnits: 'objectBoundingBox';
  cx: string;
  cy: string;
  r: string;
  fx: string;
  fy: string;
};
  stops: SVGColorStop[];
};

export type SVGGradientDescriptor = SVGLinearGradientDescriptor | SVGRadialGradientDescriptor;

function colorToCSS({ red, green, blue }: ColorDescriptor): string {
  const r = Math.round(red);
  const g = Math.round(green);
  const b = Math.round(blue);
  return `rgb(${r},${g},${b})`;
}

function convertStops(stops: ColorStopDescriptor[]): SVGColorStop[] {
  return stops.map(({ position, color }) => ({
    offset: position / 100,
    stopColor: colorToCSS(color),
    stopOpacity: color.alpha,
  }));
}

function angleToLinearGradientAttrs(angleDeg: number): SVGLinearGradientDescriptor['attrs'] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Direction vector in screen space (Y flipped)
  const dx = cos;
  const dy = -sin;

  // Scale so the gradient always spans the full bounding box diagonal
  // by clamping to the unit square: find t such that the line from
  // (0.5 - dx*t, 0.5 - dy*t) to (0.5 + dx*t, 0.5 + dy*t) touches the edge.
  const t = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), 1e-10);

  const fmt = (n: number) => n.toFixed(6);

  return {
    gradientUnits: 'objectBoundingBox',
    x1: fmt(0.5 - dx * t),
    y1: fmt(0.5 - dy * t),
    x2: fmt(0.5 + dx * t),
    y2: fmt(0.5 + dy * t),
  };
}

function convertLinear(gradient: LinearGradientDescriptor): SVGLinearGradientDescriptor {
  return {
    type: 'linearGradient',
    attrs: angleToLinearGradientAttrs(gradient.angle),
    stops: convertStops(gradient.stops),
  };
}

function convertRadial(gradient: RadialGradientDescriptor): SVGRadialGradientDescriptor {
  // Radial gradients don't use angle for positioning in SVG —
  // they always radiate from center. The angle could rotate the
  // stop positions but SVG has no native support for that.
  return {
    type: 'radialGradient',
    attrs: {
      gradientUnits: 'objectBoundingBox',
      cx: '0.5',
      cy: '0.5',
      r: '0.5',
      fx: '0.5',
      fy: '0.5',
    },
    stops: convertStops(gradient.stops),
  };
}

// ── Main converter ───────────────────────────────────────────────────────────

export function convertGradientToSVG(gradient: GradientDescriptor): SVGGradientDescriptor {
  switch (gradient.gradientType) {
    case 'linear': return convertLinear(gradient);
    case 'radial': return convertRadial(gradient);
  }
}