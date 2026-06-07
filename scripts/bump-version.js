#!/usr/bin/env node
// Bumps the app version across package.json, src-tauri/tauri.conf.json and
// src-tauri/Cargo.toml, treating major.minor as a decimal (minor 0-99) so
// that a "+0.01" bump rolls over into the next major version: 0.99 -> 1.0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];

if (mode !== '--minor' && mode !== '--major') {
  console.error('Usage: node scripts/bump-version.js --minor|--major');
  process.exit(1);
}

const tauriConfPath = join(root, 'src-tauri', 'tauri.conf.json');
const packagePath = join(root, 'package.json');
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');

const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
const [major, minor] = tauriConf.version.split('.').map(Number);

let nextMajor = major;
let nextMinor = minor;
if (mode === '--minor') {
  nextMinor += 1;
  if (nextMinor > 99) {
    nextMinor = 0;
    nextMajor += 1;
  }
} else {
  nextMajor += 1;
  nextMinor = 0;
}
const nextVersion = `${nextMajor}.${nextMinor}.0`;

const oldVersion = tauriConf.version;
tauriConf.version = nextVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
pkg.version = nextVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const cargo = readFileSync(cargoPath, 'utf8');
writeFileSync(cargoPath, cargo.replace(/^version = "[^"]+"/m, `version = "${nextVersion}"`));

console.log(`Version bumped: ${oldVersion} -> ${nextVersion}`);
console.log(`Next: commit, then "git tag v${nextVersion} && git push origin v${nextVersion}" to cut a release.`);
