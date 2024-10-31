import { ElementNode } from '../../util/xml.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts, PathPoint } from './GeometricSprite.js';
import { RectangleSprite } from './Rectangle.js';
import { Sprite, SpriteOpts } from './Sprite.js';

export class OvalSprite extends GeometricSprite {
  constructor(id: string, opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, 'Oval', opts, context);
  }
  // Calculate the path points for an ellipse from the 0,0 position
  static calculateEllipsePathPoints(x: number, y: number, radiusX: number, radiusY: number): PathPoint[] {
    const centerX = x + radiusX;
    const centerY = y + radiusY;

    // Control point offsets for a perfect ellipse
    const controlOffsetX = 0.5523 * radiusX;
    const controlOffsetY = 0.5523 * radiusY;

    // Define the four anchor points (top, right, bottom, left positions)
    const pathPoints: PathPoint[] = [
      {
        // Top position
        anchor: [centerX, centerY - radiusY],
        leftDirection: [centerX - controlOffsetX, centerY - radiusY],
        rightDirection: [centerX + controlOffsetX, centerY - radiusY],
      },
      {
        // Right position
        anchor: [centerX + radiusX, centerY],
        leftDirection: [centerX + radiusX, centerY - controlOffsetY],
        rightDirection: [centerX + radiusX, centerY + controlOffsetY],
      },
      {
        // Bottom position
        anchor: [centerX, centerY + radiusY],
        leftDirection: [centerX + controlOffsetX, centerY + radiusY],
        rightDirection: [centerX - controlOffsetX, centerY + radiusY],
      },
      {
        // Left position
        anchor: [centerX - radiusX, centerY],
        leftDirection: [centerX - radiusX, centerY + controlOffsetY],
        rightDirection: [centerX - radiusX, centerY - controlOffsetY],
      },
    ];

    return pathPoints;
  }
  getEllipse() {
    const geometricBounds = this.getGeometricBounds();

    const radiusX = geometricBounds.width / 2;
    const radiusY = geometricBounds.height / 2;

    const x = geometricBounds.x + radiusX;
    const y = geometricBounds.y + radiusY;

    return { x, y, radiusX, radiusY };
  }
  setEllipse(x: number, y: number, radiusX: number, radiusY: number) {
    this.setPathPoints(OvalSprite.calculateEllipsePathPoints(x - radiusX, y - radiusY, radiusX, radiusY));
  }
  serialize() {
    return this.serializeGeometricSprite();
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const { pathPoints, geometryPathType, open } = OvalSprite.parsePathGeometry(element);

    return new OvalSprite(
      id,
      {
        ...opts,
        open,
        geometryPathType,
        pathPoints,
      },
      context
    );
  }
}
