/**
 * run-loop-direct.mjs
 * Direct execution of the autonomous distribution loop — bypasses HTTP/auth layer.
 * Seeds patentAlerts, registers a test partner, then runs the loop.
 *
 * Usage: node scripts/run-loop-direct.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Patch tsx/register for TypeScript imports
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// We need to run this via tsx, so this file is a launcher only.
// The actual logic is in run-loop-direct-impl.ts
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const impl = path.join(__dirname, 'run-loop-direct-impl.ts');

console.log('[launcher] Starting via tsx...');
execSync(`node ${path.join(__dirname, '../node_modules/.bin/tsx')} ${impl}`, {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' },
  cwd: path.join(__dirname, '..'),
});
