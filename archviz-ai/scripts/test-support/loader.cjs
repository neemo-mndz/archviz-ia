/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

// Run actual TypeScript modules in isolated tests; only explicit boundaries are replaced.
exports.makeLoader = (overrides = {}) => {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const localRequire = id => {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`);
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), `${id}.ts`));
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports);
    return mod.exports;
  }
  return load;
};
