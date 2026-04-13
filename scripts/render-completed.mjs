#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HELP = `
Render a completed video next to metadata.json as "完成動画.mp4".

Usage:
  npm run render:completed -- <user>/<property>
  npm run render:completed -- public/materials/<user>/<property>/metadata.json

Examples:
  npm run render:completed -- tanakatatsuya/SPCourtMejiro401
  npm run render:completed -- public/materials/tanakatatsuya/SPCourtMejiro401/metadata.json
`.trim();

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length === 0 ? 1 : 0);
}

const projectRoot = process.cwd();
const publicMaterialsDir = path.resolve(projectRoot, 'public', 'materials');

const resolveMetadataPath = (input) => {
  const normalized = input.replace(/\\/g, '/');
  if (normalized.endsWith('.json')) {
    return path.resolve(projectRoot, input);
  }

  // Accept:
  // - user/property
  // - materials/user/property
  // - public/materials/user/property
  const withoutPrefix = normalized
    .replace(/^public\/materials\//, '')
    .replace(/^materials\//, '');

  return path.resolve(publicMaterialsDir, withoutPrefix, 'metadata.json');
};

const metadataPath = resolveMetadataPath(args[0]);
if (!fs.existsSync(metadataPath)) {
  console.error(`metadata.json が見つかりません: ${metadataPath}`);
  process.exit(1);
}

const segments = path.resolve(metadataPath).split(path.sep);
const materialsIndex = segments.lastIndexOf('materials');
if (materialsIndex === -1 || materialsIndex + 2 >= segments.length) {
  console.error(
    `metadata.json のパスから user/property を特定できません: ${metadataPath}`
  );
  console.error(`想定: public/materials/<user>/<property>/metadata.json`);
  process.exit(1);
}

const userName = segments[materialsIndex + 1];
const propertyName = segments[materialsIndex + 2];
const outputDir = path.dirname(metadataPath);
const outputPath = path.join(outputDir, '完成動画.mp4');

if (fs.existsSync(outputPath)) {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  const backupPath = path.join(outputDir, `完成動画.${stamp}.mp4`);
  fs.renameSync(outputPath, backupPath);
  console.log(`既存の完成動画を退避しました: ${backupPath}`);
}

const remotionBin = path.resolve(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'remotion.cmd' : 'remotion'
);

const entryPoint = path.resolve(projectRoot, 'src', 'index.ts');
const compositionId = process.env.MARGO_COMPOSITION_ID ?? 'SPCourtMejiro401';
const inputProps = JSON.stringify({ userName, propertyName });

const result = spawnSync(
  remotionBin,
  [
    'render',
    entryPoint,
    compositionId,
    outputPath,
    `--props=${inputProps}`,
    '--overwrite',
  ],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);

