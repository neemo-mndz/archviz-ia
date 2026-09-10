/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');

// Exercise the real manager against isolated files, without invoking the renderer.
const source = fs.readFileSync(path.join(__dirname, '../lib/job-manager.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const originalCwd = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archviz-status-'));

(async () => {
  try {
    process.chdir(fixtureRoot);
    const loaded = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports);
    const { getJob, getJobResultPath, listJobs } = loaded.exports;
    const ids = {};
    for (const status of ['completed', 'failed', 'processing']) {
      const id = ids[status] = randomUUID();
      const dir = path.join(fixtureRoot, 'jobs', 'processing', id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ id, status }));
      fs.writeFileSync(path.join(dir, 'render.png'), 'fixture');
      assert.equal((await getJob(id)).status, status);
    }
    assert.ok(await getJobResultPath(ids.completed));
    assert.equal(await getJobResultPath(ids.failed), null);
    assert.equal(await getJobResultPath(ids.processing), null);
    const active = (await listJobs()).filter(job => ['pending', 'processing'].includes(job.status));
    assert.deepEqual(active.map(job => job.id), [ids.processing]);
    assert.equal(await getJob('../outside'), null);
    console.log('PASS: terminal status survives blocked folder moves; result and active queue agree.');
  } finally {
    process.chdir(originalCwd);
    if (path.dirname(fixtureRoot) !== path.resolve(os.tmpdir()) || !path.basename(fixtureRoot).startsWith('archviz-status-')) {
      throw new Error('Unexpected fixture cleanup path');
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
