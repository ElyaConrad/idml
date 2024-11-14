import { cleanupBluepicSVG, createInlineStyle, ensureNumber, getElementClipPath, getElementStyle, getElementTransformationMatrix, getTransformationsInOrder, simplifySVG } from 'flat-svg';
import { getAllVisibleElements } from './getAllVisibleElements';
import { cropToVisibleBBox, getVisibleBBox, renderSVG } from '@/renderSVG';
import { createIDML, PolygonSprite, RectangleSprite, Spread, Sprite, type ColorInput, type PathCommand, type TransformMatrix, normalizeTransformMatrixForGivenOrigin } from 'idml';
import SVGPathCommander, { type PathSegment } from 'svg-path-commander';
import { getMinimalPathSegments } from './path';
import type { SpriteWithChildren } from '../../../dist/esm/controllers/sprites/Sprite';
import Color from 'color';

(window as any).SVGPathCommander = SVGPathCommander;
(window as any).normalizeTransformMatrixForGivenOrigin = normalizeTransformMatrixForGivenOrigin;

function extractPathsFromDString(d: string) {
  const path = new SVGPathCommander(d).toAbsolute();

  return path.segments
    .reduce((acc, segment) => {
      if (acc.length === 0) {
        return [[segment]];
      } else {
        const lastPath = acc[acc.length - 1];
        const lastSegment = lastPath[lastPath.length - 1];
        if (lastSegment[0] === 'Z') {
          return [...acc, [segment]];
        } else {
          return [...acc.slice(0, acc.length - 1), [...lastPath, segment]];
        }
      }
    }, [] as PathSegment[][])
    .map((path) => {
      const d = path.map((segment) => segment.join(' ')).join(' ');
      return new SVGPathCommander(d).toAbsolute();
    });
}

function getPathCommandsFromPath(path: SVGPathCommander) {
  return getMinimalPathSegments(path).map<PathCommand>((segment) => {
    if (segment.type === 'move') {
      return { type: 'move', x: segment.x, y: segment.y };
    } else if (segment.type === 'line') {
      return { type: 'line', x: segment.x, y: segment.y };
    } else if (segment.type === 'cubic-bezier') {
      return { type: 'cubicBezier', x1: segment.c1x, y1: segment.c1y, x2: segment.c2x, y2: segment.c2y, x: segment.x, y: segment.y };
    } else if (segment.type === 'close') {
      return { type: 'close' };
    } else {
      throw new Error('Unknown segment type');
    }
  });
}
function extractElementIDMLStyle(element: Element) {
  const style = getElementStyle(element);
  const opacity = ensureNumber(style.opacity) ?? ensureNumber(element.getAttribute('opacity') ?? undefined) ?? 1;
  const fill = Color(style.fill ?? element.getAttribute('fill') ?? '#000000')
    .rgb()
    .object();
  const stroke = Color(style.stroke ?? element.getAttribute('stroke') ?? '#000000')
    .rgb()
    .object();
  const strokeWeight = ensureNumber(style.strokeWeight) ?? ensureNumber(element.getAttribute('stroke-weight') ?? element.getAttribute('strokeWeight') ?? undefined) ?? 0;

  return {
    fill: { type: 'rgb', red: fill.r, green: fill.g, blue: fill.b } as ColorInput,
    stroke: { type: 'rgb', red: stroke.r, green: stroke.g, blue: stroke.b } as ColorInput,
    strokeWeight: strokeWeight,
    opacity: opacity * (fill.alpha ?? 1) * 100,
  };
}

