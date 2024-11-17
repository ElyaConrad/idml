import { ApplyColorMatrixFunction, cleanupBluepicSVG, combineBBoxes, createInlineStyle, ensureCSSValue, ensureNumber, getElementClipPath, getElementStyle, getElementTransformationMatrix, getFont, getFontFile, getTransformationsInOrder, RasterizeFunction, renderTextSpans, resolveFontFile, simplifySVG, textToSpans } from 'flat-svg';
import { createIDML, PolygonSprite, RectangleSprite, Spread, Sprite, type ColorInput, type PathCommand, type TransformMatrix, normalizeTransformMatrixForGivenOrigin, extractFontTable, GroupSprite } from './idml.js';
import SVGPathCommander, { type PathSegment } from 'svg-path-commander';
import { getMinimalPathSegments } from './util/path.js';
import type { SpriteWithChildren } from './controllers/sprites/Sprite.js';
import Color from 'color';
import type { ParagraphInput } from './controllers/Story.js';

export function getAllVisibleElements(elOrDoc: Element | Document) {
  return Array.from(elOrDoc.querySelectorAll('.element')).filter((el) => el.closest('defs') === null);
}

export function extractPathsFromDString(d: string) {
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

  const fill = (() => {
    const fillColorRaw = style.fill ?? element.getAttribute('fill') ?? '#000000';
    try {
      return Color(fillColorRaw).rgb().object();
    } catch (e) {
      return { r: 0, g: 0, b: 0 };
    }
  })();
  const stroke = (() => {
    const strokeColorRaw = style.stroke ?? element.getAttribute('stroke') ?? '#000000';
    try {
      return Color(strokeColorRaw).rgb().object();
    } catch (e) {
      return { r: 0, g: 0, b: 0 };
    }
  })();
  const strokeWeight = ensureNumber(style.strokeWeight) ?? ensureNumber(element.getAttribute('stroke-weight') ?? element.getAttribute('strokeWeight') ?? undefined) ?? 0;

  return {
    fill: { type: 'rgb', red: fill.r, green: fill.g, blue: fill.b } as ColorInput,
    stroke: { type: 'rgb', red: stroke.r, green: stroke.g, blue: stroke.b } as ColorInput,
    strokeWeight: strokeWeight,
    opacity: opacity * (fill.alpha ?? 1) * 100,
  };
}

export function scaleBBox(bbox: { x: number; y: number; width: number; height: number }, scale: number) {
  return {
    x: bbox.x * scale,
    y: bbox.y * scale,
    width: bbox.width * scale,
    height: bbox.height * scale,
  };
}
export function scaleFontBBox(bbox: { minX: number; minY: number; maxX: number; maxY: number }, scale: number) {
  return {
    minX: bbox.minX * scale,
    minY: bbox.minY * scale,
    maxX: bbox.maxX * scale,
    maxY: bbox.maxY * scale,
  };
}

