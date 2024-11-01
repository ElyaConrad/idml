import { simplifySVG } from 'flat-svg';
import fs from 'fs/promises';
import { JSDOM } from 'jsdom';
import formatXml from 'xml-formatter';
import beautify from 'beautify';
import { Resvg } from '@resvg/resvg-js';

const testFile = await fs.readFile('test.svg', 'utf-8');

const { document } = new JSDOM(testFile, {
  pretendToBeVisual: true,
}).window;

// const g1 = document.getElementById('g1')!;

// const path = comboundPaths(Array.from(g1.children));

// console.log(path.pathData);

const svg = document.querySelector('svg')!;

const simplifiedSVG = simplifySVG(svg, {
  clipAfterElementTransform: false,
  keepGroupTransforms: false,
  rasterize(svgElement) {
    fs.writeFile('mask_final.svg', beautify(svgElement.outerHTML, { format: 'html' }));

    const resvg = new Resvg(svgElement.outerHTML, {
      background: '#00000000', // transparent
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    fs.writeFile('mask_final.png', pngBuffer);

    return pngBuffer;
  },
});

const prettyNewSVG = formatXml(simplifiedSVG.outerHTML, {
  collapseContent: true,
});

await fs.writeFile('test2.svg', prettyNewSVG);