function createIDMLSprite(element: SVGElement, document: Document, spread: Spread, parentSprite?: SpriteWithChildren) {
  const matrix = getElementTransformationMatrix(element);
  const baseMatrix = [matrix._a, matrix._b, matrix._c, matrix._d, matrix._tx, matrix._ty];
  const normalizedMatrix = normalizeTransformMatrixForGivenOrigin([matrix._a, matrix._b, matrix._c, matrix._d, matrix._tx, matrix._ty], [0, 0], spread.pageRelatedTransformOrigin);

  console.log('!', normalizedMatrix);

  let wrappingPath: PolygonSprite | RectangleSprite;
  const clipPath = getElementClipPath(element);
  if (clipPath) {
    const clipPathElement = document.getElementById(clipPath.slice(1));
    if (clipPathElement) {
      const singlePathElement = clipPathElement.querySelector('path');
      const d = singlePathElement?.getAttribute('d');
      if (d) {
        wrappingPath = spread.createPolygon(
          {
            paths: extractPathsFromDString(d).map(getPathCommandsFromPath),
            fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
          },
          undefined
        );
      }
    }
  }
  // Sadly, IDML cannot display images without a wrapping element
  else if (element.nodeName === 'image') {
    const x = ensureNumber(element.getAttribute('x') ?? undefined) ?? 0;
    const y = ensureNumber(element.getAttribute('y') ?? undefined) ?? 0;
    const width = ensureNumber(element.getAttribute('width') ?? undefined) ?? 0;
    const height = ensureNumber(element.getAttribute('height') ?? undefined) ?? 0;
    const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);
    wrappingPath = spread.createRectangle(
      {
        x,
        y,
        width,
        height,
        opacity,
        fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
      },
      undefined
    );
  }
  if (element.nodeName === 'rect') {
    const x = ensureNumber(element.getAttribute('x') ?? undefined) ?? 0;
    const y = ensureNumber(element.getAttribute('y') ?? undefined) ?? 0;
    const width = ensureNumber(element.getAttribute('width') ?? undefined) ?? 0;
    const height = ensureNumber(element.getAttribute('height') ?? undefined) ?? 0;
    const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);
    spread.createRectangle({
      x,
      y,
      width,
      height,
      fill,
      opacity,
      stroke,
      strokeWeight,
    });
  } else if (element.nodeName === 'path') {
    const d = element.getAttribute('d');
    if (!d) {
      return console.error('Path without a d element is a sad thing :(');
    }
    const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);
    console.log(fill, opacity, stroke, strokeWeight);

    const newPolygon = spread.createPolygon(
      {
        paths: extractPathsFromDString(d).map(getPathCommandsFromPath),
        fill,
        stroke,
        opacity,
        strokeWeight,
      },
      undefined
    );
    newPolygon.setTranform({ translateX: -394.35903414551353, translateY: 294.6213511838755, scaleX: 1, scaleY: 1, rotate: (-25 * Math.PI) / 180 }, [0, 0]);
    console.log('newPolygon', newPolygon);
  } else if (element.nodeName === 'ellipse') {
    const x = ensureNumber(element.getAttribute('cx') ?? undefined) ?? 0;
    const y = ensureNumber(element.getAttribute('cy') ?? undefined) ?? 0;
    const radiusX = ensureNumber(element.getAttribute('rx') ?? undefined) ?? 0;
    const radiusY = ensureNumber(element.getAttribute('ry') ?? undefined) ?? 0;
    const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);

    spread.createOval({
      x,
      y,
      radiusX,
      radiusY,
      fill,
      stroke,
      opacity,
      strokeWeight,
    });
  } else if (element.nodeName === 'circle') {
    const x = ensureNumber(element.getAttribute('cx') ?? undefined) ?? 0;
    const y = ensureNumber(element.getAttribute('cy') ?? undefined) ?? 0;
    const radius = ensureNumber(element.getAttribute('r') ?? undefined) ?? 0;
    const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);

    spread.createOval({
      x,
      y,
      radiusX: radius,
      radiusY: radius,
      fill,
      stroke,
      opacity,
      strokeWeight,
    });
  } else if (element.nodeName === 'text') {
    console.log('TEXT!!!!');
  }
}

export async function svg2idml(doc: Document) {
  cleanupBluepicSVG(doc, (document) => getAllVisibleElements(document).filter((el) => getAllVisibleElements(el).length > 1));

  const simlifiedSVGDocument = await simplifySVG(doc, {
    keepGroupTransforms: false,
    rasterizeAllMasks: true,
    vectorizeAllTexts: false,
    async rasterize(svg) {
      const ab = await renderSVG(svg);
      const visibleBBox = await getVisibleBBox(ab);
      if (!visibleBBox) {
        console.error('Failed to get visible bbox');
        return undefined;
      }
      return {
        left: visibleBBox?.left,
        top: visibleBBox?.top,
        width: visibleBBox?.width,
        height: visibleBBox?.height,
        buffer: await cropToVisibleBBox(ab, visibleBBox),
      };
    },
    async applyColorMatrix(data, matrix) {
      // Nothing to do since canvas API renders SVG with filters already
      return data;
    },
  });

  console.log('Simplified SVG:', simlifiedSVGDocument);
  const viewBoxRaw = simlifiedSVGDocument.documentElement.getAttribute('viewBox') ?? '0 0 100 100';
  const viewBox = viewBoxRaw.split(' ').map(Number);

  const idml = await createIDML({
    pageGeometricBounds: { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] },
  });

  console.log('IDML', idml);

  (window as any).idml = idml;

  const spread = idml.getSpreads()[0];

  const rect = spread.createRectangle({
    x: 20,
    y: 20,
    width: 120,
    height: 80,
    fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
  });

  const topChilds = (simlifiedSVGDocument.querySelector('svg')?.children ?? []) as SVGElement[];
  for (const element of topChilds) {
    createIDMLSprite(element, simlifiedSVGDocument, spread, undefined);
  }

  return {
    idml,
    simlifiedSVGDocument,
  };
}
