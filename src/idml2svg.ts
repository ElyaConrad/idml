import { GroupSprite, IDML, ImageSprite, OvalSprite, PathCommand, PolygonSprite, RectangleSprite, Spread, Sprite, TextFrame, TransformMatrix } from './idml';
import { CornerOption, CornerOptions } from './controllers/sprites/Rectangle';
import { transform, applyToPoint, identity, Matrix, inverse } from 'transformation-matrix';
import { ParagraphOutput } from './controllers/Story';
import { FileTypeResult } from 'file-type';
import { Color } from './main';
import { Gradient } from './controllers/Gradient';
import { ColorDescriptor, GradientDescriptor } from './util/fill';
import { itemTransform2Matrix } from './util/layout';


export type BasicSurfaceStyle = {
  fill: ColorDescriptor | GradientDescriptor | null;
  stroke: ColorDescriptor | GradientDescriptor | null;
  strokeWidth: number;
  opacity: number;
};

export type RectangleElement = {
  id: string;
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  transform: Matrix;
  data?: {
    [K: string]: unknown;
  };
  style: BasicSurfaceStyle;
};
export type OvalElement = {
  id: string;
  type: 'oval';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  transform: Matrix;
  data?: {
    [K: string]: unknown;
  };
  style: BasicSurfaceStyle;
};
export type PathElement = {
  id: string;
  type: 'path';
  paths: PathCommand[][];
  transform: Matrix;
  data?: {
    [K: string]: unknown;
  };
  style: BasicSurfaceStyle;
};
export type ImageElement = {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  transform: Matrix;
  imageType?: FileTypeResult;
  contents?: ArrayBuffer;
  data?: {
    [K: string]: unknown;
  };
};
export type TextElement = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  transform: Matrix;
  paragraphs?: ParagraphOutput[];
  data?: {
    [K: string]: unknown;
  };
};
export type MaskElement = {
  id: string;
  type: 'mask';
  children: (RectangleElement | OvalElement | PathElement | ImageElement | TextElement | MaskElement | GroupElement)[];
  mask: (RectangleElement | OvalElement | PathElement | ImageElement | TextElement | MaskElement | GroupElement)[];
  transform: Matrix;
  data?: {
    [K: string]: unknown;
  };
  style: BasicSurfaceStyle;
};
export type GroupElement = {
  id: string;
  type: 'group';
  children: (RectangleElement | OvalElement | PathElement | ImageElement | TextElement | MaskElement | GroupElement)[];
  transform: Matrix;
  data?: {
    [K: string]: unknown;
  };
  style: BasicSurfaceStyle;
};
export type SVGElement = RectangleElement | OvalElement | PathElement | ImageElement | TextElement | MaskElement | GroupElement;

export type SVGDocument = {
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  elements: SVGElement[];
};

(window as any).transform = transform;
(window as any).applyToPoint = applyToPoint;
(window as any).inverse = inverse;

function colorToColorDescriptor(color: Color): ColorDescriptor {
  return { type: 'color', ...color.getRBG(), alpha: 1 };
}
function gradientToGradientDescriptor(gradient: Gradient, angle?: number): GradientDescriptor {
  if (gradient.getType() === 'linear') {
    return {
      type: 'gradient',
      gradientType: 'linear',
      angle: angle ?? gradient.getAngle() ?? 0,
      stops: gradient
        .getColorStops()
        .filter((cStop) => cStop.color)
        .map((colorStop) => {
          return {
            position: colorStop.position,
            color: colorToColorDescriptor(colorStop.color!),
          };
        }),
    };
  } else if (gradient.getType() === 'radial') {
    return {
      type: 'gradient',
      gradientType: 'radial',
      angle: gradient.getAngle() ?? 0,
      stops: gradient
        .getColorStops()
        .filter((cStop) => cStop.color)
        .map((colorStop) => {
          return {
            position: colorStop.position,
            color: colorToColorDescriptor(colorStop.color!),
          };
        }),
    };
  } else {
    throw new Error('Unsupported gradient type');
  }
}

function generateSurfaceStyle(fill: Color | Gradient | undefined, stroke: Color | Gradient | undefined, strokeWidth: number, opacity: number, gradientAngle?: number): BasicSurfaceStyle {
  return {
    fill: fill ? (fill instanceof Color ? colorToColorDescriptor(fill) : gradientToGradientDescriptor(fill, gradientAngle)) : null,
    stroke: stroke ? (stroke instanceof Color ? colorToColorDescriptor(stroke) : gradientToGradientDescriptor(stroke, gradientAngle)) : null,
    strokeWidth,
    opacity,
  };
}

// Bezier approximation constant for a quarter circle
const KAPPA = 0.5523;

