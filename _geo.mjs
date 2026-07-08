import '@bluepic/core/headless';
import fs from 'fs/promises'; import path from 'path';
const { IdmlSerialConverter } = await import('./src/converter.js');
const dir=process.argv[2];
async function b(p){const x=await fs.readFile(p);return x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength);}
async function g(d){const o=[];for(const e of await fs.readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())o.push(...await g(p));else if(!e.name.startsWith('.'))o.push({name:e.name,bytes:await b(p)});}return o;}
const nm=(await fs.readdir(dir)).find(f=>f.endsWith('.idml'));
const c=await IdmlSerialConverter.create(await b(path.join(dir,nm)), await g(path.join(dir,'Document fonts')));
const s=await c.convert();
function val(v){return v&&typeof v==='object'&&'value'in v?v.value:v;}
function walk(n,cb,parent){if(!n)return;cb(n,parent);if(n.slots)for(const sl of Object.values(n.slots))for(const k of sl)walk(k,cb,n);}
const S=s[2].serial;
const order=[]; let idx=0;
for(const r of (Array.isArray(S.context)?S.context:[S.context]))walk(r,(x,p)=>{
  if(!x.name||x.name==='group')return;
  const P=x.properties||{};
  const info={z:idx++, id:String(x.id), name:x.name, x:+val(P.x)||0, y:+val(P.y)||0, w:+val(P.width)||0, h:+val(P.height)||0};
  if(/ub458|ub459|ub462|ub45a/.test(info.id) || x.name==='text'){
    const t = x.name==='text'? String(val(P.text)).replace(/`/g,'').slice(0,22):'';
    order.push(`  z${String(info.z).padStart(2)} ${info.name.padEnd(9)} ${info.id.padEnd(16)} x=${info.x.toFixed(0)} y=${info.y.toFixed(0)} w=${info.w.toFixed(0)} h=${info.h.toFixed(0)} ${t}`);
  }
});
console.error('DBG serial#2 (1080x1350) — bg rects + text (z = paint/DOM order):');
order.forEach(l=>console.error('DBG'+l));
process.exit(0);
