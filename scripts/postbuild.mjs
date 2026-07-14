// Post-build normalization so the published package loads in EVERY environment,
// not just bundlers.
//
//  1. dist/esm — `tsc --module ESNext` emits relative imports WITHOUT a file
//     extension (`import x from './main'`). Bundlers tolerate that, but raw Node
//     ESM (and `import`-ing consumers like the bx-render container) rejects it.
//     Rewrite them to explicit `.js` / `/index.js`. Idempotent + self-maintaining:
//     it normalizes every relative specifier, so a new extensionless import in
//     source can never re-break the published ESM.
//
//  2. dist/cjs — the package is `"type": "module"`, so Node parses the CommonJS
//     `.js` output as ESM and throws "exports is not defined". Drop a scoped
//     `package.json` marking that folder as CommonJS so `require('idml')` works.
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esmDir = path.join(root, 'dist', 'esm');
const cjsDir = path.join(root, 'dist', 'cjs');

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

async function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // bare package — leave
  if (/\.(js|json|mjs|cjs)$/.test(spec)) return null; // already has an extension
  const base = path.resolve(path.dirname(fromFile), spec);
  try { if ((await fs.stat(base + '.js')).isFile()) return spec + '.js'; } catch {}
  try { if ((await fs.stat(base)).isDirectory()) return spec.replace(/\/?$/, '/index.js'); } catch {}
  return spec + '.js';
}

// Matches `from './x'`, `import './x'`, and dynamic `import('./x')`.
const IMPORT_RE = /(\bfrom\s*|\bimport\s*|\bimport\(\s*)(['"])(\.[^'"]*)\2/g;

async function fixEsmExtensions() {
  let files = 0, edits = 0;
  for (const file of await walk(esmDir)) {
    const src = await fs.readFile(file, 'utf8');
    const replacements = [];
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(src))) {
      const fixed = await resolveSpec(file, m[3]);
      if (fixed && fixed !== m[3]) replacements.push([m[0], `${m[1]}${m[2]}${fixed}${m[2]}`]);
    }
    if (replacements.length) {
      let out = src;
      for (const [a, b] of replacements) out = out.split(a).join(b);
      await fs.writeFile(file, out);
      files++; edits += replacements.length;
    }
  }
  console.log(`[postbuild] esm: added extensions to ${edits} imports across ${files} files`);
}

async function markCjs() {
  await fs.writeFile(path.join(cjsDir, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
  console.log('[postbuild] cjs: wrote dist/cjs/package.json ({ type: commonjs })');
}

await fixEsmExtensions();
await markCjs().catch(() => console.log('[postbuild] cjs: dist/cjs not present — skipped'));
