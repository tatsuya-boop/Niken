#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pickMaterial } from './material-picker.mjs';

const main = async () => {
  const picked = await pickMaterial();
  if (!picked) {
    console.log('キャンセルしました。');
    process.exit(130);
  }

  console.log(`\n選択: ${picked.materialKey}`);

  const python = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.resolve(
    process.cwd(),
    '音声生成',
    'generate_voiceovers_from_metadata.py'
  );

  const result = spawnSync(python, [scriptPath, picked.materialKey], {
    stdio: 'inherit',
  });

  process.exit(result.status ?? 1);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

