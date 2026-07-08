import fs from 'fs/promises';
import { IDML } from './src/idml.js';
import { convertIDML2Serial } from './src/idml2serial.js';

const path = process.argv[2];
const buf = await fs.readFile(path);
const idml = new IDML(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
idml.addEventListener('ready', async () => {
  const converted = await convertIDML2Serial(idml);
  let found = 0;
  converted.forEach(({ serial }, i) => {
    const bars = [];
    const walk = (els) => { for (const el of els ?? []) { if (el.iteration && /\.lines\b/.test(el.iteration.expression || '')) bars.push(el); if (el.slots) for (const slot of Object.values(el.slots)) walk(slot); } };
    walk(serial.context ?? []);
    if (bars.length) {
      console.log(`\n=== Serial ${i} (${serial.width}x${serial.height}) — ${bars.length} line-bg bar(s) ===`);
      for (const b of bars) {
        found++;
        console.log(`  ${b.name}#${b.id}  iter=${JSON.stringify(b.iteration)}`);
        console.log(`     x=${b.properties.x.value}`);
        console.log(`     y=${b.properties.y.value}`);
        console.log(`     w=${b.properties.width.value}`);
        console.log(`     h=${b.properties.height.value}`);
        console.log(`     fill=${b.properties.fill.value}`);
      }
    }
  });
  console.log(`\nTOTAL bars: ${found}`);
  process.exit(0);
});
