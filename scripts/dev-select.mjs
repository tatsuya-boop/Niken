#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
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

  const remotionBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'remotion.cmd' : 'remotion'
  );
  const entryPoint = path.resolve(process.cwd(), 'src', 'index.ts');
  const inputProps = {
    userName: picked.userName,
    propertyName: picked.propertyName,
    effectSoundSrc: pickedEffect.publicPath,
    bgMusicSrc: picked.bgMusicSrc,
    appealPlacement: picked.appealPlacement,
  };

  // Pass props via file to avoid Windows quoting issues.
  const propsPath = path.join(
    os.tmpdir(),
    `margo-remotion-props.${process.pid}.${Date.now()}.json`
  );
  fs.writeFileSync(propsPath, JSON.stringify(inputProps), 'utf8');

  const result = spawnSync(remotionBin, ['studio', entryPoint, `--props=${propsPath}`], {
    stdio: 'inherit',
    // On Windows, `.cmd` files can fail to spawn depending on environment.
    // Running through the shell makes execution more reliable.
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
