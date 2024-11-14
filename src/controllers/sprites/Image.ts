import { ElementNode, ensureNumber, makeCDataNode, makeElementNode } from 'flat-svg';
import { flattenIDMLProperties, getIDMLElementProperties } from '../../helpers.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';
import imageType from 'image-type';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../util/arrayBuffer.js';

export type GraphicBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export class ImageSprite extends GeometricSprite {
  private contents?: ArrayBuffer;
  private graphicBounds?: GraphicBounds;
  constructor(id: string, contents: ArrayBuffer | undefined, graphicBounds: GraphicBounds | undefined, opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, 'Image', opts, context);

    this.contents = contents;
    this.graphicBounds = graphicBounds;
  }
  // getBBox() {
  //   return this.getGeometricBounds();
  // }
  // setBBox(x: number, y: number, width: number, height: number) {
  //   const path = [
  //     [x, y],
  //     [x + width, y],
  //     [x + width, y + height],
  //     [x, y + height],
  //   ] as [number, number][];
  //   this.setPaths([{ open: false, pathPoints: path.map((point) => ({ anchor: point, leftDirection: point, rightDirection: point })) }]);
  // }
  getImageType() {
    if (!this.contents) throw new Error('No contents');
    return imageType(new Uint8Array(this.contents));
  }
  async getNaturalSize() {
    const type = await this.getImageType();
    if (type === undefined) {
      throw new Error('Could not determine image type');
    }
    const isNode = typeof window === 'undefined';
    if (isNode) {
      const sharp = await import('sharp');
      const image = sharp.default(this.contents);
      const metadata = await image.metadata();
      return {
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
      };
    } else {
      return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => {
          resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        });
        image.addEventListener('error', reject);
        const blob = new Blob([this.contents!], { type: type.mime });
        const url = URL.createObjectURL(blob);
        image.src = url;
      });
    }
  }
  getBBox() {
    if (!this.graphicBounds) return undefined;
    const [x, y] = this.parentSpread.normalizeCoords(this.graphicBounds.left, this.graphicBounds.top);
    const [right, bottom] = this.parentSpread.normalizeCoords(this.graphicBounds.right, this.graphicBounds.bottom);
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }
  setBBox(x: number, y: number, width: number, height: number) {
    const [left, top] = this.parentSpread.relativeCoords(x, y);
    const [right, bottom] = this.parentSpread.relativeCoords(x + width, y + height);
    this.graphicBounds = {
      left,
      top,
      right,
      bottom,
    };
  }
  serialize() {
    const baseElement = this.serializeGeometricSprite();

    const contentsProperty = this.contents ? makeElementNode('Contents', {}, [makeCDataNode(arrayBufferToBase64(this.contents))]) : undefined;
    const graphicBoundsProperty = this.graphicBounds
      ? makeElementNode('GraphicBounds', {
          Left: this.graphicBounds.left.toString(),
          Top: this.graphicBounds.top.toString(),
          Right: this.graphicBounds.right.toString(),
          Bottom: this.graphicBounds.bottom.toString(),
        })
      : undefined;

    const newProperties = [contentsProperty, graphicBoundsProperty].filter((property) => property !== undefined) as ElementNode[];

    const existingPropertiesElement = baseElement.children?.find((child) => child.type === 'element' && child.tagName === 'Properties') as ElementNode | undefined;
    if (existingPropertiesElement) {
      existingPropertiesElement.children = (existingPropertiesElement.children ?? []).filter((child) => !newProperties.some((newProperty) => child.type === 'element' && newProperty.tagName === child.tagName));
    }
    if (existingPropertiesElement) {
      existingPropertiesElement.children = [...(existingPropertiesElement.children ?? []), ...newProperties];
    } else {
      baseElement.children = [makeElementNode('Properties', {}, [...newProperties]), ...(baseElement.children ?? [])];
    }

    return baseElement;
  }
  static parseGraphicBounds(element: Element) {
    const left = ensureNumber(element.getAttribute('Left') ?? undefined) ?? 0;
    const top = ensureNumber(element.getAttribute('Top') ?? undefined) ?? 0;
    const right = ensureNumber(element.getAttribute('Right') ?? undefined) ?? 0;
    const bottom = ensureNumber(element.getAttribute('Bottom') ?? undefined) ?? 0;

    return {
      left,
      top,
      right,
      bottom,
    };
  }
  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const pathGeometry = ImageSprite.parsePathGeometry(element, true);

    const { Profile: profile, Contents } = flattenIDMLProperties(getIDMLElementProperties(element, ['Properties'], [])) as {
      [k: string]: string | undefined;
    };
    const contents = Contents ? base64ToArrayBuffer(Contents) : undefined;
    const propertiesElement = Spread.getDirectChildren(element, 'Properties')[0] as Element | undefined;
    const graphicBoundsElement = propertiesElement ? Spread.getDirectChildren(propertiesElement, 'GraphicBounds')[0] : undefined;
    const graphicBounds = graphicBoundsElement ? ImageSprite.parseGraphicBounds(graphicBoundsElement) : undefined;

    return new ImageSprite(
      id,
      contents,
      graphicBounds,
      {
        ...opts,
        pathGeometry,
      },
      context
    );
  }
}
