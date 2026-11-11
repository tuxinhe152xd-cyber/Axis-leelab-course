import { mkdir, writeFile, access, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const state = resolve(root, '.state');
await mkdir(state, { recursive: true, mode: 0o700 });
await chmod(state, 0o700);
const configPath = resolve(state, 'openclaw.json');
let exists = false;
try { await access(configPath); exists = true; } catch {}
if (!exists) {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
  if (name && (!/^[a-zA-Z0-9-]+$/.test(name) || !/^[a-zA-Z0-9.-]+$/.test(domain))) throw new Error('Invalid Codespaces hostname');
  const config = {
    gateway: {
      mode: 'local', bind: 'loopback', port: 18789,
      auth: { mode: 'token', token: randomBytes(32).toString('hex') },
      controlUi: { allowedOrigins: name ? [`https://${name}-18789.${domain}`] : ['http://127.0.0.1:18789'] }
    },
    agents: { defaults: { workspace: resolve(root, 'workspace') } },
    session: { dmScope: 'per-channel-peer' },
    tools: {
      profile: 'messaging',
      deny: ['group:automation', 'group:runtime', 'group:fs', 'sessions_spawn', 'sessions_send'],
      fs: { workspaceOnly: true },
      exec: { security: 'deny', ask: 'always' },
      elevated: { enabled: false },
      sessions: { visibility: 'agent' },
      agentToAgent: { enabled: false }
    }
  };
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  console.log('Created isolated lab config. No personal OpenClaw settings were copied.');
} else console.log('Keeping existing lab config and token.');
console.log('Next: npm run claw -- config validate');
console.log('Model and LINE authentication are not configured yet. Data tools are not enabled.');
