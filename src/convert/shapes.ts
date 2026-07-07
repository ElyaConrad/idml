import type * as Template from '../serial/serial-types';
import { RectangleSprite } from '../controllers/sprites/Rectangle';
import { OvalSprite } from '../controllers/sprites/Oval';
import { PolygonSprite } from '../controllers/sprites/Polygon';
import { CornerOptions } from '../controllers/sprites/Rectangle';
import { PathCommand } from '../idml';
import { makeRectangle, makeCircle, makePath, Box, PathFeature, SurfaceInput } from '../serial/builders';
import { IDENTITY_DECOMP } from './constants';

export function cornerRadii(corners: CornerOptions | undefined, _box: Box): [number, number, number, number] {
  if (!corners) return [0, 0, 0, 0];
  const r = (c: { type: string; radius: number }) => (c.type !== 'none' ? c.radius : 0);
  return [r(corners.topLeft), r(corners.topRight), r(corners.bottomRight), r(corners.bottomLeft)];
}
export function cornersAreSimple(corners: CornerOptions | undefined): boolean {
  if (!corners) return true;
  return Object.values(corners).every((c) => c.type === 'none' || c.type === 'rounded');
}

export function pathFeatures(paths: PathCommand[][]): PathFeature[] {
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

export const MASK_FILL: SurfaceInput = { fill: '#ffffffff', opacity: 1 };

/**
 * The frame's outline as a Bluepic element in frame-local coords (identity
 * transform), painted with `surface` and tagged `${id}-${suffix}`. Shared by
 * both the white mask-clip shape and the frame's own filled background.
 */
export function frameShape(frame: RectangleSprite | OvalSprite | PolygonSprite, suffix: string, surface: SurfaceInput): Template.Element {
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
export function frameOutlineShape(frame: RectangleSprite | OvalSprite | PolygonSprite): Template.Element {
  return frameShape(frame, 'maskshape', MASK_FILL);
}
