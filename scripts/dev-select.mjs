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

  const remotionBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'remotion.cmd' : 'remotion'
  );
  const entryPoint = path.resolve(process.cwd(), 'src', 'index.ts');
  const inputProps = JSON.stringify({
    userName: picked.userName,
    propertyName: picked.propertyName,
  });

  const result = spawnSync(remotionBin, ['studio', entryPoint, `--props=${inputProps}`], {
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

