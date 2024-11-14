import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';

export class RectangleSprite extends GeometricSprite {
  constructor(id: string, private sprites: Sprite[], opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
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
    this.setPaths([{ open: false, pathPoints: path.map((point) => ({ anchor: point, leftDirection: point, rightDirection: point })) }]);
  }
  addSprite(sprite: Sprite) {
    this.sprites.push(sprite);
  }
  serialize() {
    const children = this.sprites.map((sprite) => Spread.serializeSprite(sprite));
    const baseElement = this.serializeGeometricSprite();
    baseElement.children = [...(baseElement.children ?? []), ...children];

    return baseElement;
  }

  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const pathGeometry = RectangleSprite.parsePathGeometry(element);

    const sprites = Spread.getChildSprites(element, context);

    return new RectangleSprite(
      id,
      sprites,
      {
        ...opts,
        pathGeometry,
      },
      context
    );
  }
}
