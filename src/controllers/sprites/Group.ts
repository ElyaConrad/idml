import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { Sprite, SpriteOpts } from './Sprite.js';

export class GroupSprite extends Sprite {
  constructor(id: string, private sprites: Sprite[], opts: SpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, 'Group', opts, context);
  }
  serialize() {
    const children = this.sprites.map((sprite) => sprite.serialize());
    const baseElement = this.serializeSprite();
    baseElement.children = [...children, ...(baseElement.children ?? [])];

    return baseElement;
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext): GroupSprite {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const sprites = Spread.getChildSprites(element, context);

    return new GroupSprite(id, sprites, opts, context);
  }
}
