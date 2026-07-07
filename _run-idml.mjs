import fs from 'fs/promises';
import { IDML } from './src/idml.js';
import { convertIDML2Serial } from './src/idml2serial.js';

const path = process.argv[2];
const buf = await fs.readFile(path);
const idml = new IDML(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
idml.addEventListener('ready', async () => {
  const converted = await convertIDML2Serial(idml);
  converted.forEach(({ serial, assets }, i) => {
    const names = [];
    const walk = (els, d=0) => {
      for (const el of els ?? []) {
        names.push(`${'  '.repeat(d)}${el.name}:${el.id}`);
        if (el.slots) for (const slot of Object.values(el.slots)) walk(slot, d+1);
      }
    };
    walk(serial.context ?? serial.elements ?? []);
    console.log(`=== Serial ${i} (${serial.width}x${serial.height}) ===`);
    console.log(names.join('\n'));
    console.log('fonts:', assets.fonts.map(f=>f.family).join(', '));
    console.log('missingImages:', assets.missingImages.length, 'imagesToUpload:', assets.imagesToUpload.length);
  });
  process.exit(0);
});
