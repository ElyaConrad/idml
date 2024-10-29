import { serializeElement } from '../../helpers.js';
import { ElementNode } from '../../util/xml.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometryPathType, PathPoint, RectangleSprite } from './Rectangle.js';
import { Sprite, SpriteOpts } from './Sprite.js';

export type TextFramePreference = {
  sourceElement: Element;
};

export class TextFrame extends Sprite {
  private open: boolean;
  private geometryPathType: GeometryPathType;
  private pathPoints: PathPoint[];

  textFramePreference?: TextFramePreference;
  constructor(
    id: string,
    opts: SpriteOpts & {
      open: boolean;
      geometryPathType: GeometryPathType;
      pathPoints: PathPoint[];
      textFramePreference?: TextFramePreference;
    },
    context: IDMLSpreadPackageContext
  ) {
    super(id, 'TextFrame', opts, context);

    this.open = opts.open;
    this.geometryPathType = opts.geometryPathType;
    this.pathPoints = opts.pathPoints;

    this.textFramePreference = opts.textFramePreference;
  }
  serialize() {
    const baseElement = RectangleSprite.injectPathGeometry(this.serializeSprite(), {
      open: this.open,
      geometryPathType: this.geometryPathType,
      pathPoints: this.pathPoints,
    });

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

    const { pathPoints, geometryPathType, open } = RectangleSprite.parsePathGeometry(element);

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
