import { ensureArray, ensureBoolean } from '../../helpers.js';
import { KeyMap } from '../../util/keyMap.js';
import { ElementNode, makeElementNode } from '../../util/xml.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { Sprite, SpriteOpts } from './Sprite.js';

export type GeometryPathType = 'normalPath' | 'clippingPath' | 'textPath' | 'motionPath' | 'guidePath';

const geometryPathTypeMap = new KeyMap({
  NormalPath: 'normalPath',
  ClippingPath: 'clippingPath',
  TextPath: 'textPath',
  MotionPath: 'motionPath',
  GuidePath: 'guidePath',
} as const);

export type PathPoint = {
  anchor: [number, number];
  leftDirection: [number, number];
  rightDirection: [number, number];
};

export class RectangleSprite extends Sprite {
  private open: boolean;
  private geometryPathType: GeometryPathType;
  private pathPoints: PathPoint[];
  constructor(
    id: string,
    opts: SpriteOpts & {
      open: boolean;
      geometryPathType: GeometryPathType;
      pathPoints: PathPoint[];
    },
    context: IDMLSpreadPackageContext
  ) {
    super(id, 'Rectangle', opts, context);

    this.open = opts.open;
    this.geometryPathType = opts.geometryPathType;
    this.pathPoints = opts.pathPoints;
  }
  static injectPathGeometry(
    baseElement: ElementNode,
    opts: { open: boolean; geometryPathType: GeometryPathType; pathPoints: PathPoint[] }
  ) {
    const pathGeometryProperty = makeElementNode('PathGeometry', {}, [
      makeElementNode(
        'GeometryPathType',
        {
          GeometryPathType: geometryPathTypeMap.getExternal(opts.geometryPathType),
          PathOpen: opts.open,
        },
        [
          makeElementNode(
            'PathPointArray',
            {},
            opts.pathPoints.map((pathPoint) => {
              return makeElementNode('PathPointType', {
                Anchor: pathPoint.anchor.join(' '),
                LeftDirection: pathPoint.leftDirection.join(' '),
                RightDirection: pathPoint.rightDirection.join(' '),
              });
            })
          ),
        ]
      ),
    ]);

    const existingPropertiesElement = baseElement.children?.find(
      (child) => child.type === 'element' && child.tagName === 'Properties'
    ) as ElementNode | undefined;
    if (existingPropertiesElement) {
      existingPropertiesElement.children = [...(existingPropertiesElement.children ?? []), pathGeometryProperty];
    } else {
      baseElement.children = [makeElementNode('Properties', {}, [pathGeometryProperty]), ...(baseElement.children ?? [])];
    }

    return baseElement;
  }
  serialize() {
    return RectangleSprite.injectPathGeometry(this.serializeSprite(), {
      open: this.open,
      geometryPathType: this.geometryPathType,
      pathPoints: this.pathPoints,
    });
  }
  static parsePathGeometry(element: Element) {
    const pathGeometryElement = element.querySelector('Properties > PathGeometry');
    if (!pathGeometryElement) {
      throw new Error('PathGeometry element not found');
    }
    const geometryPathTypeElement = pathGeometryElement.querySelector('GeometryPathType');
    if (!geometryPathTypeElement) {
      throw new Error('GeometryPathType element not found');
    }
    const open = ensureBoolean(geometryPathTypeElement.getAttribute('PathOpen'));
    const geometryPathType = geometryPathTypeMap.getInternal(geometryPathTypeElement.getAttribute('GeometryPathType'));

    const pathPointArrayElement = pathGeometryElement.querySelector('PathPointArray');
    if (!pathPointArrayElement) {
      throw new Error('PathPointArray element not found');
    }

    const pathPointElements = Array.from(pathPointArrayElement.querySelectorAll('PathPointType'));

    const pathPoints = pathPointElements.map((pathPointElement) => {
      return {
        anchor: ensureArray(pathPointElement.getAttribute('Anchor') ?? '0 0') as [number, number],
        leftDirection: ensureArray(pathPointElement.getAttribute('LeftDirection') ?? '0 0') as [number, number],
        rightDirection: ensureArray(pathPointElement.getAttribute('RightDirection') ?? '0 0') as [number, number],
      };
    });

    return {
      pathPoints,
      open,
      geometryPathType,
    };
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
