import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wheelName = 'live_cbom-0.1.0-py3-none-any.whl';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const source = path.join(
  projectDirectory,
  'vendor',
  'python',
  wheelName,
);
const outputDirectory = path.join(projectDirectory, 'public', 'python');

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, path.join(outputDirectory, wheelName));

console.log(`Copied live-cbom browser assets to ${outputDirectory}`);
