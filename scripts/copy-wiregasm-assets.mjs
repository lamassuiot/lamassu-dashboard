import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const packageJsonPath = require.resolve('@goodtools/wiregasm/package.json');
const packageDirectory = path.dirname(packageJsonPath);
const outputDirectory = path.join(projectDirectory, 'public', 'wiregasm');

const files = [
  ['dist/wiregasm.wasm.gz', 'wiregasm.wasm.gz'],
  ['dist/wiregasm.data.gz', 'wiregasm.data.gz'],
  ['LICENSE', 'LICENSE.txt'],
];

await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  files.map(([source, destination]) =>
    copyFile(
      path.join(packageDirectory, source),
      path.join(outputDirectory, destination),
    ),
  ),
);

await writeFile(
  path.join(outputDirectory, 'SOURCE.txt'),
  [
    'Wiregasm 1.9.1',
    '',
    'Copyright and license information:',
    'https://github.com/good-tools/wiregasm/blob/v1.9.1/LICENSE',
    '',
    'Complete corresponding source for this exact release:',
    'https://github.com/good-tools/wiregasm/tree/v1.9.1',
    'Commit: 67f9f8701fa7302b657d71109f8871b091689851',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Copied Wiregasm browser assets to ${outputDirectory}`);
