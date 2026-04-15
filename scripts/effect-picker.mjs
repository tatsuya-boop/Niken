import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const normalize = (s) => (s ?? '').trim();

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const listEffectFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith('.') && !name.startsWith('._'))
    .map((name) => ({ name, full: path.join(dir, name) }))
    .filter((f) => isFile(f.full))
    .map((f) => f.name)
    .sort((a, b) => a.localeCompare(b, 'ja'));
};

const choose = async (rl, title, items) => {
  if (items.length === 0) return null;
  while (true) {
    console.log(`\n${title}`);
    items.forEach((it, i) => {
      console.log(`${String(i + 1).padStart(2, ' ')}. ${it}`);
    });
    const answer = normalize(
      await rl.question('番号（または名前の一部, Enterでキャンセル）: ')
    );
    if (!answer) return null;

    if (/^\d+$/.test(answer)) {
      const idx = Number(answer);
      if (idx >= 1 && idx <= items.length) return items[idx - 1];
      console.log('無効な番号です。');
      continue;
    }

    const hits = items.filter((it) =>
      it.toLowerCase().includes(answer.toLowerCase())
    );
    if (hits.length === 1) return hits[0];
    if (hits.length === 0) {
      console.log('一致する候補がありません。');
      continue;
    }
    console.log(`候補が複数あります（${hits.length}件）。もう少し絞ってください。`);
  }
};

export const pickEffectSound = async ({ effectsDir = 'public/効果音' } = {}) => {
  if (!process.stdin.isTTY) {
    throw new Error('対話選択にはTTYが必要です。ターミナルで実行してください。');
  }

  const resolvedDir = path.isAbsolute(effectsDir)
    ? effectsDir
    : path.resolve(process.cwd(), effectsDir);

  const files = listEffectFiles(resolvedDir);
  if (files.length === 0) {
    throw new Error(`効果音ファイルが見つかりません: ${resolvedDir}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const fileName = await choose(rl, '効果音を選択（public/効果音）', files);
    if (!fileName) return null;
    return {
      fileName,
      publicPath: `効果音/${fileName}`,
    };
  } finally {
    rl.close();
  }
};

