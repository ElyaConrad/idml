import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';
import { ensureNumber, flattenIDMLProperties, getIDMLElementProperties } from '../../helpers.js';
import { KeyMap } from '../../util/keyMap.js';

export type CornerType = 'none' | 'rounded' | 'inverseRounded' | 'inset' | 'bevel';

export type CornerOption = {
  type: CornerType;
  radius: number;
};

export type CornerOptions = {
  topLeft: CornerOption;
  topRight: CornerOption;
  bottomRight: CornerOption;
  bottomLeft: CornerOption;
};

const cornerTypeMap = new KeyMap({
  None: 'none',
  RoundedCorner: 'rounded',
  InverseRoundedCorner: 'inverseRounded',
  InsetCorner: 'inset',
  BevelCorner: 'bevel',
} as const);

export class RectangleSprite extends GeometricSprite {
  private cornerOptions?: CornerOptions;

  constructor(id: string, private sprites: Sprite[], opts: GeometricSpriteOpts & { cornerOptions?: CornerOptions }, context: IDMLSpreadPackageContext) {
    super(id, 'Rectangle', opts, context);
    this.cornerOptions = opts.cornerOptions;
  }

  getCornerOptions() {
    return this.cornerOptions;
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
  getSprites() {
    return this.sprites;
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

    // Parse corner options — per-corner attributes take precedence over global CornerOption/CornerRadius
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as { [k: string]: string | undefined };

    const parseCorner = (optionKey: string, radiusKey: string): CornerOption => {
      const type = cornerTypeMap.getInternal(props[optionKey] ?? props['CornerOption'] ?? 'None') ?? 'none';
      const radius = ensureNumber(props[radiusKey] ?? props['CornerRadius']) ?? 0;
      return { type, radius };
    };

    const cornerOptions: CornerOptions = {
      topLeft: parseCorner('TopLeftCornerOption', 'TopLeftCornerRadius'),
      topRight: parseCorner('TopRightCornerOption', 'TopRightCornerRadius'),
      bottomRight: parseCorner('BottomRightCornerOption', 'BottomRightCornerRadius'),
      bottomLeft: parseCorner('BottomLeftCornerOption', 'BottomLeftCornerRadius'),
    };

    return new RectangleSprite(
      id,
      sprites,
      {
        ...opts,
        pathGeometry,
        cornerOptions,
      },
      context
    );
  }
}
