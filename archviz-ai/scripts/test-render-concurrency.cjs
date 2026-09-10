/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { makeLoader } = require('./test-support/loader.cjs');
const originalCwd = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archviz-concurrency-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

(async () => {
  let server;
  try {
    process.chdir(fixtureRoot);
    let starts = 0;
    const load = makeLoader({ '@/lib/agy-worker': { startAgyWorker: () => { starts++; } } });
    const { POST } = load('app/api/render/route.ts');
    server = http.createServer(async (req, res) => {
      try {
        const request = new Request('http://localhost/api/render', { method: 'POST', headers: req.headers, body: req, duplex: 'half' });
        const response = await POST(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) { res.writeHead(500); res.end(String(error)); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const send = origin => {
      const body = new FormData();
      body.set('image', new Blob([png], { type: 'image/png' }), 'scene.png');
      if (origin) body.set('origin', origin);
      return fetch(`http://127.0.0.1:${server.address().port}/api/render`, { method: 'POST', body });
    };
    const responses = await Promise.all([send(), send('sketchup')]);
    const statuses = responses.map(r => r.status).sort();
    const jobs = await load('lib/job-manager.ts').listJobs();
    console.log(JSON.stringify({ statuses, admitted: jobs.length, workerStarts: starts }));
    if (process.argv.includes('--expect-race')) {
      assert.deepEqual(statuses, [200, 200]);
      assert.equal(jobs.length, 2);
      console.log('REPRODUCED: two simultaneous HTTP POSTs admitted by the current route.');
    } else {
      assert.deepEqual(statuses, [200, 429]);
      assert.equal(jobs.length, 1);
      assert.equal(starts, 1);
      console.log('PASS: one admitted, one busy; existing HTTP success contract retained.');
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    process.chdir(originalCwd);
    assert.equal(path.dirname(fixtureRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixtureRoot).startsWith('archviz-concurrency-'));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
