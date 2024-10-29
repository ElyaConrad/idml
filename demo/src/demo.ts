import { IDML } from 'idml';
import fs from 'fs/promises';

const testFile = await fs.readFile('demo.idml');

const idml = new IDML(testFile);
idml.addEventListener('ready', async () => {
  console.log('IDML ready');
  const archive = Buffer.from(await idml.export());
  await fs.writeFile('demo-export-2.idml', archive);
});
