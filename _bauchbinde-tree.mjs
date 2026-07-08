import fs from 'fs/promises';
import { IDML } from './src/idml.js';
import { convertIDML2Serial } from './src/idml2serial.js';
const buf = await fs.readFile(process.argv[2]);
const idml = new IDML(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const isBar = e => e.iteration && /\.lines/.test(e.iteration.expression || '');
const countBars = serial => { let n=0; const w=els=>{for(const e of els??[]){if(isBar(e))n++; if(e.slots)for(const s of Object.values(e.slots))w(s);}}; w(serial.context); return n; };
idml.addEventListener('ready', async () => {
  const converted = await convertIDML2Serial(idml);
  const idx = converted.findIndex(({serial}) => countBars(serial) === 3);
  const target = converted[idx];
  const dump=(els,d=0)=>{for(const e of els??[]){const rot=e.transform?.rotate?.value; console.log(`${'  '.repeat(d)}${isBar(e)?'BAR ':''}${e.name}#${e.id}${rot&&rot!=='0'?`  rotate=${rot}`:''}`); if(e.slots)for(const s of Object.values(e.slots))dump(s,d+1);}};
  console.log(`Serial idx ${idx} — ${countBars(target.serial)} bars:`); dump(target.serial.context);
  process.exit(0);
});