export async function svg2idml(
  doc: Document,
  rasterize: RasterizeFunction,
  applyColorMatrix: ApplyColorMatrixFunction,
  opts: {
    vectorizeAllTexts: boolean;
    keepGroupTransforms: boolean;
  }
) {
  cleanupBluepicSVG(doc, (document) => getAllVisibleElements(document).filter((el) => getAllVisibleElements(el).length > 1));

  const simlifiedSVGDocument = await simplifySVG(doc, {
    keepGroupTransforms: opts.keepGroupTransforms,
    rasterizeAllMasks: true,
    vectorizeAllTexts: opts.vectorizeAllTexts,
    rasterize,
    applyColorMatrix,
  });

  // console.log('Simplified SVG:', simlifiedSVGDocument);
  const viewBoxRaw = simlifiedSVGDocument.documentElement.getAttribute('viewBox') ?? '0 0 100 100';
  const viewBox = viewBoxRaw.split(' ').map(Number);

  const idml = await createIDML({
    pageGeometricBounds: { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] },
  });

  const spread = idml.getSpreads()[0];

  const collectedFonts: { fullName: string; data: ArrayBuffer }[] = [];

  //   const rect = spread.createRectangle({
  //     x: 20,
  //     y: 20,
  //     width: 120,
  //     height: 80,
  //     fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
  //   });

  //   rect.setTranform({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: Math.PI / 2 }, [20 + 120 / 2, 20 + 80 / 2]);
  async function createIDMLSprite(element: SVGElement, document: Document, spread: Spread, parentSprite?: SpriteWithChildren) {
    const stylesheet = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');

    const matrix = getElementTransformationMatrix(element);
    const baseMatrix: TransformMatrix = [matrix._a, matrix._b, matrix._c, matrix._d, matrix._tx, matrix._ty];
    const normalizedMatrix = normalizeTransformMatrixForGivenOrigin(baseMatrix, [0, 0], spread.pageRelatedTransformOrigin);

    let sprite: Sprite | undefined = undefined;
    let wrappingSprite: PolygonSprite | RectangleSprite | undefined = undefined;
    const clipPath = getElementClipPath(element);
    //   console.log(element);

    if (clipPath) {
      const clipPathElement = document.getElementById(clipPath.slice(1));
      // console.log('CLIP PATH', clipPath, clipPathElement);

      if (clipPathElement) {
        const singlePathElement = clipPathElement.querySelector('path');
        const d = singlePathElement?.getAttribute('d');
        if (d) {
          wrappingSprite = spread.createPolygon(
            {
              paths: extractPathsFromDString(d).map(getPathCommandsFromPath),
              //fill: { type: 'rgb', red: 255, green: 0, blue: 0 },
            },
            parentSprite
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

      wrappingSprite = spread.createRectangle(
        {
          x,
          y,
          width,
          height,
          opacity,
          //fill: { type: 'rgb', red: 0, green: 0, blue: 0 },
        },
        parentSprite
      );
    }
    // Ok, create the element
    if (element.nodeName === 'g') {
      sprite = spread.createGroup({}, parentSprite instanceof GroupSprite ? parentSprite : undefined);
      const children = Array.from(element.children) as SVGElement[];
      for (const child of children) {
        await createIDMLSprite(child, document, spread, sprite as GroupSprite);
      }
    } else if (element.nodeName === 'rect') {
      const x = ensureNumber(element.getAttribute('x') ?? undefined) ?? 0;
      const y = ensureNumber(element.getAttribute('y') ?? undefined) ?? 0;
      const width = ensureNumber(element.getAttribute('width') ?? undefined) ?? 0;
      const height = ensureNumber(element.getAttribute('height') ?? undefined) ?? 0;
      const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);

      sprite = spread.createRectangle(
        {
          x,
          y,
          width,
          height,
          fill,
          opacity,
          stroke,
          strokeWeight,
        },
        wrappingSprite ?? parentSprite
      );
    } else if (element.nodeName === 'image') {
      const x = ensureNumber(element.getAttribute('x') ?? undefined) ?? 0;
      const y = ensureNumber(element.getAttribute('y') ?? undefined) ?? 0;
      const width = ensureNumber(element.getAttribute('width') ?? undefined) ?? 0;
      const height = ensureNumber(element.getAttribute('height') ?? undefined) ?? 0;
      // const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);

      const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
      const data = href ? await fetch(href).then((res) => res.arrayBuffer()) : undefined;

      if (!data) {
        sprite = spread.createRectangle(
          {
            x,
            y,
            width,
            height,
            fill: { type: 'rgb', red: 0, green: 0, blue: 0 },
          },
          wrappingSprite ?? parentSprite
        );
      } else {
        sprite = spread.createImage(
          {
            x,
            y,
            width,
            height,
            data,
          },
          wrappingSprite ?? parentSprite
        );
      }
    } else if (element.nodeName === 'path') {
      const d = element.getAttribute('d');
      if (!d) {
        return console.error('Path without a d element is a sad thing :(');
      }
      const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);
      sprite = sprite = spread.createPolygon(
        {
          paths: extractPathsFromDString(d).map(getPathCommandsFromPath),
          fill,
          stroke,
          opacity,
          strokeWeight,
        },
        wrappingSprite ?? parentSprite
      );
    } else if (element.nodeName === 'ellipse') {
      const x = ensureNumber(element.getAttribute('cx') ?? undefined) ?? 0;
      const y = ensureNumber(element.getAttribute('cy') ?? undefined) ?? 0;
      const radiusX = ensureNumber(element.getAttribute('rx') ?? undefined) ?? 0;
      const radiusY = ensureNumber(element.getAttribute('ry') ?? undefined) ?? 0;
      const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);

      sprite = spread.createOval(
        {
          x,
          y,
          radiusX,
          radiusY,
          fill,
          stroke,
          opacity,
          strokeWeight,
        },
        wrappingSprite ?? parentSprite
      );
    } else if (element.nodeName === 'circle') {
      const x = ensureNumber(element.getAttribute('cx') ?? undefined) ?? 0;
      const y = ensureNumber(element.getAttribute('cy') ?? undefined) ?? 0;
      const radius = ensureNumber(element.getAttribute('r') ?? undefined) ?? 0;
      const { fill, opacity, stroke, strokeWeight } = extractElementIDMLStyle(element);

      sprite = spread.createOval(
        {
          x,
          y,
          radiusX: radius,
          radiusY: radius,
          fill,
          stroke,
          opacity,
          strokeWeight,
        },
        wrappingSprite ?? parentSprite
      );
    } else if (element.nodeName === 'text') {
      const { spans, x: baseX, y: baseY } = textToSpans(element as SVGTextElement);
      const paths = await renderTextSpans(stylesheet, spans, baseX, baseY);
      const maxAscent = Math.max(
        ...paths.map(({ ascent, unitsPerEm }, i) => {
          const scale = spans[i].format.fontSize / unitsPerEm;
          return ascent * scale;
        })
      );
      const maxDescent = Math.max(
        ...paths.map(({ descent, unitsPerEm }, i) => {
          const scale = spans[i].format.fontSize / unitsPerEm;
          return descent * scale;
        })
      );
      const maxFontBBoxHeight = Math.max(
        ...paths.map(({ fontBBox, unitsPerEm }, i) => {
          const scale = spans[i].format.fontSize / unitsPerEm;
          return fontBBox.height * scale;
        })
      );

      const fontHeight = maxAscent - maxDescent;
      const totalBBox = combineBBoxes(paths.map((p) => p.bbox));
      const paragraphs: ParagraphInput[] = [
        {
          paragraphStyle: {},
          features: await Promise.all(
            spans.map(async ({ format, text, tspan }, index) => {
              const orgEl = (tspan ?? element) as SVGTextElement | SVGTSpanElement;
              const style = getElementStyle(orgEl);
              const { fill, stroke, opacity, strokeWeight } = extractElementIDMLStyle(orgEl);
              const letterSpacingRaw = style.letterSpacing ?? element.getAttribute('letter-spacing') ?? element.getAttribute('letterSpacing') ?? '0px';
              const letterSpacing = ensureCSSValue(letterSpacingRaw) ?? 0;
              const lineHeightSVG = ensureNumber(style.lineHeight) ?? ensureNumber(element.getAttribute('line-height') ?? element.getAttribute('lineHeight') ?? undefined) ?? 0;

              const fontSrc = getFontFile(stylesheet, format.fontFamily, format.fontWeight, format.fontStyle);
              const fontFile = await resolveFontFile(fontSrc);
              const fontTable = extractFontTable(fontFile.buffer);
              console.log('TEXT', text);

              console.log('FONT TABLE', fontTable);

              collectedFonts.push({ fullName: fontTable.fullName, data: fontFile.buffer });

              return {
                characterStyle: {
                  appliedFont: fontTable.fullName,
                  fontSize: format.fontSize,
                  // fontStyle: format.fontStyle,
                  fillColor: fill,
                  strokeColor: strokeWeight > 0 ? stroke : undefined,
                  strokeWeight,
                  tracking: 30 + letterSpacing,
                },
                content: text,
              };
            })
          ),
        },
      ];
      // for (const spanPaths of paths) {
      //   for (const glyphPath of spanPaths.paths) {
      //     const subPaths = extractPathsFromDString(glyphPath.toString());
      //     const glyphSprite = spread.createPolygon(
      //       {
      //         paths: subPaths.map(getPathCommandsFromPath),
      //         fill: { type: 'rgb', red: 0, green: 255, blue: 0 },
      //         opacity: 50,
      //       },
      //       wrappingSprite ?? parentSprite
      //     );
      //   }
      // }
      //const height = totalBBox.height + Math.abs(descentRel);
      sprite = spread.createTextFrame(
        {
          x: baseX,
          y: baseY - maxAscent,
          width: totalBBox.width * 1.1,
          height: maxFontBBoxHeight,
          opacity: 100,
          paragraphs,
          // paragraphs: [
          //   {
          //     paragraphStyle: {},
          //     features: [
          //       {
          //         characterStyle: {
          //           appliedFont: 'Montserrat',
          //           fontStyle: 'Black',
          //           fontSize: maxFontSize,
          //         },
          //         content: 'foo',
          //       },
          //     ],
          //   },
          // ],
        },
        wrappingSprite ?? parentSprite
      );
    }

    if (sprite) {
      if (wrappingSprite) {
        wrappingSprite.setTransformFromMatrix(normalizedMatrix);
      } else {
        sprite.setTransformFromMatrix(normalizedMatrix);
      }
    }
  }

  const topChilds = (simlifiedSVGDocument.querySelector('svg')?.children ?? []) as SVGElement[];
  for (const element of topChilds) {
    await createIDMLSprite(element, simlifiedSVGDocument, spread, undefined);
  }

  return {
    idml,
    simlifiedSVGDocument,
    collectedFonts,
  };
}
