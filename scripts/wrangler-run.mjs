import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tmp = path.join(root, '.wrangler-tmp');
const config = path.join(root, '.wrangler-config');
fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(config, { recursive: true });

const cli = path.resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    XDG_CONFIG_HOME: config,
    WRANGLER_HOME: config,
    TMP: tmp,
    TEMP: tmp,
    WRANGLER_SEND_METRICS: 'false',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
