// Keep Linux ARM64 native optional dependencies available alongside x64 builds.
// Missing ARM64 lockfile entries previously broke multi-architecture Docker builds.
// pnpm lockfile format v9 stores optional dependency edges in snapshots and resolved
// package metadata in packages. Check exact versions, including peer suffixes.
const fs = require('fs');
const path = require('path');
const { parse } = require('yaml');

const LOCKFILE = path.join(__dirname, '..', 'pnpm-lock.yaml');
const X64_TOKEN = /(^|[-/])x64($|[-/])/;

const lock = parse(fs.readFileSync(LOCKFILE, 'utf8'));
if (String(lock?.lockfileVersion) !== '9.0' || !lock.packages || !lock.snapshots) {
  console.error('Expected a pnpm v9 lockfile with packages and snapshots.');
  process.exit(1);
}

const problems = [];

function isResolved(name, version) {
  const snapshotKey = `${name}@${version}`;
  const packageKey = snapshotKey.split('(')[0];
  return Object.hasOwn(lock.packages, packageKey) && Object.hasOwn(lock.snapshots, snapshotKey);
}

for (const [pkgKey, entry] of Object.entries(lock.snapshots)) {
  const optDeps = entry.optionalDependencies;
  if (!optDeps) continue;

  for (const [x64Name, x64Version] of Object.entries(optDeps)) {
    if (!x64Name.includes('linux') || !X64_TOKEN.test(x64Name)) continue;
    if (!isResolved(x64Name, x64Version)) continue;

    const arm64Name = x64Name.replace(X64_TOKEN, (_match, pre, post) => `${pre}arm64${post}`);
    if (Object.hasOwn(optDeps, arm64Name) && !isResolved(arm64Name, optDeps[arm64Name])) {
      problems.push(
        `${pkgKey}: resolves "${x64Name}" and declares "${arm64Name}" as optional, ` +
          `but no resolved lockfile entry for "${arm64Name}@${optDeps[arm64Name]}" exists`
      );
    }
  }
}

if (problems.length > 0) {
  console.error('pnpm-lock.yaml has dangling arm64 optional-dependency references:\n');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('\nRegenerate with `pnpm install --fix-lockfile` and commit the result.');
  process.exit(1);
}

console.log('Lockfile platform check passed: linux-x64 and linux-arm64 native builds are in sync.');
