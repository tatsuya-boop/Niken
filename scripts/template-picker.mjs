import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const normalize = (s) => (s ?? '').trim();

const listTemplates = () => {
  const dir = path.resolve(process.cwd(), 'src', '編集指示');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => !name.startsWith('.') && !name.startsWith('._'))
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((fileName) => ({
      fileName,
      templateName: fileName.replace(/\.tsx$/i, ''),
    }));
};

export const pickTemplate = async () => {
  if (!process.stdin.isTTY) {
    throw new Error('対話選択にはTTYが必要です。ターミナルで実行してください。');
  }

  const templates = listTemplates();
  if (templates.length === 0) {
    throw new Error('src/編集指示 に TSX がありません。');
  }

  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  try {
    while (true) {
      console.log('\n使用するテンプレートTSXを選択');
      templates.forEach((tpl, i) => {
        console.log(`${String(i + 1).padStart(2, ' ')}. ${tpl.templateName}`);
      });
      const answer = normalize(await rl.question('番号（Enterでキャンセル）: '));
      if (!answer) return null;
      if (!/^\d+$/.test(answer)) {
        console.log('番号で入力してください。');
        continue;
      }
      const idx = Number(answer);
      if (idx >= 1 && idx <= templates.length) {
        return templates[idx - 1];
      }
      console.log('無効な番号です。');
    }
  } finally {
    rl.close();
  }
};
