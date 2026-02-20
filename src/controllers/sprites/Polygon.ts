import { Spread } from '../Spread.js';
import { IDMLSpreadPackageContext } from '../SpreadPackage.js';
import { GeometricSprite, GeometricSpriteOpts, PathCommand, PathCommandCubicBezier, PathCommandLine, PathCommandMove, PathCommandClose, PathPoint } from './GeometricSprite.js';
import { Sprite } from './Sprite.js';

export type { PathCommandMove, PathCommandLine, PathCommandCubicBezier, PathCommandClose, PathCommand };

export class PolygonSprite extends GeometricSprite {
  constructor(id: string, private sprites: Sprite[], opts: GeometricSpriteOpts, context: IDMLSpreadPackageContext) {
    super(id, 'Polygon', opts, context);
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
  static pathsToSVGDAttribute(commands: PathCommand[][]): string {
    return commands
      .map((commandSet) => {
        return commandSet
          .map((command) => {
            switch (command.type) {
              case 'move':
                return `M ${command.x} ${command.y}`;
              case 'line':
                return `L ${command.x} ${command.y}`;
              case 'cubicBezier':
                return `C ${command.x1} ${command.y1}, ${command.x2} ${command.y2}, ${command.x} ${command.y}`;
              case 'close':
                return 'Z';
            }
          })
          .join(' ');
      })
      .join(' ');
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
