import { spawnSync } from 'node:child_process';

const canRun = (cmd, args) => {
  const res = spawnSync(cmd, args, { stdio: 'ignore' });
  return res.status === 0;
};

export const resolvePythonCommand = () => {
  /**
   * Windows:
   * - `py -3` がある場合が多い（Python Launcher）
   * - 次に `python`
   * macOS/Linux:
   * - まず `python3`
   * - 次に `python`
   */
  if (process.platform === 'win32') {
    if (canRun('py', ['-3', '--version'])) {
      return { cmd: 'py', prefixArgs: ['-3'] };
    }
    if (canRun('python', ['--version'])) {
      return { cmd: 'python', prefixArgs: [] };
    }
    if (canRun('python3', ['--version'])) {
      return { cmd: 'python3', prefixArgs: [] };
    }
  } else {
    if (canRun('python3', ['--version'])) {
      return { cmd: 'python3', prefixArgs: [] };
    }
    if (canRun('python', ['--version'])) {
      return { cmd: 'python', prefixArgs: [] };
    }
  }

  return null;
};

