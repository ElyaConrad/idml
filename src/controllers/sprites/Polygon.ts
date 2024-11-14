import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts, PathPoint } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';

export type PathCommandMove = {
  type: 'move';
  x: number;
  y: number;
};

export type PathCommandLine = {
  type: 'line';
  x: number;
  y: number;
};
export type PathCommandCubicBezier = {
  type: 'cubicBezier';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
};
export type PathCommandClose = {
  type: 'close';
};
// export type PathCommandEllipticalArc = {
//   type: 'ellipticalArc';
//   rx: number;
//   ry: number;
//   xAxisRotation: number;
//   largeArcFlag: boolean;
//   sweepFlag: boolean;
//   x: number;
//   y: number;
// };
export type PathCommand = PathCommandMove | PathCommandLine | PathCommandCubicBezier | PathCommandClose;

// function calculateEllipticalArc(start: PathPoint, end: PathPoint): PathCommandEllipticalArc {
//   const rx = Math.hypot(start.rightDirection[0] - start.anchor[0], start.rightDirection[1] - start.anchor[1]);
//   const ry = Math.hypot(end.leftDirection[0] - end.anchor[0], end.leftDirection[1] - end.anchor[1]);

//   // Calculate rotation
//   const dx = start.rightDirection[0] - start.anchor[0];
//   const dy = start.rightDirection[1] - start.anchor[1];
//   const xAxisRotation = (Math.atan2(dy, dx) * 180) / Math.PI;

//   const largeArcFlag = Math.abs(end.anchor[0] - start.anchor[0]) > rx;
//   const sweepFlag = dy > 0;

//   return { type: 'ellipticalArc', rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x: end.anchor[0], y: end.anchor[1] };
// }
function calculateMove(start: PathPoint): PathCommandMove {
  return { type: 'move', x: start.anchor[0], y: start.anchor[1] };
}
function calculateLine(end: PathPoint): PathCommandLine {
  return { type: 'line', x: end.anchor[0], y: end.anchor[1] };
}
function calculateCubicBezier(start: PathPoint, end: PathPoint): PathCommandCubicBezier {
  return {
    type: 'cubicBezier',
    x1: start.rightDirection[0],
    y1: start.rightDirection[1],
    x2: end.leftDirection[0],
    y2: end.leftDirection[1],
    x: end.anchor[0],
    y: end.anchor[1],
  };
}

// function isArcSegment(start: PathPoint, end: PathPoint): boolean {
//   // Berechne die Vektoren von start und end zu ihren Kontrollpunkten
//   const startToRight = [start.rightDirection[0] - start.anchor[0], start.rightDirection[1] - start.anchor[1]];
//   const endToLeft = [end.leftDirection[0] - end.anchor[0], end.leftDirection[1] - end.anchor[1]];

//   // Prüfe, ob die Richtungen symmetrisch sind (spiegelverkehrte Vektoren)
//   const isSymmetric = startToRight[0] === -endToLeft[0] && startToRight[1] === -endToLeft[1];

//   // Berechne den Abstand (Radius) zwischen anchor und Kontrollpunkten
//   const startRadius = Math.hypot(startToRight[0], startToRight[1]);
//   const endRadius = Math.hypot(endToLeft[0], endToLeft[1]);

//   // Prüfe, ob die Radien ähnlich sind (für Bogen müssen sie übereinstimmen)
//   const radiusMatch = Math.abs(startRadius - endRadius) < 0.01;

//   return isSymmetric && radiusMatch;
// }

function isLineSegment(start: PathPoint, end: PathPoint): boolean {
  return start.rightDirection[0] === start.anchor[0] && start.rightDirection[1] === start.anchor[1] && end.leftDirection[0] === end.anchor[0] && end.leftDirection[1] === end.anchor[1];
}

export class PolygonSprite extends GeometricSprite {
  constructor(id: string, private sprites: Sprite[], opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, 'Polygon', opts, context);
  }
  getPath() {
    return this.getPaths().map(({ pathPoints, open }) => {
      const commands: PathCommand[] = [];

      if (pathPoints.length === 0) return commands;

      const firstPoint = pathPoints[0];
      commands.push(calculateMove(firstPoint));

      for (let i = 1; i < pathPoints.length; i++) {
        const currentPoint = pathPoints[i];
        const previousPoint = pathPoints[i - 1];

        if (isLineSegment(previousPoint, currentPoint)) {
          commands.push(calculateLine(currentPoint));
        } else {
          commands.push(calculateCubicBezier(previousPoint, currentPoint));
        }
      }
      if (!open) {
        commands.push({ type: 'close' });
      }

      return commands;
    });
  }
  static getPathsFromCommands(commands: PathCommand[][]) {
    return commands.map((commands) => {
      let open = true;
      const pathPoints = commands
        .map((command, index) => {
          const nextCommand = commands[index + 1] as PathCommand | undefined;
          if (command.type === 'move') {
            return {
              anchor: [command.x, command.y],
              leftDirection: [command.x, command.y],
              rightDirection: nextCommand?.type === 'cubicBezier' ? [nextCommand.x1, nextCommand.y1] : [command.x, command.y],
            };
          } else if (command.type === 'line') {
            return {
              anchor: [command.x, command.y],
              leftDirection: [command.x, command.y],
              rightDirection: nextCommand?.type === 'cubicBezier' ? [nextCommand.x1, nextCommand.y1] : [command.x, command.y],
            };
          } else if (command.type === 'cubicBezier') {
            return {
              anchor: [command.x, command.y],
              leftDirection: [command.x2, command.y2],
              rightDirection: nextCommand?.type === 'cubicBezier' ? [nextCommand.x1, nextCommand.y1] : [command.x, command.y],
            };
          } else if (command.type === 'close') {
            open = false;
            return null;
          }
        })
        .filter((point) => point !== null) as PathPoint[];

      return { open, pathPoints };
    });
  }
  setPath(commands: PathCommand[][]) {
    const paths = PolygonSprite.getPathsFromCommands(commands);

    this.setPaths(paths);
  }
  getSprites() {
    return this.sprites;
  }
  addSprite(sprite: Sprite) {
    this.sprites.push(sprite);
  }
  serialize() {
    const children = this.sprites.map((sprite) => Spread.serializeSprite(sprite));
    const baseElement = this.serializeGeometricSprite();
    baseElement.children = [...(baseElement.children ?? []), ...children];

    return baseElement;
  }

  static parseElement(element: Element, context: IDMLSpreadPackageContext) {
    const { id, ...opts } = Sprite.parseElementOptions(element, context);

    const pathGeometry = PolygonSprite.parsePathGeometry(element);

    const sprites = Spread.getChildSprites(element, context);

    return new PolygonSprite(
      id,
      sprites,
      {
        ...opts,
        pathGeometry,
      },
      context
    );
  }
}
