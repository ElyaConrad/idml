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

export type PathCommandMove = { type: 'move'; x: number; y: number };
export type PathCommandLine = { type: 'line'; x: number; y: number };
export type PathCommandCubicBezier = { type: 'cubicBezier'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };
export type PathCommandClose = { type: 'close' };
export type PathCommand = PathCommandMove | PathCommandLine | PathCommandCubicBezier | PathCommandClose;

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

  private static isLineSegment(start: PathPoint, end: PathPoint): boolean {
    return (
      start.rightDirection[0] === start.anchor[0] &&
      start.rightDirection[1] === start.anchor[1] &&
      end.leftDirection[0] === end.anchor[0] &&
      end.leftDirection[1] === end.anchor[1]
    );
  }

  getPath(): PathCommand[][] {
    return this.getPaths().map(({ pathPoints, open }) => {
      const commands: PathCommand[] = [];
      if (pathPoints.length === 0) return commands;

      commands.push({ type: 'move', x: pathPoints[0].anchor[0], y: pathPoints[0].anchor[1] });

      for (let i = 1; i < pathPoints.length; i++) {
        const prev = pathPoints[i - 1];
        const cur = pathPoints[i];
        if (GeometricSprite.isLineSegment(prev, cur)) {
          commands.push({ type: 'line', x: cur.anchor[0], y: cur.anchor[1] });
        } else {
          commands.push({ type: 'cubicBezier', x1: prev.rightDirection[0], y1: prev.rightDirection[1], x2: cur.leftDirection[0], y2: cur.leftDirection[1], x: cur.anchor[0], y: cur.anchor[1] });
        }
      }

      if (!open && pathPoints.length > 0) {
        const last = pathPoints[pathPoints.length - 1];
        const first = pathPoints[0];
        if (!GeometricSprite.isLineSegment(last, first)) {
          commands.push({ type: 'cubicBezier', x1: last.rightDirection[0], y1: last.rightDirection[1], x2: first.leftDirection[0], y2: first.leftDirection[1], x: first.anchor[0], y: first.anchor[1] });
        }
        commands.push({ type: 'close' });
      }

      return commands;
    });
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
      const pathPointArrayElement = geometryPathTypeElement.querySelector('PathPointArray');
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
