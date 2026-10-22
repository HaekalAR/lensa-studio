/**
 * Vite's Windows realpath helper calls `net use` through a piped child process.
 * In restricted sandboxes that spawn is blocked (EPERM) and crashes the build.
 * We short-circuit only that exact probe, then hand control to Vite.
 * On Linux/macOS this wrapper is a no-op.
 */
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const originalExec = childProcess.exec.bind(childProcess);

childProcess.exec = function patchedExec(command, options, callback) {
  const args = [...arguments];
  const cb =
    typeof options === 'function'
      ? options
      : typeof callback === 'function'
        ? callback
        : null;

  if (command === 'net use') {
    if (cb) queueMicrotask(() => cb(null, '', ''));
    return undefined;
  }
  return originalExec(...args);
};

syncBuiltinESMExports();

const viteBin = path.resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js');
await import(pathToFileURL(viteBin).href);
