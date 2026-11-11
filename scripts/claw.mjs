import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const proc = spawn(process.execPath, [resolve(root, 'node_modules/openclaw/openclaw.mjs'), ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, OPENCLAW_STATE_DIR: resolve(root, '.state'), OPENCLAW_CONFIG_PATH: resolve(root, '.state/openclaw.json') },
  stdio: 'inherit'
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => proc.kill(sig));
proc.on('error', err => { console.error(err.message); process.exitCode = 1; });
proc.on('exit', code => { process.exitCode = code ?? 1; });
