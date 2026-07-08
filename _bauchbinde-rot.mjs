import fs from 'fs/promises';
import { IDML } from './src/idml.js';
import { convertIDML2Serial } from './src/idml2serial.js';
const buf = await fs.readFile(process.argv[2]);
const idml = new IDML(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const isBar = e => e.iteration && /\.lines/.test(e.iteration.expression || '');
idml.addEventListener('ready', async () => {
  const converted = await convertIDML2Serial(idml);
  // find a bar whose ancestor chain has a non-zero rotate
  converted.forEach(({serial}, idx) => {
    const walk = (els, rotAnc=false, path='') => {
      for (const e of els ?? []) {
        const rot = e.transform?.rotate?.value; const r = rot && rot !== '0';
        if (isBar(e) && (rotAnc || r)) console.log(`serial ${idx}: BAR ${e.id} under rotated ancestor (path ${path}${e.id})`);
        if (e.slots) for (const s of Object.values(e.slots)) walk(s, rotAnc || r, `${path}${e.name}${r?`(rot${rot})`:''}/`);
      }
    };
    walk(serial.context);
  });
  process.exit(0);
});
