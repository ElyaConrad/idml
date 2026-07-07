// Deterministic serial snapshotter for IDML regression testing.
//
//   npx tsx _snapshot.mjs <outDir> [folder ...]
//
// Converts every *.idml in the given folders (default: demo/working_demos) via
// convertIDML2Serial and writes ONE normalized, diff-friendly snapshot file per
// IDML into <outDir>. All floats are rounded to 2 decimals so insignificant
// numeric noise doesn't masquerade as a regression. Compare two runs with:
//
//   diff -ru <baselineDir> <candidateDir>
//
// Set IDML_HEADLESS=1 to import @bluepic/core/headless first (exercises text
// splitting) — requires happy-dom + skia-canvas to be installed.
import fs from 'fs/promises';
import path from 'path';

if (process.env.IDML_HEADLESS === '1') {
  await import('@bluepic/core/headless'); // sets happyDOM + SkiaCanvas globals so text splitting runs
}
const { IDML } = await import('./src/idml.js');
const { convertIDML2Serial } = await import('./src/idml2serial.js');

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: npx tsx _snapshot.mjs <outDir> [folder ...]');
  process.exit(1);
}
const folders = process.argv.slice(3);
if (folders.length === 0) folders.push('demo/working_demos');

// Silence the parser's stray debug prints so only our summary reaches stdout.
const origLog = console.log;
console.log = () => {};

// Round every float embedded in an expression string to 2 decimals.
const roundStr = (s) => String(s).replace(/-?\d+\.\d+/g, (m) => String(Math.round(parseFloat(m) * 100) / 100));
const raw = (el, k) => el.properties?.[k]?.value;
const val = (el, k) => (raw(el, k) === undefined ? undefined : roundStr(raw(el, k)));

// The geometry/appearance keys worth diffing. Order matters (snapshot is
// line-stable). COMMON apply to every element; TEXT only to text elements (they
// default-exist on all element types, so listing them everywhere is just noise).
const COMMON = ['x', 'y', 'width', 'height', 'radius', 'fill', 'stroke', 'strokeWidth', 'strokeAlignment', 'opacity'];
const TEXT = ['uppercase', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily', 'textAlign', 'justifyText', 'textMode', 'verticalAlign', 'lineHeight', 'letterSpacing'];

// Compact one-line form of the decomposed transform object, identity omitted.
function fmtTransform(el) {
  const t = el.transform;
  if (!t || typeof t !== 'object') return '';
  const g = (k, def) => {
    const v = t[k]?.value ?? t[k];
    if (v === undefined) return def;
    return roundStr(v);
  };
  const parts = [];
  const tx = g('translateX', '0'), ty = g('translateY', '0');
  if (tx !== '0' || ty !== '0') parts.push(`t(${tx},${ty})`);
  const rot = g('rotate', '0');
  if (rot !== '0') parts.push(`rot(${rot})`);
  const sx = g('scaleX', '1'), sy = g('scaleY', '1');
  if (sx !== '1' || sy !== '1') parts.push(`s(${sx},${sy})`);
  const kx = g('skewX', '0'), ky = g('skewY', '0');
  if (kx !== '0' || ky !== '0') parts.push(`skew(${kx},${ky})`);
  return parts.length ? ` tf=${parts.join('')}` : '';
}

function fmtElement(el, depth) {
  const bits = [`${'  '.repeat(depth)}${el.name}#${el.id}`];
  const keys = el.name === 'text' ? [...COMMON, ...TEXT] : COMMON;
  for (const k of keys) {
    const v = val(el, k);
    if (v !== undefined) bits.push(`${k}=${v}`);
  }
  if (el.name === 'text') {
    const text = String(raw(el, 'text') ?? '').replace(/\n/g, '\\n');
    bits.push(`text="${text.slice(0, 80)}"`);
    const rich = raw(el, 'richText');
    if (rich && val(el, 'textMode') === '`richtext`') bits.push(`rich=${roundStr(rich).slice(0, 120)}`);
  }
  if (el.name === 'image') {
    const img = String(raw(el, 'image') ?? '');
    const crop = img.match(/crop:\s*(null|\{[^}]*\})/);
    const cropMode = img.match(/cropMode:\s*`([^`]*)`/);
    if (crop) bits.push(`crop=${roundStr(crop[1])}`);
    if (cropMode) bits.push(`cropMode=${cropMode[1]}`);
  }
  return bits.join(' ') + fmtTransform(el);
}

function walk(els, depth, out) {
  for (const el of els ?? []) {
    out.push(fmtElement(el, depth));
    if (el.slots)
      for (const [name, slot] of Object.entries(el.slots)) {
        if (slot?.length) {
          out.push(`${'  '.repeat(depth + 1)}<${name}>`);
          walk(slot, depth + 2, out);
        }
      }
  }
}

async function convert(file) {
  const buf = await fs.readFile(file);
  const idml = new IDML(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return await new Promise((resolve, reject) => {
    idml.addEventListener('ready', async () => {
      try {
        resolve(await convertIDML2Serial(idml));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function findIdml(folder) {
  const out = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('_UNPACKED') || entry.name === 'node_modules') continue;
      out.push(...(await findIdml(full)));
    } else if (entry.name.toLowerCase().endsWith('.idml')) out.push(full);
  }
  return out;
}

await fs.mkdir(outDir, { recursive: true });
const summary = [];
for (const folder of folders) {
  const files = (await findIdml(folder)).sort();
  for (const file of files) {
    // Path-derived name (not just basename): the same template name can appear
    // in more than one folder, and a basename-only file would silently overwrite
    // its twin — hiding exactly the kind of change we're trying to catch.
    const name = path.relative('.', file).replace(/\.idml$/i, '').replace(/[\/\\ ]+/g, '__');
    let lines;
    try {
      const converted = await convert(file);
      lines = [];
      converted.forEach(({ serial, assets }, i) => {
        lines.push(`### Serial ${i}  ${roundStr(serial.width)}x${roundStr(serial.height)}`);
        walk(serial.context ?? serial.elements ?? [], 0, lines);
        lines.push(`fonts: ${assets.fonts.map((f) => `${f.family}[${f.variants.map((v) => v.styleName ?? v.weight).join('/')}]`).join(', ')}`);
        lines.push(`missingImages: ${assets.missingImages.length}  imagesToUpload: ${assets.imagesToUpload.length}`);
      });
    } catch (e) {
      lines = [`ERROR: ${e?.stack ?? e}`];
    }
    await fs.writeFile(path.join(outDir, `${name}.snap.txt`), lines.join('\n') + '\n');
    summary.push(`${name}: ${lines.length} lines`);
  }
}
console.log = origLog;
console.log(`wrote ${summary.length} snapshot(s) to ${outDir}:`);
console.log(summary.map((s) => '  ' + s).join('\n'));
