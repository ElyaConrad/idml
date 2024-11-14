import { KeyMap } from '../../util/keyMap.js';
import { ElementNode, makeElementNode } from 'flat-svg';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { Sprite, SpriteOpts } from './Sprite.js';
import { GeometricBounds } from '../../types/index.js';
import { ensureArray, ensureBoolean } from '../../helpers.js';

export type GeometryPathType = 'normalPath' | 'clippingPath' | 'textPath' | 'motionPath' | 'guidePath';

export type PathGeometry = {
  open: boolean;
  geometryPathType: GeometryPathType;
  pathPoints: PathPoint[];
};

export type GeometricSpriteOpts = SpriteOpts & {
  pathGeometry: PathGeometry[];
};

export type PathPoint = {
  anchor: [number, number];
  leftDirection: [number, number];
  rightDirection: [number, number];
};

const geometryPathTypeMap = new KeyMap({
  NormalPath: 'normalPath',
  ClippingPath: 'clippingPath',
  TextPath: 'textPath',
  MotionPath: 'motionPath',
  GuidePath: 'guidePath',
} as const);

export class GeometricSprite extends Sprite {
  private pathGeometry: PathGeometry[];
  constructor(id: string, type: string, opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, type, opts, context);

    this.pathGeometry = opts.pathGeometry;
  }
  setPaths(newPaths: { open: boolean; pathPoints: PathPoint[] }[]) {
    this.pathGeometry = newPaths.map(({ open, pathPoints }) => {
      return {
        geometryPathType: 'normalPath',
        open,
        pathPoints: pathPoints.map((pathPoint) => {
          return {
            anchor: this.parentSpread.relativeCoords(pathPoint.anchor[0], pathPoint.anchor[1]),
            leftDirection: this.parentSpread.relativeCoords(pathPoint.leftDirection[0], pathPoint.leftDirection[1]),
            rightDirection: this.parentSpread.relativeCoords(pathPoint.rightDirection[0], pathPoint.rightDirection[1]),
          };
        }),
      };
    });
  }
  getPaths() {
    return this.pathGeometry.map(({ pathPoints, open }) => {
      return {
        open,
        pathPoints: pathPoints.map((pathPoint) => {
          return {
            anchor: this.parentSpread.normalizeCoords(pathPoint.anchor[0], pathPoint.anchor[1]),
            leftDirection: this.parentSpread.normalizeCoords(pathPoint.leftDirection[0], pathPoint.leftDirection[1]),
            rightDirection: this.parentSpread.normalizeCoords(pathPoint.rightDirection[0], pathPoint.rightDirection[1]),
          };
        }),
      };
    });
  }

  getGeometricBounds(): GeometricBounds {
    const flattenedPathPoints = this.getPaths()
      .map(({ pathPoints }) => pathPoints)
      .flat();
    const xValues = flattenedPathPoints.map(({ anchor }) => anchor[0]);
    const yValues = flattenedPathPoints.map(({ anchor }) => anchor[1]);
    return {
      x: Math.min(...xValues),
      y: Math.min(...yValues),
      width: Math.max(...xValues) - Math.min(...xValues),
      height: Math.max(...yValues) - Math.min(...yValues),
    };
  }
  static parsePathGeometry(element: Element, allowNoPathGeometry = false) {
    const pathGeometryElement = element.querySelector('Properties > PathGeometry');
    if (!pathGeometryElement) {
      if (allowNoPathGeometry) {
        return [];
      } else {
        throw new Error('PathGeometry element not found');
      }
    }
    const geometryPathTypeElements = pathGeometryElement.querySelectorAll('GeometryPathType');
    if (!geometryPathTypeElements) {
      if (allowNoPathGeometry) {
        return [];
      } else {
        throw new Error('No GeometryPathType elements found');
      }
    }

    const paths = Array.from(geometryPathTypeElements).map((geometryPathTypeElement) => {
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
    });

    // const open = ensureBoolean(geometryPathTypeElement.getAttribute('PathOpen'));
    // const geometryPathType = geometryPathTypeMap.getInternal(geometryPathTypeElement.getAttribute('GeometryPathType'));

    // const pathPointArrayElement = pathGeometryElement.querySelector('PathPointArray');
    // if (!pathPointArrayElement) {
    //   throw new Error('PathPointArray element not found');
    // }

    // const pathPointElements = Array.from(pathPointArrayElement.querySelectorAll('PathPointType'));

    // const pathPoints = pathPointElements.map((pathPointElement) => {
    //   return {
    //     anchor: ensureArray(pathPointElement.getAttribute('Anchor') ?? '0 0') as [number, number],
    //     leftDirection: ensureArray(pathPointElement.getAttribute('LeftDirection') ?? '0 0') as [number, number],
    //     rightDirection: ensureArray(pathPointElement.getAttribute('RightDirection') ?? '0 0') as [number, number],
    //   };
    // });

    return paths;
  }
  static injectPathGeometry(baseElement: ElementNode, pathGeometry: PathGeometry[]) {
    const pathGeometryProperty =
      pathGeometry.length > 0
        ? makeElementNode(
            'PathGeometry',
            {},
            pathGeometry.map(({ open, geometryPathType, pathPoints }) => {
              return makeElementNode(
                'GeometryPathType',
                {
                  GeometryPathType: geometryPathTypeMap.getExternal(geometryPathType),
                  PathOpen: open,
                },
                [
                  makeElementNode(
                    'PathPointArray',
                    {},
                    pathPoints.map((pathPoint) => {
                      return makeElementNode('PathPointType', {
                        Anchor: pathPoint.anchor.join(' '),
                        LeftDirection: pathPoint.leftDirection.join(' '),
                        RightDirection: pathPoint.rightDirection.join(' '),
                      });
                    })
                  ),
                ]
              );
            })
          )
        : undefined;

    if (pathGeometryProperty) {
      const existingPropertiesElement = baseElement.children?.find((child) => child.type === 'element' && child.tagName === 'Properties') as ElementNode | undefined;
      if (existingPropertiesElement) {
        existingPropertiesElement.children = [...(existingPropertiesElement.children ?? []), pathGeometryProperty];
      } else {
        baseElement.children = [makeElementNode('Properties', {}, [pathGeometryProperty]), ...(baseElement.children ?? [])];
      }
    }

    return baseElement;
  }
  serializeGeometricSprite() {
    return GeometricSprite.injectPathGeometry(this.serializeSprite(), this.pathGeometry);
  }
}
