// Guards against a class of regression where `npm install` silently drops the
// resolved lockfile entries for non-current-platform native optional builds,
// even though the parent package's `optionalDependencies` still lists them
// (a dangling reference). This happened in #145: an unrelated dependency add
// rewrote the lockfile and lightningcss/@next/swc kept declaring their arm64
// builds but lost the actual resolved `packages` entries for them, so `npm ci`
// installed nothing on arm64 and the Next.js build crashed at runtime.
//
// For every optional dependency name that looks like a linux-x64 native build
// and is actually resolved in the lockfile, this asserts its declared
// linux-arm64 counterpart is resolved too.

const fs = require('fs');
const path = require('path');

const LOCKFILE = path.join(__dirname, '..', 'package-lock.json');
const LIBC_VARIANTS = ['gnu', 'musl'];

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

  for (const libc of LIBC_VARIANTS) {
    const x64Name = Object.keys(optDeps).find((name) => name.endsWith(`-linux-x64-${libc}`));
    if (!x64Name || !resolvedNames.has(x64Name)) continue; // x64 itself never got installed here; not our concern

    const arm64Name = x64Name.replace('-linux-x64-', '-linux-arm64-');
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
