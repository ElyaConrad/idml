import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';

export class RectangleSprite extends GeometricSprite {
  constructor(id: string, opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, 'Rectangle', opts, context);
  }
  getBBox() {
    return this.getGeometricBounds();
  }
  setBBox(x: number, y: number, width: number, height: number) {
    const path = [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ] as [number, number][];
    this.setPathPoints(path.map((point) => ({ anchor: point, leftDirection: point, rightDirection: point })));
  }
  serialize() {
    return this.serializeGeometricSprite();
  }

  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const { pathPoints, geometryPathType, open } = RectangleSprite.parsePathGeometry(element);

    return new RectangleSprite(
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
