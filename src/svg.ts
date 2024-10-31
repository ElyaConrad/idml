// import SVGPathCommander, { ShapeTypes, TransformObject } from 'svg-path-commander';
import paper from 'paper';
import xmlFormat from 'xml-formatter';
import { createInlineStyle, getElementClipPath, getTransformationsInOrder, getTransformOrigin } from './util/css.js';
import { SVGTransformOrigin } from './util/transform.js';
import { ElementNode, makeElementNode, stringifyNode } from './util/xml.js';
import { transform } from 'lodash';
import { getUniqueID } from './helpers.js';

export type SVGShapeOrGroup = SVGRectElement | SVGCircleElement | SVGEllipseElement | SVGPolygonElement | SVGPolylineElement | SVGLineElement | SVGGElement | SVGPathElement;

paper.setup(new paper.Size(1080, 1080));

type AttrFunctions<T> = {
  [K in keyof T]: (element: SVGElement) => T[K];
};

function getAttrs<T>(element: SVGElement, attrMap: AttrFunctions<T>): T {
  return Object.fromEntries(
    (Object.entries(attrMap) as any as [string, (value: string | null) => T[keyof T]][]).map(([keyBy, fn]) => {
      return [keyBy, fn(element.getAttribute(keyBy))];
    })
  ) as any as T;
}

function getShapeElementsAndGroupsAndPaths(elements: HTMLCollection | Element[]): SVGShapeOrGroup[] {
  return Array.from(elements).filter((element) => {
    return element.nodeName === 'circle' || element.nodeName === 'rect' || element.nodeName === 'polygon' || element.nodeName === 'polyline' || element.nodeName === 'ellipse' || element.nodeName === 'g' || element.nodeName === 'path';
  }) as SVGShapeOrGroup[];
}

// function applyTransformsInOrder(path: SVGPathCommander, transforms: Partial<TransformObject>[]) {
//   return transforms.reduce((path, transform) => {
//     return path.transform(transform);
//   }, path);
// }

// export function shapeToPaths(element: ShapeTypes | SVGPathElement | SVGGElement, document: Document): SVGPathCommander[] {
//   const transformOrigin = getTransformOrigin(element);
//   // Idk but we need to reverse the order of the transforms to get the correct result
//   const transforms = getTransformationsInOrder(element)
//     .map((transform) => ({ ...transform, origin: transformOrigin }))
//     .reverse();

//   if (element.nodeName === 'g') {
//     const children = getShapeElementsAndGroupsAndPaths(element.children);
//     const paths = children.map((child) => shapeToPaths(child, document));
//     return paths.flat().map((path) => applyTransformsInOrder(path, transforms));
//   } else if (element.nodeName === 'path') {
//     const pathCommander = new SVGPathCommander(element.getAttribute('d') ?? '');
//     const d = pathCommander.toAbsolute().toString();
//     return [applyTransformsInOrder(new SVGPathCommander(d), transforms)];
//   } else {
//     const newPath = SVGPathCommander.shapeToPath(element as ShapeTypes, false, document);
//     if (newPath === false) {
//       throw new Error('path is FALSE');
//     }
//     const pathCommander = new SVGPathCommander(newPath.getAttribute('d') ?? '');
//     const d = pathCommander.toAbsolute().toString();
//     return [applyTransformsInOrder(new SVGPathCommander(d), transforms)];
//   }
// }

export function unitePaths(elements: SVGShapeOrGroup[]) {
  const allChildPaths = elements.map(getPaperPathItem);
  return allChildPaths.slice(1).reduce((unitedPath, currPath) => unitedPath.unite(currPath), allChildPaths[0]);
}

