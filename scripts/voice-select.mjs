#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { pickMaterial } from './material-picker.mjs';
import { resolvePythonCommand } from './python-bin.mjs';

const normalize = (s) => (s ?? '').trim();
const GEMINI_SPEAKERS = [
  { label: '親しみやすい/女性', voice: 'Autonoe' },
  { label: '明るい/女性', voice: 'Achernar' },
  { label: '誠実/男性', voice: 'Umbriel' },
  { label: '信頼感/男性', voice: 'Algenib' },
];
const DEFAULT_GEMINI_VOICE =
  GEMINI_SPEAKERS.find(
    (s) =>
      s.voice.toLowerCase() === normalize(process.env.GEMINI_TTS_VOICE).toLowerCase()
  )?.voice ?? GEMINI_SPEAKERS[0].voice;

const unquote = (value) => {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
};

const loadDotenvLike = (envFilePath) => {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  const raw = fs.readFileSync(envFilePath, 'utf8');
  const nextEnv = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;

    const key = normalized.slice(0, eq).trim();
    const value = unquote(normalized.slice(eq + 1));
    if (!key) continue;
    nextEnv[key] = value;
  }
  return nextEnv;
};

const chooseEngine = async () => {
  if (!process.stdin.isTTY) {
    throw new Error('対話選択にはTTYが必要です。ターミナルで実行してください。');
  }

  const options = ['Voicebox', 'Gemini 3.1 Flash (Google AI Studio API)'];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      console.log('\n音声生成エンジンを選択');
      options.forEach((name, idx) => {
        console.log(`${String(idx + 1).padStart(2, ' ')}. ${name}`);
      });
      const answer = normalize(await rl.question('番号（Enterでキャンセル）: '));
      if (!answer) return null;
      if (!/^\d+$/.test(answer)) {
        console.log('番号で入力してください。');
        continue;
      }
      const idx = Number(answer);
      if (idx === 1) return 'voicebox';
      if (idx === 2) return 'gemini';
      console.log('無効な番号です。');
    }
  } finally {
    rl.close();
  }
};

const chooseGeminiVoice = async () => {
  if (!process.stdin.isTTY) {
    throw new Error('対話選択にはTTYが必要です。ターミナルで実行してください。');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      console.log('\nGemini スピーカーを選択');
      GEMINI_SPEAKERS.forEach((s, idx) => {
        const isDefault = s.voice === DEFAULT_GEMINI_VOICE ? ' (default)' : '';
        console.log(
          `${String(idx + 1).padStart(2, ' ')}. ${s.label} (${s.voice.toLowerCase()})${isDefault}`
        );
      });
      const answer = normalize(
        await rl.question(`番号（Enterでデフォルト: ${DEFAULT_GEMINI_VOICE}）: `)
      );
      if (!answer) return DEFAULT_GEMINI_VOICE;
      if (!/^\d+$/.test(answer)) {
        console.log('番号で入力してください。');
        continue;
      }
      const idx = Number(answer);
      if (idx >= 1 && idx <= GEMINI_SPEAKERS.length) {
        return GEMINI_SPEAKERS[idx - 1].voice;
      }
      console.log('無効な番号です。');
    }
  } finally {
    rl.close();
  }
};

const main = async () => {
  const picked = await pickMaterial();
  if (!picked) {
    console.log('キャンセルしました。');
    process.exit(130);
  }

  const engine = await chooseEngine();
  if (!engine) {
    console.log('キャンセルしました。');
    process.exit(130);
  }
  const geminiVoice = engine === 'gemini' ? await chooseGeminiVoice() : null;

  console.log(`\n選択: ${picked.materialKey}`);
  console.log(`エンジン: ${engine === 'gemini' ? 'Gemini 3.1 Flash' : 'Voicebox'}`);
  if (geminiVoice) {
    console.log(`スピーカー: ${geminiVoice}`);
  }

  const py = resolvePythonCommand();
  if (!py) {
    console.error(
      'Python が見つかりませんでした。Windows は `py` または `python`、Mac/Linux は `python3` または `python` を用意してください。'
    );
    process.exit(1);
  }
  const scriptPath = path.resolve(
    process.cwd(),
    '音声生成',
    'generate_voiceovers_from_metadata.py'
  );
  const envFromFile = loadDotenvLike(path.resolve(process.cwd(), '.env.local'));
  const childEnv = { ...process.env, ...envFromFile };

  const args = [scriptPath, picked.materialKey, '--engine', engine];
  if (geminiVoice) {
    args.push('--gemini-voice', geminiVoice);
  }
  const result = spawnSync(py.cmd, [...py.prefixArgs, ...args], {
    stdio: 'inherit',
    env: childEnv,
  });

  process.exit(result.status ?? 1);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
