import arcToBezier from 'svg-arc-to-cubic-bezier';
import SVGPathCommander from 'svg-path-commander';

export interface PathRule {
  relative?: boolean;
}
export interface PathMove extends PathRule {
  type: 'move';
  x: number;
  y: number;
}
export interface PathLine extends PathRule {
  type: 'line';
  x: number;
  y: number;
}
export interface PathCubicBezier extends PathRule {
  type: 'cubic-bezier';
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x: number;
  y: number;
}
export interface PathCubicBezierSmooth extends PathRule {
  type: 'cubic-bezier-smooth';
  cx: number;
  cy: number;
  x: number;
  y: number;
}
export interface PathQuadraticBezier extends PathRule {
  type: 'quadratic-bezier';
  cx: number;
  cy: number;
  x: number;
  y: number;
}
export interface PathEllipticalArc extends PathRule {
  type: 'elliptical-arc';
  rx: number;
  ry: number;
  angle: number;
  largeArc: boolean;
  sweep: boolean;
  x: number;
  y: number;
}
export interface PathClose extends PathRule {
  type: 'close';
  x: number;
  y: number;
}
export type PathSegment = PathMove | PathCubicBezier | PathCubicBezierSmooth | PathEllipticalArc | PathQuadraticBezier | PathLine | PathClose;
export type PathSegmentMinimal = PathClose | PathMove | PathCubicBezier | PathLine;

export type Point = { x: number; y: number };

export function getContraryPoint(origin: Point, point: Point, diff?: number) {
  const xDiff = point.x - origin.x;
  const yDiff = point.y - origin.y;

  const totalDiff = Math.sqrt(xDiff ** 2 + yDiff ** 2);
  diff = diff ?? totalDiff;

  return {
    x: origin.x - xDiff * (diff / totalDiff),
    y: origin.y - yDiff * (diff / totalDiff),
  };
}
export function getCubicBezierControlsFromCubicBezierSmooth({ cx, cy, x, y }: PathCubicBezierSmooth) {
  const c1 = { x: cx, y: cy };
  const c2 = getContraryPoint({ x, y }, c1);
  return { c1, c2 };
}
export function getCubicControlPointsFromQuadraticBezier(startPoint: Point, controlPoint: Point, endPoint: Point) {
  const c1 = getLinePoint(startPoint, controlPoint, 2 / 3);
  const c2 = getLinePoint(endPoint, controlPoint, 2 / 3);

  return { c1, c2 };
}
export function getLinePoint(p1: Point, p2: Point, pos: number) {
  return {
    x: p1.x + (p2.x - p1.x) * pos,
    y: p1.y + (p2.y - p1.y) * pos,
  };
}

export function ellipticalArcToCubicBezier(segment: PathEllipticalArc, prevPoint?: Point): PathCubicBezier[] {
  const curves = arcToBezier({
    px: prevPoint ? prevPoint.x : 0,
    py: prevPoint ? prevPoint.y : 0,
    cx: segment.x,
    cy: segment.y,
    rx: segment.rx,
    ry: segment.ry,
    xAxisRotation: segment.angle,
    largeArcFlag: segment.largeArc ? 1 : 0,
    sweepFlag: segment.sweep ? 1 : 0,
  });
  return curves.map(({ x, y, x1, y1, x2, y2 }: { x: number; y: number; x1: number; y1: number; x2: number; y2: number }) => {
    return {
      type: 'cubic-bezier',
      c1x: x1,
      c1y: y1,
      c2x: x2,
      c2y: y2,
      x,
      y,
    };
  });
}
export function cubicBezierSmoothToCubicBezier(segment: PathCubicBezierSmooth): PathCubicBezier {
  const { c1, c2 } = getCubicBezierControlsFromCubicBezierSmooth(segment);
  return {
    type: 'cubic-bezier',
    c1x: c1.x,
    c1y: c1.y,
    c2x: c2.x,
    c2y: c2.y,
    x: segment.x,
    y: segment.y,
  };
}
export function quadraticBezierToCubicBezier(segment: PathQuadraticBezier, prevPoint?: Point): PathCubicBezier {
  const { c1, c2 } = getCubicControlPointsFromQuadraticBezier(prevPoint ? { x: prevPoint.x, y: prevPoint.y } : { x: 0, y: 0 }, { x: segment.cx, y: segment.cy }, { x: segment.x, y: segment.y });
  return {
    type: 'cubic-bezier',
    c1x: c1.x,
    c1y: c1.y,
    c2x: c2.x,
    c2y: c2.y,
    x: segment.x,
    y: segment.y,
  };
}

export function getMinimalPathSegments(path: SVGPathCommander) {
  let prevPoint: Point = { x: 0, y: 0 };
  let prevQuadraticControlPoint: Point | undefined;

  return path
    .toAbsolute()
    .segments.map<PathSegmentMinimal[]>((segment) => {
      const command = segment[0];
      if (command === 'M') {
        const [, x, y] = segment;
        prevPoint = { x, y };
        return [{ type: 'move', x, y }];
      } else if (command === 'L') {
        const [, x, y] = segment;
        prevPoint = { x, y };
        return [{ type: 'line', x, y }];
      } else if (command === 'H') {
        const [, x] = segment;
        prevPoint = { x, y: prevPoint.y };
        return [{ type: 'line', x, y: prevPoint.y }];
      } else if (command === 'V') {
        const [, y] = segment;
        prevPoint = { x: prevPoint.x, y };
        return [{ type: 'line', x: prevPoint.x, y }];
      } else if (command === 'C') {
        const [, c1x, c1y, c2x, c2y, x, y] = segment;
        prevPoint = { x, y };
        return [{ type: 'cubic-bezier', c1x, c1y, c2x, c2y, x, y }];
      } else if (command === 'S') {
        const [, cx, cy, x, y] = segment;
        prevPoint = { x, y };
        return [cubicBezierSmoothToCubicBezier({ type: 'cubic-bezier-smooth', cx, cy, x, y })];
      } else if (command === 'Q') {
        const [, cx, cy, x, y] = segment;
        prevPoint = { x, y };
        prevQuadraticControlPoint = { x: cx, y: cy };
        return [quadraticBezierToCubicBezier({ type: 'quadratic-bezier', cx, cy, x, y }, prevPoint)];
      } else if (command === 'T') {
        const [, x, y] = segment;
        prevPoint = { x, y };
        if (prevQuadraticControlPoint) {
          const { x: cx, y: cy } = getContraryPoint(prevPoint, prevQuadraticControlPoint);
          prevQuadraticControlPoint = { x: cx, y: cy };
          return [quadraticBezierToCubicBezier({ type: 'quadratic-bezier', cx, cy, x, y }, prevPoint)];
        } else {
          return [{ type: 'line', x, y }];
        }
      } else if (command === 'A') {
        return ellipticalArcToCubicBezier(
          {
            type: 'elliptical-arc',
            rx: segment[1],
            ry: segment[2],
            angle: segment[3],
            largeArc: !!segment[4],
            sweep: !!segment[5],
            x: segment[6],
            y: segment[7],
          },
          prevPoint
        );
      } else if (command === 'Z') {
        return [{ type: 'close' } as PathClose];
      } else {
        throw new Error(`Unknown command: ${command}`);
      }
    })
    .flat(1);
}
