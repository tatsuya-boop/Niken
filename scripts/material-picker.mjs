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

const listFiles = (dir, exts = []) => {
  if (!fs.existsSync(dir)) return [];
  const allowedExts = exts.map((ext) => ext.toLowerCase());
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith('.') && !name.startsWith('._'))
    .filter((name) => {
      const full = path.join(dir, name);
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return false;
      if (allowedExts.length === 0) return true;
      return allowedExts.includes(path.extname(name).toLowerCase());
    })
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

export const pickMaterial = async ({
  materialsDir = 'public/materials',
  includeVideoOptions = false,
} = {}) => {
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

    const basePicked = {
      userName,
      propertyName,
      materialKey: `${userName}/${propertyName}`,
      metadataPath: path.join(root, userName, propertyName, 'metadata.json'),
    };

    if (!includeVideoOptions) {
      return basePicked;
    }

    const bgMusicDirCandidates = ['bgMusic', 'bgMusics'].map((name) => ({
      full: path.join(root, name),
      relative: `materials/${name}`,
    }));
    const activeBgMusicDir =
      bgMusicDirCandidates.find((c) => fs.existsSync(c.full) && isDir(c.full)) ?? null;
    const bgMusicFiles = activeBgMusicDir
      ? listFiles(activeBgMusicDir.full, ['.mp3', '.wav', '.m4a'])
      : [];
    let bgMusicSrc = null;
    while (true) {
      console.log('\nBGMを選択（public/materials/bgMusic または bgMusics）');
      console.log(' 0. なし');
      bgMusicFiles.forEach((f, i) => {
        console.log(`${String(i + 1).padStart(2, ' ')}. ${f}`);
      });
      const answer = normalize(await rl.question('番号（Enterでキャンセル）: '));
      if (!answer) return null;
      if (!/^\d+$/.test(answer)) {
        console.log('番号で入力してください。');
        continue;
      }
      const idx = Number(answer);
      if (idx === 0) {
        bgMusicSrc = null;
        break;
      }
      if (idx >= 1 && idx <= bgMusicFiles.length) {
        bgMusicSrc = `${activeBgMusicDir?.relative}/${bgMusicFiles[idx - 1]}`;
        break;
      }
      console.log('無効な番号です。');
    }

    const appealPlacementChoices = [
      '従来（1本目の後に顧客訴求 + 最後に業者訴求）',
      'まとめる（顧客訴求 + 業者訴求をどちらも最後に配置）',
    ];
    const pickedAppealPlacement = await choose(
      rl,
      '訴求動画の配置を選択',
      appealPlacementChoices
    );
    if (!pickedAppealPlacement) return null;
    const appealPlacement = pickedAppealPlacement.startsWith('まとめる')
      ? 'both-at-end'
      : 'split';

    return { ...basePicked, bgMusicSrc, appealPlacement };
  } finally {
    rl.close();
  }
};