export function getPaperPathItem(element: SVGShapeOrGroup): paper.PathItem {
  const transformOrigin = getTransformOrigin(element);
  const transformations = getTransformationsInOrder(element);
  const pathItem = (() => {
    if (element.nodeName === 'circle') {
      const { cx, cy, r } = getAttrs(element, { cx: Number, cy: Number, r: Number });
      return new paper.Path.Circle(new paper.Point(cx, cy), r);
    } else if (element.nodeName === 'rect') {
      const { x, y, width, height, rx, ry } = getAttrs(element, { x: Number, y: Number, width: Number, height: Number, rx: Number, ry: Number });
      return new paper.Path.Rectangle(new paper.Rectangle(x, y, width, height), new paper.Size(rx, ry));
    } else if (element.nodeName === 'ellipse') {
      const { cx, cy, rx, ry } = getAttrs(element, { cx: Number, cy: Number, rx: Number, ry: Number });
      return new paper.Path.Ellipse(new paper.Rectangle(cx - rx, cy - ry, rx * 2, ry * 2));
    } else if (element.nodeName === 'polygon') {
      const points =
        element
          .getAttribute('points')
          ?.split(' ')
          .map((point) => point.split(',').map(Number)) ?? [];
      return new paper.Path(points);
    } else if (element.nodeName === 'polyline') {
      const points =
        element
          .getAttribute('points')
          ?.split(' ')
          .map((point) => point.split(',').map(Number)) ?? [];
      return new paper.Path(points);
    } else if (element.nodeName === 'path') {
      const d = element.getAttribute('d') ?? '';
      return new paper.Path(d);
    } else if (element.nodeName === 'line') {
      const { x1, y1, x2, y2 } = getAttrs(element, { x1: Number, y1: Number, x2: Number, y2: Number });
      return new paper.Path.Line(new paper.Point(x1, y1), new paper.Point(x2, y2));
    } else if (element.nodeName === 'g') {
      return unitePaths(getShapeElementsAndGroupsAndPaths(element.children));
    } else {
      throw new Error('Invalid element');
    }
  })();

  const originPoint = new paper.Point(transformOrigin[0], transformOrigin[1]);

  for (const transform of transformations.reverse()) {
    const matrix = new paper.Matrix();
    if (transform.translate) {
      matrix.translate(new paper.Point(transform.translate[0], transform.translate[1]));
    }
    if (transform.scale) {
      matrix.scale(transform.scale[0], transform.scale[1], originPoint);
    }
    if (transform.rotate) {
      matrix.rotate(transform.rotate, originPoint);
    }
    if (transform.skew) {
      const skewXRadians = (Math.PI / 180) * transform.skew[0];
      const skewYRadians = (Math.PI / 180) * transform.skew[1];
      matrix.skew(skewXRadians, skewYRadians, originPoint);
    }
    pathItem.transform(matrix);
  }

  return pathItem;
}

export function comboundPaths(elements: Element[]) {
  return unitePaths(getShapeElementsAndGroupsAndPaths(elements));
}

export type SimpleGroup = {
  type: 'group';
  transform: paper.Matrix;
  children: SimpleElement[];
};
export type SimpleRect = {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
  transform: paper.Matrix;
  clipPath: paper.PathItem;
};
export type SimpleEllipse = {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  transform: paper.Matrix;
  clipPath: paper.PathItem;
};
export type SimplePath = {
  type: 'path';
  d: string;
  transform: paper.Matrix;
  clipPath: paper.PathItem;
};
export type SimpleImage = {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  transform: paper.Matrix;
  clipPath: paper.PathItem;
};
export type SimpleElement = SimpleGroup | SimpleRect | SimpleEllipse | SimplePath | SimpleImage;

function getElementTransformationMatrix(element: Element) {
  const transforms = getTransformationsInOrder(element);
  const transformOrigin = getTransformOrigin(element);
  const matrix = new paper.Matrix();
  const originPoint = new paper.Point(transformOrigin[0], transformOrigin[1]);

  for (const transform of transforms) {
    if (transform.translate) {
      matrix.translate(new paper.Point(transform.translate[0], transform.translate[1]));
    }
    if (transform.scale) {
      matrix.scale(transform.scale[0], transform.scale[1], originPoint);
    }
    if (transform.rotate) {
      matrix.rotate(transform.rotate, originPoint);
    }
    if (transform.skew) {
      const skewXRadians = (Math.PI / 180) * transform.skew[0];
      const skewYRadians = (Math.PI / 180) * transform.skew[1];
      matrix.skew(skewXRadians, skewYRadians, originPoint);
    }
  }
  return matrix;
}

function getClipPath(selector: string, svg: SVGSVGElement) {
  const element = svg.querySelector(selector);
  if (!element || element.nodeName !== 'clipPath') {
    return undefined;
  }
  const clipPathElement = element as SVGClipPathElement;
  return comboundPaths(Array.from(clipPathElement.children));
}

