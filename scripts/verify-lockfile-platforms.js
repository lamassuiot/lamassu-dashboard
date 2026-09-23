// Guards against a class of regression where `npm install` silently drops the
// resolved lockfile entries for non-current-platform native optional builds,
// even though the parent package's `optionalDependencies` still lists them
// (a dangling reference). This happened in #145: an unrelated dependency add
// rewrote the lockfile and lightningcss/@next/swc kept declaring their arm64
// builds but lost the actual resolved `packages` entries for them, so `npm ci`
// installed nothing on arm64 and the Next.js build crashed at runtime.
//
// For every optional dependency name that looks like a linux x64 native build
// (matched generically by an "x64" token, since vendors vary: lightningcss/
// @next/swc use `-linux-x64-gnu`, sharp's @img/* packages use `-linux-x64` and
// `-linuxmusl-x64` with no libc suffix) and is actually resolved in the
// lockfile, this asserts its declared arm64 counterpart is resolved too.

const fs = require('fs');
const path = require('path');

const LOCKFILE = path.join(__dirname, '..', 'package-lock.json');
const X64_TOKEN = /(^|[-/])x64($|[-/])/;

const lock = JSON.parse(fs.readFileSync(LOCKFILE, 'utf8'));
const packages = lock.packages || {};

function nameFromPath(pkgPath) {
  const idx = pkgPath.lastIndexOf('node_modules/');
  if (idx === -1) return null;
  const rest = pkgPath.slice(idx + 'node_modules/'.length);
  const [first, second] = rest.split('/');
  return first.startsWith('@') ? `${first}/${second}` : first;
}

const resolvedNames = new Set(Object.keys(packages).map(nameFromPath).filter(Boolean));

const problems = [];

for (const [pkgPath, entry] of Object.entries(packages)) {
  const optDeps = entry.optionalDependencies;
  if (!optDeps) continue;

  for (const x64Name of Object.keys(optDeps)) {
    if (!x64Name.includes('linux') || !X64_TOKEN.test(x64Name)) continue;
    if (!resolvedNames.has(x64Name)) continue; // x64 itself never got installed here; not our concern

    const arm64Name = x64Name.replace(X64_TOKEN, (_match, pre, post) => `${pre}arm64${post}`);
    const arm64Declared = arm64Name in optDeps;
    if (arm64Declared && !resolvedNames.has(arm64Name)) {
      problems.push(
        `${pkgPath || '(root)'}: resolves "${x64Name}" and declares "${arm64Name}" as optional, ` +
          `but no resolved lockfile entry for "${arm64Name}" exists`
      );
    }
  }
}

if (problems.length > 0) {
  console.error('package-lock.json has dangling arm64 optional-dependency references:\n');
  problems.forEach((p) => console.error(`  - ${p}`));
  console.error(
    '\nThis usually happens when the lockfile is regenerated on a machine or npm config that restricts ' +
      'os/cpu/arch. Regenerate with a clean `npm install` and commit the result.'
  );
  process.exit(1);
}

console.log('Lockfile platform check passed: linux-x64 and linux-arm64 native builds are in sync.');
