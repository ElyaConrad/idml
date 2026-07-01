import { ElementNode, ensureNumber, makeCDataNode, makeElementNode } from 'flat-svg';
import { flattenIDMLProperties, getIDMLElementProperties } from '../../helpers.js';
import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';
import {fileTypeFromBuffer} from 'file-type';
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
  public linkURI?: string;
  // The source IDML tag: 'Image' (raster) or a placed vector graphic
  // ('PDF' | 'EPS' | 'WMF'). All are modelled as ImageSprite (same GraphicBounds
  // / Contents / Link structure) but only 'Image' has usable raster bytes.
  private graphicType: string;
  constructor(id: string, contents: ArrayBuffer | undefined, graphicBounds: GraphicBounds | undefined, opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext, linkURI?: string, graphicType: string = 'Image') {
    super(id, 'Image', opts, context);

    this.contents = contents;
    this.graphicBounds = graphicBounds;
    this.linkURI = linkURI;
    this.graphicType = graphicType;
  }
  /** The original linked resource URI (e.g. `file:/…/cover.png`), if any. */
  getLinkURI() {
    return this.linkURI;
  }
  /** The source IDML tag ('Image' | 'PDF' | 'EPS' | 'WMF'). */
  getGraphicType() {
    return this.graphicType;
  }
  /** True for placed vector graphics (PDF/EPS/WMF) whose embedded bytes are not
   * a browser-renderable raster — they must be supplied via their link instead. */
  isVectorGraphic() {
    return this.graphicType !== 'Image';
  }
  /** Embedded bytes only when they are a usable raster (a real `<Image>`).
   * Vector graphics return undefined so they fall back to their link + placeholder. */
  getRasterContents(): ArrayBuffer | undefined {
    return this.isVectorGraphic() ? undefined : this.contents;
  }
  protected serializeTagName(): string {
    return this.graphicType;
  }
  async getImageType() {
    if (!this.contents) throw new Error('No contents');
    return await fileTypeFromBuffer(new Uint8Array(this.contents));
  }
  getContents() {
    return this.contents;
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

    // The original linked file (e.g. `file:/…/cover.png`), from the <Link> element.
    const linkElement = Array.from(element.getElementsByTagName('Link'))[0] as Element | undefined;
    const linkURI = linkElement?.getAttribute('LinkResourceURI') ?? undefined;

    return new ImageSprite(
      id,
      contents,
      graphicBounds,
      {
        ...opts,
        pathGeometry,
      },
      context,
      linkURI,
      element.tagName // 'Image' | 'PDF' | 'EPS' | 'WMF'
    );
  }
}
