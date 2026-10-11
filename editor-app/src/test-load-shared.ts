import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Carica public/shared/media.js nei globali (come farebbe il <script> classico nel browser).
export function loadSharedGlobals(): void {
  const file = path.resolve(import.meta.dirname, '../../public/shared/media.js');
  const code = fs.readFileSync(file, 'utf8');
  const sandbox: Record<string, unknown> = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  // Le dichiarazioni `function` top-level finiscono sul global del contesto,
  // le `const` solo in module.exports.
  const exported = (sandbox.module as { exports: Record<string, unknown> }).exports;
  for (const k of Object.keys(sandbox)) if (k !== 'module' && k !== 'console') (globalThis as Record<string, unknown>)[k] = sandbox[k];
  Object.assign(globalThis, exported);
}
