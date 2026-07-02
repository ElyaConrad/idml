import fs from 'fs/promises';
import { IDML } from './src/idml.js';
import { convertIDML2Serial } from './src/idml2serial.js';

const buf = await fs.readFile('/Users/mauriceconrad/Downloads/kunden templates/ART_26_Bluepic-Banner_1080x1080px_MB_DE_EN Ordner/ART_26_Bluepic-Banner_1080x1080px_MB_DE_EN.idml');
const idml = new IDML(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
idml.addEventListener('ready', async () => {
  const converted = await convertIDML2Serial(idml);

  converted.forEach(({ serial, assets }, i) => {
    console.log(`\n=== Serial ${i} ===`);
    const images = [];
    const walk = (els) => {
      for (const el of els ?? []) {
        if (el.name === 'image') images.push(el);
        if (el.elements) walk(el.elements);
        if (el.masks) walk(el.masks);
        if (el.properties?.elements?.value) walk(el.properties.elements.value);
        if (el.properties?.masks?.value) walk(el.properties.masks.value);
        if (el.slots) for (const slot of Object.values(el.slots)) walk(slot);
      }
    };
    const names = [];
    const walkNames = (els) => {
      for (const el of els ?? []) {
        names.push(`${el.name}:${el.id}`);
        if (el.elements) walkNames(el.elements);
        if (el.masks) walkNames(el.masks);
        if (el.properties?.elements?.value) walkNames(el.properties.elements.value);
        if (el.properties?.masks?.value) walkNames(el.properties.masks.value);
        if (el.slots) for (const slot of Object.values(el.slots)) walkNames(slot);
      }
    };
    walkNames(serial.context ?? serial.elements ?? []);
    console.log('elements:', names.join(', '));
    walk(serial.context ?? serial.elements ?? []);
    for (const img of images) {
      const raw = JSON.stringify(img.properties?.image ?? null);
      console.log(img.id, raw ? raw.replace(/src: `[^`]*`/, 'src: `…`').slice(0, 400) : raw);
    }
    console.log('missingImages:', JSON.stringify(assets.missingImages.map((m) => ({ elementId: m.elementId, link: m.linkURI?.split('/').pop() }))));
  });
  process.exit(0);
});