function simplifyElements(elements: Element[], rootSVG: SVGSVGElement, tracingTransformMatrix: paper.Matrix, tracingClipPath: paper.PathItem | undefined, opts: { keepGroupTransforms: boolean }): SimpleElement[] {
  return elements
    .map((element) => {
      const topMatrix = tracingTransformMatrix.clone();

      // Get local matrix
      const localMatrix = getElementTransformationMatrix(element);
      // Get recursive matrix here
      const currMatrix = tracingTransformMatrix.clone().append(localMatrix);

      // Get local clip path
      const localClipPath = (() => {
        const localClipPathSelector = getElementClipPath(element);
        if (localClipPathSelector) {
          return getClipPath(localClipPathSelector, rootSVG);
        }
      })();

      if (tracingClipPath) {
        //tracingClipPath.transform(currMatrix.clone());
      }

      // Intersect clip paths
      if (localClipPath) {
        localClipPath.transform(currMatrix);

        //localClipPath.transform(currMatrix);
        if (tracingClipPath) {
          tracingClipPath = tracingClipPath.intersect(localClipPath);
        } else {
          tracingClipPath = localClipPath;
        }
      }

      const localizedClipPath = tracingClipPath ? tracingClipPath.clone().transform(topMatrix.clone().invert()) : undefined;

      if (element.nodeName === 'g') {
        const group = element as SVGGElement;
        return {
          type: 'group',
          // If we are keeping the group transforms, we should apply the local matrix to the group
          // Otherwise, the group's matrix will be traced down to the final element which knows what to do with it
          transform: opts.keepGroupTransforms ? localMatrix : new paper.Matrix(),
          children: simplifyElements(Array.from(group.children), rootSVG, currMatrix, tracingClipPath, opts),
        };
      } else {
        // If the groups are keeping their transforms, we should apply the local matrix to the element instead of the traced down one (multiplied with the original identity matrix)
        const transform = opts.keepGroupTransforms ? localMatrix : currMatrix;
        // If the groups are keeping their transforms, we should apply the localized clip path to the element instead of the traced down one
        const clipPath = opts.keepGroupTransforms ? localizedClipPath : tracingClipPath;
        if (element.nodeName === 'rect') {
          const rect = element as SVGRectElement;
          const { x, y, width, height, rx, ry } = getAttrs(rect, { x: Number, y: Number, width: Number, height: Number, rx: Number, ry: Number });
          return {
            type: 'rect',
            x,
            y,
            width,
            height,
            rx,
            ry,
            transform,
            clipPath,
          };
        } else if (element.nodeName === 'ellipse') {
          const ellipse = element as SVGEllipseElement;
          const { cx, cy, rx, ry } = getAttrs(ellipse, { cx: Number, cy: Number, rx: Number, ry: Number });
          return {
            type: 'ellipse',
            cx,
            cy,
            rx,
            ry,
            transform,
            clipPath,
          };
        } else if (element.nodeName === 'circle') {
          const circle = element as SVGCircleElement;
          const { cx, cy, r } = getAttrs(circle, { cx: Number, cy: Number, r: Number });
          return {
            type: 'ellipse',
            cx,
            cy,
            rx: r,
            ry: r,
            transform,
            clipPath,
          };
        } else if (element.nodeName === 'path') {
          const path = element as SVGPathElement;
          return {
            type: 'path',
            d: path.getAttribute('d') ?? '',
            transform: localMatrix,
            clipPath: localizedClipPath,
          };
        } else if (element.nodeName === 'line') {
          const line = element as SVGLineElement;
          const { x1, y1, x2, y2 } = getAttrs(line, { x1: Number, y1: Number, x2: Number, y2: Number });
          return {
            type: 'path',
            d: `M ${x1} ${y1} L ${x2} ${y2}`,
            transform,
            clipPath,
          };
        } else if (element.nodeName === 'polygon') {
          const polygon = element as SVGPolygonElement;
          const points = polygon.getAttribute('points') ?? '';
          return {
            type: 'path',
            d: `M ${points} Z`,
            transform,
            clipPath,
          };
        } else if (element.nodeName === 'polyline') {
          const polyline = element as SVGPolylineElement;
          const points = polyline.getAttribute('points') ?? '';
          return {
            type: 'path',
            d: `M ${points}`,
            transform,
            clipPath,
          };
        } else if (element.nodeName === 'image') {
          console.log('top matrix', topMatrix);
          const image = element as SVGImageElement;
          const { x, y, width, height, href } = getAttrs(image, { x: Number, y: Number, width: Number, height: Number, href: String });
          return {
            type: 'image',
            x,
            y,
            width,
            height,
            href,
            transform,
            clipPath,
          };
        } else {
          return undefined;
        }
      }
    })
    .filter((element) => element !== undefined) as SimpleElement[];
}