function buildRectPathFromCornerOptions(x: number, y: number, w: number, h: number, corners: CornerOptions): PathCommand[][] {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners;
  const commands: PathCommand[] = [];

  function addCornerSegment(startX: number, startY: number, cornerX: number, cornerY: number, endX: number, endY: number, opt: CornerOption) {
    if (opt.radius <= 0 || opt.type === 'none') {
      if (startX !== cornerX || startY !== cornerY) {
        commands.push({ type: 'line', x: cornerX, y: cornerY });
      }
      return;
    }
    if (opt.type === 'rounded') {
      commands.push({
        type: 'cubicBezier',
        x1: startX + (cornerX - startX) * KAPPA,
        y1: startY + (cornerY - startY) * KAPPA,
        x2: endX + (cornerX - endX) * KAPPA,
        y2: endY + (cornerY - endY) * KAPPA,
        x: endX,
        y: endY,
      });
    } else if (opt.type === 'bevel') {
      commands.push({ type: 'line', x: endX, y: endY });
    } else {
      if (startX !== cornerX || startY !== cornerY) {
        commands.push({ type: 'line', x: cornerX, y: cornerY });
      }
    }
  }

  const tlR = tl.type !== 'none' ? tl.radius : 0;
  const trR = tr.type !== 'none' ? tr.radius : 0;
  const brR = br.type !== 'none' ? br.radius : 0;
  const blR = bl.type !== 'none' ? bl.radius : 0;

  commands.push({ type: 'move', x: x + tlR, y });
  commands.push({ type: 'line', x: x + w - trR, y });
  addCornerSegment(x + w - trR, y,   x + w, y,     x + w, y + trR,   tr);
  commands.push({ type: 'line', x: x + w, y: y + h - brR });
  addCornerSegment(x + w, y + h - brR, x + w, y + h, x + w - brR, y + h, br);
  commands.push({ type: 'line', x: x + blR, y: y + h });
  addCornerSegment(x + blR, y + h, x, y + h,   x, y + h - blR, bl);
  commands.push({ type: 'line', x, y: y + tlR });
  addCornerSegment(x, y + tlR,   x, y,       x + tlR, y,       tl);
  commands.push({ type: 'close' });

  return [commands];
}

