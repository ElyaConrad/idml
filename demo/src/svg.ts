import { parseXML, comboundPaths, simplifySVG } from 'idml';
import fs from 'fs/promises';
import { JSDOM } from 'jsdom';

const testFile = await fs.readFile('test.svg', 'utf-8');

const { document } = new JSDOM(testFile, {
  pretendToBeVisual: true,
}).window;

// const g1 = document.getElementById('g1')!;

// const path = comboundPaths(Array.from(g1.children));

// console.log(path.pathData);

const svg = document.querySelector('svg')!;

const simplifiedStructure = simplifySVG(svg);

await fs.writeFile('test2.svg', simplifiedStructure);
