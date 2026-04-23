#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pickMaterial} from './material-picker.mjs';

const HELP = `
Create a per-property template TSX under src/編集指示.

Usage:
  npm run "動画テンプレ作成"
  npm run "動画テンプレ作成" -- <user>/<property>
  npm run "動画テンプレ作成" -- <user>/<property> --force
`.trim();

const normalizeKey = (input) => {
  if (!input) return null;
  const normalized = input.trim().replace(/\\/g, '/').replace(/^materials\//, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  return `${segments[0]}/${segments[1]}`;
};

const toSafePropertyFileName = (propertyName) => {
  const cleaned = propertyName
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'unknown';
};

const toPosix = (p) => p.replace(/\\/g, '/');

const ensureRelativeImport = (fromDir, toFileWithoutExt) => {
  let rel = toPosix(path.relative(fromDir, toFileWithoutExt));
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    process.exit(0);
  }

  const force = args.includes('--force');
  const positional = args.find((a) => !a.startsWith('-'));

  let key = normalizeKey(positional);
  if (!key) {
    const picked = await pickMaterial();
    if (!picked) {
      console.log('キャンセルしました。');
      process.exit(130);
    }
    key = `${picked.userName}/${picked.propertyName}`;
  }

  if (!key) {
    throw new Error('対象物件を特定できませんでした。');
  }

  const [, propertyName] = key.split('/');
  const safePropertyName = toSafePropertyFileName(propertyName);
  const templateName = `MargoMain_${safePropertyName}`;

  const projectRoot = process.cwd();
  const baseMainPath = path.resolve(projectRoot, 'src', 'MargoMain.tsx');
  const targetDir = path.resolve(projectRoot, 'src', '編集指示');
  const targetMainPath = path.join(targetDir, `${templateName}.tsx`);

  if (!fs.existsSync(baseMainPath)) {
    throw new Error(`共通 MargoMain.tsx が見つかりません: ${baseMainPath}`);
  }

  fs.mkdirSync(targetDir, {recursive: true});

  if (fs.existsSync(targetMainPath) && !force) {
    console.log(`既に存在します: ${targetMainPath}`);
    console.log('上書きする場合は --force を指定してください。');
  } else {
    let content = fs.readFileSync(baseMainPath, 'utf8');
    const importToNiken = ensureRelativeImport(
      targetDir,
      path.resolve(projectRoot, 'src', 'NikenAppeal')
    );
    content = content.replace(
      /from\s+['"]\.\/NikenAppeal['"]/g,
      `from '${importToNiken}'`
    );

    fs.writeFileSync(targetMainPath, content, 'utf8');
    console.log(`作成: ${targetMainPath}`);
  }

  console.log(`テンプレート名: ${templateName}`);
  console.log('完了');
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