function serializeSimpleElement(
  element: SimpleElement,
  opts: {
    clipPathAfterElementTranform?: boolean;
  }
): ElementNode[] {
  const is0Matrix = element.transform.equals(new paper.Matrix());
  const transformMatrix = !is0Matrix ? `matrix(${element.transform.a}, ${element.transform.b}, ${element.transform.c}, ${element.transform.d}, ${element.transform.tx}, ${element.transform.ty})` : undefined;
  const clipPathId = getUniqueID();
  const clipPathDefs = (() => {
    if (element.type !== 'group' && element.clipPath) {
      return makeElementNode('defs', {}, [
        makeElementNode('clipPath', { id: clipPathId }, [
          makeElementNode('path', {
            d: (() => {
              if (opts.clipPathAfterElementTranform) {
                return element.clipPath.pathData;
              } else {
                const matrix = element.transform.clone().invert();
                element.clipPath.transform(matrix);
                return element.clipPath.pathData;
              }
            })(),
          }),
        ]),
      ]);
    }
  })();
  const baseElements = (() => {
    if (element.type === 'group') {
      const childElements = element.children.map((element) => serializeSimpleElement(element, opts)).flat(1);
      if (is0Matrix) {
        return childElements;
      }
      return [
        makeElementNode(
          'g',
          {
            style: createInlineStyle({ transform: transformMatrix }),
          },
          childElements
        ),
      ];
    } else if (element.type === 'rect') {
      return [
        makeElementNode('rect', {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          rx: element.rx,
          ry: element.ry,
          style: createInlineStyle({ transform: transformMatrix, 'clip-path': !opts.clipPathAfterElementTranform ? `url('#${clipPathId}')` : undefined }),
        }),
      ];
    } else if (element.type === 'ellipse') {
      return [
        makeElementNode('ellipse', {
          cx: element.cx,
          cy: element.cy,
          rx: element.rx,
          ry: element.ry,
          style: createInlineStyle({ transform: transformMatrix, 'clip-path': !opts.clipPathAfterElementTranform ? `url('#${clipPathId}')` : undefined }),
        }),
      ];
    } else if (element.type === 'path') {
      return [
        makeElementNode('path', {
          d: element.d,
          style: createInlineStyle({ transform: transformMatrix, 'clip-path': !opts.clipPathAfterElementTranform ? `url('#${clipPathId}')` : undefined }),
        }),
      ];
    } else if (element.type === 'image') {
      return [
        makeElementNode('image', {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          href: element.href,
          style: createInlineStyle({ transform: transformMatrix, 'clip-path': !opts.clipPathAfterElementTranform ? `url('#${clipPathId}')` : undefined }),
        }),
      ];
    } else {
      throw new Error('Invalid element');
    }
  })();

  if (clipPathDefs) {
    if (opts.clipPathAfterElementTranform) {
      return [
        clipPathDefs,
        makeElementNode(
          'g',
          {
            style: createInlineStyle({ 'clip-path': `url(#${clipPathId})` }),
          },
          [...baseElements]
        ),
      ];
    } else {
      return [clipPathDefs, ...baseElements];
    }
  }
  return baseElements;
}

export function simplifySVG(svg: SVGSVGElement) {
  const elements = simplifyElements(Array.from(svg.children), svg, new paper.Matrix(), undefined, {
    keepGroupTransforms: false,
  });

  const newSVG = makeElementNode(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: svg.getAttribute('viewBox') ?? undefined },
    elements
      .map((element) =>
        serializeSimpleElement(element, {
          clipPathAfterElementTranform: false,
        })
      )
      .flat(1)
  );

  return xmlFormat(stringifyNode(newSVG), {
    collapseContent: true,
  });
}
