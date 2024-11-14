import { cleanupBluepicSVG, simplifySVG, type RasterImage } from 'flat-svg';
import fs from 'fs/promises';
import { write, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import formatXml from 'xml-formatter';
import { Resvg } from '@resvg/resvg-js';
import png from 'pngjs';

const testFile = await fs.readFile('test.svg', 'utf-8');

const { document } = new JSDOM(testFile, {
  pretendToBeVisual: true,
  contentType: 'image/svg+xml',
}).window;

// const g1 = document.getElementById('g1')!;

// const path = comboundPaths(Array.from(g1.children));

// console.log(path.pathData);

// const svg = document.querySelector('svg')!;

function getMaskBBox(image: png.PNGWithMetadata) {
  let minX = image.width,
    minY = image.height,
    maxX = 0,
    maxY = 0;
  let hasMask = false;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const idx = (image.width * y + x) << 2;

      const r = image.data[idx];
      const g = image.data[idx + 1];
      const b = image.data[idx + 2];
      const a = image.data[idx + 3];

      if ((r !== 0 || g !== 0 || b !== 0) && a > 0) {
        hasMask = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasMask) {
    return null;
  } else {
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    return { left: minX, top: minY, width, height };
  }
}

function cropImage(image: png.PNGWithMetadata, { left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const cropped = new png.PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((top + y) * image.width + (left + x)) << 2;
      const destIdx = (y * width + x) << 2;

      cropped.data[destIdx] = image.data[srcIdx];
      cropped.data[destIdx + 1] = image.data[srcIdx + 1];
      cropped.data[destIdx + 2] = image.data[srcIdx + 2];
      cropped.data[destIdx + 3] = image.data[srcIdx + 3];
    }
  }
  return png.PNG.sync.write(cropped) as any as ArrayBuffer;
}

type ColorMatrix = number[];
function applyColorMatrixToColor({ r, g, b, a }: { r: number; g: number; b: number; a: number }, matrix: ColorMatrix): { r: number; g: number; b: number; a: number } {
  const newR = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4] * 255;
  const newG = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9] * 255;
  const newB = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14] * 255;
  const newA = matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19] * 255;

  return {
    r: Math.min(255, Math.max(0, Math.round(newR))),
    g: Math.min(255, Math.max(0, Math.round(newG))),
    b: Math.min(255, Math.max(0, Math.round(newB))),
    a: Math.min(255, Math.max(0, Math.round(newA))),
  };
}

function getAllVisibleElements(elOrDoc: Element | Document) {
  return Array.from(elOrDoc.querySelectorAll('.element')).filter((el) => el.closest('defs') === null);
}
cleanupBluepicSVG(document, (document) => getAllVisibleElements(document).filter((el) => getAllVisibleElements(el).length > 1));

writeFileSync('bx-test-4-cleanup.svg', document.querySelector('svg')!.outerHTML);

let i = 0;
let colorI = 0;

const simplifiedSVG = await simplifySVG(document as any, {
  keepGroupTransforms: true,
  rasterizeAllMasks: false,
  vectorizeAllTexts: false,
  async rasterize(svgElement) {
    i++;

    const resvg = new Resvg(svgElement.outerHTML, {
      background: '#00000000', // transparent
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    const image = png.PNG.sync.read(pngBuffer);

    writeFileSync(`raster-${i}.png`, pngBuffer);

    writeFileSync(`raster-${i}.svg`, svgElement.outerHTML);
    console.log('Rasterize', i, image.width, image.height);

    const bbox = getMaskBBox(image);

    if (bbox === null) {
      return undefined;
    }

    return {
      left: bbox.left,
      top: bbox.top,
      width: bbox.width,
      height: bbox.height,
      buffer: cropImage(image, bbox),
    };
  },
  async applyColorMatrix(data: ArrayBuffer, matrices: number[][]) {
    colorI++;
    console.log('Apply color matrix', colorI, data, matrices);

    const image = png.PNG.sync.read(Buffer.from(data));

    // Matrix auf jedes Pixel anwenden
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const idx = (image.width * y + x) << 2;
        for (const matrix of matrices) {
          const [r, g, b, a] = [image.data[idx], image.data[idx + 1], image.data[idx + 2], image.data[idx + 3]];

          const { r: newR, g: newG, b: newB, a: newA } = applyColorMatrixToColor({ r, g, b, a }, matrix);

          image.data[idx] = newR;
          image.data[idx + 1] = newG;
          image.data[idx + 2] = newB;
          image.data[idx + 3] = newA;
        }
      }
    }

    const ab = png.PNG.sync.write(image) as any as ArrayBuffer;

    writeFileSync(`color-${colorI}.png`, ab as any);
    writeFileSync(`color-${colorI}-source.png`, data as any);

    return ab;
  },
});

const prettyNewSVG = formatXml(simplifiedSVG.querySelector('svg')!.outerHTML, {
  collapseContent: true,
});

await fs.writeFile('test-modified.svg', prettyNewSVG);
