#!/usr/bin/env node
// Bumps the version, then commits, tags and pushes — which triggers the
// GitHub release workflow. Confirms before touching the remote, since pushing
// the tag kicks off a real (signed) release build.
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];

if (mode !== '--minor' && mode !== '--major') {
  console.error('Usage: node scripts/release.js --minor|--major');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const runQuiet = (cmd) => execSync(cmd, { cwd: root }).toString().trim();

const status = runQuiet('git status --porcelain');
if (status) {
  console.error('Working tree has uncommitted changes — commit or stash them first:\n' + status);
  process.exit(1);
}

run(`node scripts/bump-version.js ${mode}`);

const { version } = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const tag = `v${version}`;

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  `\nThis will commit the bump, push to origin, tag ${tag} and push the tag — ` +
  `triggering the GitHub release build. Continue? [y/N] `
);
rl.close();

if (answer.trim().toLowerCase() !== 'y') {
  console.log('Aborted — version files are bumped locally but nothing was committed.');
  process.exit(0);
}

run('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml');
run(`git commit -m "Bump version to ${tag}"`);
run('git push');
run(`git tag ${tag}`);
run(`git push origin ${tag}`);

console.log(`\nPushed ${tag}. Watch the Actions tab for the build, then publish the draft release on GitHub.`);
