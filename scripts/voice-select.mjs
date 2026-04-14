#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pickMaterial } from './material-picker.mjs';
import { resolvePythonCommand } from './python-bin.mjs';

const main = async () => {
  const picked = await pickMaterial();
  if (!picked) {
    console.log('キャンセルしました。');
    process.exit(130);
  }

  console.log(`\n選択: ${picked.materialKey}`);

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

  const result = spawnSync(py.cmd, [...py.prefixArgs, scriptPath, picked.materialKey], {
    stdio: 'inherit',
  });

  process.exit(result.status ?? 1);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

