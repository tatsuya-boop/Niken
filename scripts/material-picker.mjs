import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const listDirs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith('.') && !name.startsWith('._'))
    .map((name) => ({ name, full: path.join(dir, name) }))
    .filter((d) => isDir(d.full))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'ja'));
};

const normalize = (s) => (s ?? '').trim();

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

const resolveMaterialsDir = (materialsDir) => {
  return path.isAbsolute(materialsDir)
    ? materialsDir
    : path.resolve(process.cwd(), materialsDir);
};

export const pickMaterial = async ({ materialsDir = 'public/materials' } = {}) => {
  const root = resolveMaterialsDir(materialsDir);

  if (!process.stdin.isTTY) {
    throw new Error('対話選択にはTTYが必要です。ターミナルで実行してください。');
  }

  const listProperties = (userName) => {
    const userDir = path.join(root, userName);
    return listDirs(userDir).filter((propertyName) => {
      return fs.existsSync(path.join(userDir, propertyName, 'metadata.json'));
    });
  };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const users = listDirs(root).filter((u) => listProperties(u).length > 0);
    const userName = await choose(rl, 'ユーザーを選択（public/materials）', users);
    if (!userName) return null;

    const properties = listProperties(userName);
    const propertyName = await choose(rl, '物件を選択（metadata.json があるもの）', properties);
    if (!propertyName) return null;

    return {
      userName,
      propertyName,
      materialKey: `${userName}/${propertyName}`,
      metadataPath: path.join(root, userName, propertyName, 'metadata.json'),
    };
  } finally {
    rl.close();
  }
};

