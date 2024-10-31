import { serializeElement } from '../../helpers.js';
import { ElementNode } from '../../util/xml.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { RectangleSprite } from './Rectangle.js';
import { Sprite, SpriteOpts } from './Sprite.js';

export type TextFramePreference = {
  sourceElement: Element;
};

export class TextFrame extends GeometricSprite {
  textFramePreference?: TextFramePreference;
  constructor(
    id: string,
    opts: GeometricSpriteOpts & {
      textFramePreference?: TextFramePreference;
    },
    context: IDMLSpreadPackageContext
  ) {
    super(id, 'TextFrame', opts, context);

    this.textFramePreference = opts.textFramePreference;
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
    const baseElement = this.serializeGeometricSprite();

    if (this.textFramePreference) {
      baseElement.children?.push(
        serializeElement('TextFramePreference', {}, this.textFramePreference.sourceElement, this.context.spreadPackageRoot, [
          'Properties',
        ])
      );
    }
    return baseElement;
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const { pathPoints, geometryPathType, open } = GeometricSprite.parsePathGeometry(element);

    const textFramePreferenceElement = Spread.getDirectChildren(element, 'TextFramePreference')[0];
    const textFramePreference = textFramePreferenceElement ? { sourceElement: textFramePreferenceElement } : undefined;

    return new TextFrame(
      id,
      {
        ...opts,
        open,
        geometryPathType,
        pathPoints,
        textFramePreference,
      },
      context
    );
  }
}
