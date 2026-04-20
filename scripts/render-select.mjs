#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pickMaterial } from './material-picker.mjs';
import { pickEffectSound } from './effect-picker.mjs';

const main = async () => {
  const picked = await pickMaterial({ includeVideoOptions: true });
  if (!picked) {
    console.log('キャンセルしました。');
    process.exit(130);
  }

  console.log(`\n選択: ${picked.materialKey}`);
  const pickedEffect = await pickEffectSound();
  if (!pickedEffect) {
    console.log('キャンセルしました。');
    process.exit(130);
  }
  console.log(`効果音: ${pickedEffect.fileName}`);

  const nodeBin = process.execPath;
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'render-completed.mjs');

  const args = [
    scriptPath,
    picked.materialKey,
    `--effect-sound=${pickedEffect.publicPath}`,
    `--appeal-placement=${picked.appealPlacement}`,
  ];
  if (picked.bgMusicSrc === null) {
    args.push('--no-bgm');
  } else if (picked.bgMusicSrc) {
    args.push(`--bgm=${picked.bgMusicSrc}`);
  }

  const result = spawnSync(nodeBin, args, { stdio: 'inherit' });

  process.exit(result.status ?? 1);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
