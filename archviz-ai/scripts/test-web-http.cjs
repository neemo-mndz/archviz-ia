/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:3001';
const comparison = process.argv[3] || 'http://127.0.0.1:3000';
const selects = html => [...html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)].map(match =>
  [...match[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(option =>
    ({ label: option[2], selected: option[1].includes('selected') })));

(async () => {
  const [before, after, options, health, recent] = await Promise.all([
    fetch(comparison), fetch(base), fetch(`${base}/api/render/options`),
    fetch(`${base}/api/health`), fetch(`${base}/api/jobs/recent`),
  ]);
  for (const response of [before, after, options, health, recent]) assert.equal(response.status, 200);
  const controls = selects(await after.text());
  assert.equal(controls.length, 9);
  assert.deepEqual(controls, selects(await before.text()));
  assert.equal(Object.keys((await options.json()).options).length, 9);
  const completed = (await recent.json()).jobs.find(job => job.status === 'completed');
  assert.ok(completed, 'A completed historical job is needed for this read-only check.');
  for (const suffix of ['', '/base', '/result', '/logs']) {
    assert.equal((await fetch(`${base}/api/render/${completed.id}${suffix}`)).status, 200);
  }
  console.log(JSON.stringify({ pageStatus: 200, identicalSelects: 9, optionsHealthRecent: 200, historicalJob: completed.id, statusBaseResultLogs: 200 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