async function resolveSprite(sprite: Sprite, pageMatrix: Matrix): Promise<SVGElement> {
  // The transform of a sprite is originated in the coordinate system of its parent page (at 0,0) so we have to inverse the page matrix first, then apply the sprite transform, then re-apply the page matrix to get the correct world transform
  const bakedTransform = transform(inverse(pageMatrix), itemTransform2Matrix(sprite.itemTransform), pageMatrix);
  if (sprite.type === 'Rectangle') {
    const rectangleSprite = sprite as RectangleSprite;
    const bbox = rectangleSprite.getBBox();
    const fill = rectangleSprite.getEffectiveFill();
    const stroke = rectangleSprite.getEffectiveStroke();
    const strokeWeight = rectangleSprite.getEffectiveStrokeWeight();
    const opacity = rectangleSprite.getOpacity();

    if (rectangleSprite.getId() === 'u16e') {
      console.log('[u16e]', fill, stroke, strokeWeight)
    }

    const style = generateSurfaceStyle(fill, stroke, strokeWeight, opacity);

    // Determine effective paths: baked bezier curves take priority, then live corner options
    const bakedPaths = rectangleSprite.getPath();
    const hasBakedCurves = bakedPaths.some((cmds) => cmds.some((cmd) => cmd.type === 'cubicBezier'));
    const cornerOptions = rectangleSprite.getCornerOptions();
    const hasLiveCorners = !hasBakedCurves && cornerOptions !== undefined &&
      Object.values(cornerOptions).some((c) => c.type !== 'none' && c.radius > 0);

    const effectivePaths = hasBakedCurves
      ? bakedPaths
      : hasLiveCorners
        ? buildRectPathFromCornerOptions(bbox.x, bbox.y, bbox.width, bbox.height, cornerOptions!)
        : null;

    if (rectangleSprite.getId() === 'u16e') {
      console.log('[u16e]', style)
    }

    // This is the mask case in which a sprite has children
    if (rectangleSprite.getSprites().length > 0) {
      const subSprites = rectangleSprite.getSprites();
      const maskShapeTransform = transform(inverse(pageMatrix), identity(), pageMatrix);
      const maskShape = effectivePaths
        ? ({
            type: 'path',
            paths: effectivePaths,
            transform: maskShapeTransform,
            style: { fill: { type: 'color', red: 0, green: 0, blue: 0, alpha: 1 }, stroke: null, strokeWidth: 0, opacity: 100 },
          } as PathElement)
        : ({
            type: 'rectangle',
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            transform: maskShapeTransform,
            style: { fill: { type: 'color', red: 0, green: 0, blue: 0, alpha: 1 }, stroke: null, strokeWidth: 0, opacity: 100 },
          } as RectangleElement);
      const maskElement: MaskElement = {
        id: rectangleSprite.getId(),
        type: 'mask',
        children: await Promise.all(subSprites.map((child) => resolveSprite(child, pageMatrix))),
        mask: [maskShape],
        transform: bakedTransform,
        style,
      };
      return maskElement;
    } else if (effectivePaths) {
      return {
        id: rectangleSprite.getId(),
        type: 'path',
        paths: effectivePaths,
        transform: bakedTransform,
        style,
      };
    } else {
      return {
        id: rectangleSprite.getId(),
        type: 'rectangle',
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        transform: bakedTransform,
        style,
      };
    }
  } else if (sprite.type === 'Image') {
    const imageSprite = sprite as ImageSprite;

    const bbox = imageSprite.getBBox();
    if (!bbox) {
      throw new Error('Image sprite has no bounding box');
    }

    console.log('IMAGE', imageSprite);

    return {
      id: imageSprite.getId(),
      type: 'image',
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      transform: bakedTransform,
      imageType: await (async () => {
        try {
          return await imageSprite.getImageType();
        } catch (e) {
          return undefined;
        }
      })(),
      contents: await (async () => {
        try {
          // Vector placed graphics (PDF/EPS/WMF) have no usable raster → undefined
          // makes SVGElement fall back to the gray placeholder.
          return imageSprite.getRasterContents();
        } catch (e) {
          return undefined;
        }
      })(),
    };
  } else if (sprite.type === 'TextFrame') {
    const textFrameSprite = sprite as TextFrame;
    const bbox = textFrameSprite.getBBox();

    const fill = textFrameSprite.getEffectiveFill();
    const stroke = textFrameSprite.getEffectiveStroke();
    const strokeWeight = textFrameSprite.getEffectiveStrokeWeight();
    const opacity = textFrameSprite.getOpacity();

    const hasBackgroundRect = Boolean(fill || stroke);

    const paragraphs = textFrameSprite
      .getStory()
      ?.getParagraphs()
      .map((p) => {
        return {
          ...p,
          appliedParagraphStyle: {
            ...p.appliedParagraphStyle,
            fillColor: textFrameSprite.getDefaultFillColor()?.toColorInput(),
          },
        };
      });

    if (hasBackgroundRect) {
      const style = generateSurfaceStyle(fill, stroke, strokeWeight, opacity);

      return {
        id: textFrameSprite.getId(),
        type: 'group',
        transform: bakedTransform,
        children: [
          {
            id: `${textFrameSprite.getId()}::background`,
            type: 'rectangle',
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            transform: transform(inverse(pageMatrix), identity(), pageMatrix),
            style,
          },
          {
            id: `${textFrameSprite.getId()}::text`,
            type: 'text',
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            transform: transform(inverse(pageMatrix), identity(), pageMatrix),
            paragraphs,
          },
        ],
        style: {
          fill: null,
          stroke: null,
          strokeWidth: 0,
          opacity: 100,
        },
      };
    } else {
      return {
        id: textFrameSprite.getId(),
        type: 'text',
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        transform: bakedTransform,
        paragraphs,
      };
    }
  } else if (sprite.type === 'Group') {
    const groupSprite = sprite as GroupSprite;

    const fill = groupSprite.getEffectiveFill();
    const stroke = groupSprite.getEffectiveStroke();
    const strokeWeight = groupSprite.getEffectiveStrokeWeight();
    const opacity = groupSprite.getOpacity();

    const style = generateSurfaceStyle(fill, stroke, strokeWeight, opacity);

    return {
      id: groupSprite.getId(),
      type: 'group',
      children: await Promise.all(groupSprite.getSprites().map((child) => resolveSprite(child, pageMatrix))),
      transform: bakedTransform,
      style,
    };
  } else if (sprite.type === 'Oval') {
    const ovalSprite = sprite as OvalSprite;
    const ellipse = ovalSprite.getEllipse();
    const subSprites = ovalSprite.getSprites();

    const fill = ovalSprite.getEffectiveFill();
    const stroke = ovalSprite.getEffectiveStroke();
    const strokeWeight = ovalSprite.getEffectiveStrokeWeight();
    const opacity = ovalSprite.getOpacity();

    const style = generateSurfaceStyle(fill, stroke, strokeWeight, opacity);

    if (subSprites.length > 0) {
      const maskElement: MaskElement = {
        type: 'mask',
        id: ovalSprite.getId(),
        children: await Promise.all(subSprites.map((child) => resolveSprite(child, pageMatrix))),
        mask: [
          {
            id: `${ovalSprite.getId()}::mask`,
            type: 'oval',
            x: ellipse.x,
            y: ellipse.y,
            radiusX: ellipse.radiusX,
            radiusY: ellipse.radiusY,
            transform: transform(inverse(pageMatrix), identity(), pageMatrix),
            style: {
              fill: { type: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
              stroke: null,
              strokeWidth: 0,
              opacity: 100,
            },
          },
        ],
        transform: bakedTransform,
        style,
      };
      return maskElement;
    } else {
      return {
        id: ovalSprite.getId(),
        type: 'oval',
        x: ellipse.x,
        y: ellipse.y,
        radiusX: ellipse.radiusX,
        radiusY: ellipse.radiusY,
        transform: bakedTransform,
        style,
      };
    }
  } else if (sprite.type === 'Polygon') {
    const polygonSprite = sprite as PolygonSprite;

    const paths = polygonSprite.getPath();
    const subSprites = polygonSprite.getSprites();
    const fill = polygonSprite.getEffectiveFill();
    const gradientAngle = polygonSprite.getGradientFillAngle();
    const stroke = polygonSprite.getEffectiveStroke();
    const strokeWeight = polygonSprite.getEffectiveStrokeWeight();
    const opacity = polygonSprite.getOpacity();

    const style = generateSurfaceStyle(fill, stroke, strokeWeight, opacity, gradientAngle);
    // console.log('POLYGON', polygonSprite, style, gradientAngle);
    
    if (subSprites.length > 0) {
      const maskElement: MaskElement = {
        type: 'mask',
        id: polygonSprite.getId(),
        children: await Promise.all(subSprites.map((child) => resolveSprite(child, pageMatrix))),
        mask: [
          {
            type: 'path',
            id: `${polygonSprite.getId()}::mask`,
            paths: paths,
            transform: transform(inverse(pageMatrix), identity(), pageMatrix),
            style: {
              fill: { type: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
              stroke: null,
              strokeWidth: 0,
              opacity: 100,
            },
          },
        ],
        transform: bakedTransform,
        style,
      };
      return maskElement;
    } else {
      return {
        id: polygonSprite.getId(),
        type: 'path',
        paths: paths,
        transform: bakedTransform,
        style,
      };
    }
  } else {
    throw new Error(`Unsupported sprite type: ${sprite.type}`);
  }
}

export type SpreadDocument = {
  viewBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  id: string;
  pages: GroupElement[];
};

async function collectSpread(spread: Spread): Promise<SpreadDocument> {
  console.log('Converting spread to SVG document:', spread);

  // const spreadMatrix = itemTransform2Matrix(spread.itemTransform);

  const pages: GroupElement[] = spread.pages.map((page) => {
    return {
      id: page.id,
      type: 'group',
      transform: itemTransform2Matrix(page.itemTransform),
      children: [],
      data: {
        'page-id': page.id,
        'page-name': page.name,
      },
      style: {
        fill: null,
        stroke: null,
        strokeWidth: 0,
        opacity: 100,
      },
    };
  });

  const pageBBoxes = spread.pages.map((page) => {
    return [
      {
        x: page.geometricBounds.x,
        y: page.geometricBounds.y,
      },
      {
        x: page.geometricBounds.x + page.geometricBounds.width,
        y: page.geometricBounds.y,
      },
      {
        x: page.geometricBounds.x + page.geometricBounds.width,
        y: page.geometricBounds.y + page.geometricBounds.height,
      },
      {
        x: page.geometricBounds.x,
        y: page.geometricBounds.y + page.geometricBounds.height,
      },
    ].map((p) => applyToPoint(itemTransform2Matrix(page.itemTransform), p));
  });
  const combinedBBoxPoints = pageBBoxes.flat();
  const xValues = combinedBBoxPoints.map((p) => p.x);
  const yValues = combinedBBoxPoints.map((p) => p.y);
  const viewBox = {
    x: Math.min(...xValues),
    y: Math.min(...yValues),
    width: Math.max(...xValues) - Math.min(...xValues),
    height: Math.max(...yValues) - Math.min(...yValues),
  };

  for (const sprite of spread.getSprites()) {
    const parentPage = sprite.getParentPage();
    const parentPageMatrix = itemTransform2Matrix(parentPage?.itemTransform);
    const pageIndex = spread.pages.findIndex((p) => p.id === parentPage.id);
    const spriteElement = await resolveSprite(sprite, parentPageMatrix);
    pages[pageIndex].children.push(spriteElement);
  }

  return {
    viewBox: viewBox,
    id: spread.id,
    pages,
  };
}

export async function convertIDML2SVG(idml: IDML) {
  console.log(idml.spreadPackages.length);

  const allSpreads = await Promise.all(
    idml.spreadPackages.map(async (spreadPackage) => {
      const spread = spreadPackage.getSpread();
      return collectSpread(spread);
    }),
  );

  return allSpreads;
}
