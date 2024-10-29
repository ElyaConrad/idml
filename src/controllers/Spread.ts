import {
  createIDMLTransform,
  ensureBoolean,
  flattenIDMLProperties,
  getElementAttributes,
  getIDMLElementProperties,
  parseIDMLTransform,
  serializeElement,
  Transform,
} from '../helpers.js';
import { Page } from './Page.js';
import { IDMLSpreadPackageContext } from './SpreadPackage.js';
import { Sprite } from './sprites/Sprite.js';
import { RectangleSprite } from './sprites/Rectangle.js';
import { GroupSprite } from './sprites/Group.js';
import { TextFrame } from './sprites/TextFrame.js';
import { makeElementNode, XMLNode } from '../util/xml.js';

export type FlattenerPreference = {
  sourceElement?: Element;
};

export class Spread {
  private hidden?: boolean;
  private itemTransform?: Transform;
  private flattenerPreference: FlattenerPreference;
  constructor(
    private id: string,
    private pages: Page[],
    private sprites: Sprite[],
    opts: {
      hidden?: boolean;
      itemTransform?: Transform;
      flattenerPreference: FlattenerPreference;
    },
    private context: IDMLSpreadPackageContext
  ) {
    this.hidden = opts.hidden;
    this.itemTransform = opts.itemTransform;
    this.flattenerPreference = opts.flattenerPreference;
  }
  serialize() {
    return serializeElement(
      'Spread',
      {
        Hidden: this.hidden,
        ItemTransform: this.itemTransform ? createIDMLTransform(this.itemTransform).join(' ') : undefined,
      },
      this.id,
      this.context.spreadPackageRoot,
      ['Properties'],
      [
        serializeElement('FlattenerPreference', {}, this.flattenerPreference.sourceElement, this.context.spreadPackageRoot, [
          'Properties',
        ]),
        ...this.pages.map((page) => page.serialize()),
        ...this.sprites.map((sprite) => sprite.serialize()),
      ]
    );
  }
  static getDirectChildren(element: Element, tagName: string) {
    return Array.from(element.children).filter((child) => child.tagName === tagName);
  }
  static getChildSprites(element: Element, context: IDMLSpreadPackageContext) {
    return [
      ...Spread.getDirectChildren(element, 'Group').map((groupElement) => GroupSprite.parseElement(groupElement, context)),
      ...Spread.getDirectChildren(element, 'Rectangle').map((rectangleElement) =>
        RectangleSprite.parseElement(rectangleElement, context)
      ),
      ...Spread.getDirectChildren(element, 'TextFrame').map((textFrameElement) =>
        TextFrame.parseElement(textFrameElement, context)
      ),
    ];
  }
  static keepChildren(element: Element): XMLNode[] {
    const children = Array.from(element.childNodes);
    return children.map((child) => {
      if (child.nodeType === 1) {
        const childElement = child as Element;
        return makeElementNode(childElement.tagName, getElementAttributes(childElement), Spread.keepChildren(childElement));
      } else if (child.nodeType === 3) {
        return {
          type: 'text',
          text: child.nodeValue ?? '',
        };
      } else if (child.nodeType === 4) {
        return {
          type: 'cdata',
          data: child.nodeValue ?? '',
        };
      } else {
        throw new Error('Unexpected node type');
      }
    });
    // return Spread.getDirectChildren(element, '*').filter(child => child.tagName !== 'Content').map(child => makeElementNode(child.tagName, getElementAttributes(child), Spread.keepChildren(child)));
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const props = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };

    const pages = Array.from(element.getElementsByTagName('Page')).map((pageElement) =>
      Page.parseElement(pageElement, context)
    );

    const id = props.Self;
    if (!id) {
      throw new Error('Spread element must have a Self attribute');
    }
    const hidden = ensureBoolean(props.Hidden);
    const itemTransform = parseIDMLTransform(props.ItemTransform);

    const flattenerPreferenceElement = element.getElementsByTagName('FlattenerPreference')[0];
    const flattenerPreference = {
      sourceElement: flattenerPreferenceElement,
    };

    const sprites = Spread.getChildSprites(element, context);

    return new Spread(
      id,
      pages,
      sprites,
      {
        hidden,
        itemTransform,
        flattenerPreference,
      },
      context
    );
  }
}
