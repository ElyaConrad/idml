import { flattenIDMLProperties, getIDMLElementProperties, serializeElement } from '../../helpers.js';
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
    private parentStoryId: string,
    opts: GeometricSpriteOpts & {
      textFramePreference?: TextFramePreference;
    },
    context: IDMLSpreadPackageContext
  ) {
    super(id, 'TextFrame', opts, context);

    console.log('!!!!!!!!!!!!!!!!!!!!!!', id, parentStoryId);

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
    this.setPaths([{ open: false, pathPoints: path.map((point) => ({ anchor: point, leftDirection: point, rightDirection: point })) }]);
  }
  getStory() {
    return this.context.idml.getStoryById(this.parentStoryId);
  }
  serialize() {
    const baseElement = this.serializeGeometricSprite();
    baseElement.attributes = {
      ...baseElement.attributes,
      ParentStory: this.parentStoryId,
    };

    if (this.textFramePreference) {
      baseElement.children?.push(serializeElement('TextFramePreference', {}, this.textFramePreference.sourceElement, this.context.spreadPackageRoot, ['Properties']));
    }
    return baseElement;
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const {
      ParentStory: parentStoryId,
      PreviousTextFrame: previousTextFrame,
      NextTextFrame: nextTextFrame,
      ContentType: contentType,
      OverriddenPageItemProps: overriddenPageItemProps,
    } = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    if (parentStoryId === undefined) {
      throw new Error('ParentStory not found');
    }

    const pathGeometry = GeometricSprite.parsePathGeometry(element);

    const textFramePreferenceElement = Spread.getDirectChildren(element, 'TextFramePreference')[0];
    const textFramePreference = textFramePreferenceElement ? { sourceElement: textFramePreferenceElement } : undefined;

    return new TextFrame(
      id,
      parentStoryId,
      {
        ...opts,
        pathGeometry,
        textFramePreference,
      },
      context
    );
  }
}
