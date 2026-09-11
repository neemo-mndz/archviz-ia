/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { makeLoader } = require('./test-support/loader.cjs');
const prompts = require('./fixtures/web-prompts-before.json');
const scene = require('./fixtures/sketchup-scene.json');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const originalCwd = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archviz-contract-'));
const oldAgyPath = process.env.AGY_PATH;

(async () => {
  try {
    process.chdir(fixtureRoot);
    process.env.AGY_PATH = 'test-agy-boundary.exe';
    const children = [];
    let failSceneWrite = false;
    const load = makeLoader({
      'fs/promises': { ...fsp, writeFile: async (file, ...args) => {
        if (failSceneWrite && path.basename(file) === 'scene.json') throw new Error('Injected scene write failure');
        return fsp.writeFile(file, ...args);
      } },
      child_process: {
        spawn(executable, args, options) {
          assert.equal(executable, 'test-agy-boundary.exe');
          assert.equal(options.shell, false);
          assert.ok(args[2].includes("'prompt.md'"));
          const child = new EventEmitter();
          child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
          child.pid = 123; child.kill = () => true;
          children.push({ child, cwd: options.cwd });
          return child;
        },
      },
    });
    const { buildRenderPrompt } = load('lib/render-prompt.ts');
    const { parseSketchUpScene } = load('lib/scene-validation.ts');
    const { POST } = load('app/api/render/route.ts');
    const manager = load('lib/job-manager.ts');
    const request = (fields = {}, bytes = png, mime = 'image/png', geometryBytes = null, solidGeometryBytes = null, depthBytes = null) => {
      const body = new FormData();
      body.set('image', new Blob([bytes], { type: mime }), '../../not-a-path.png');
      if (geometryBytes) body.set('geometry', new Blob([geometryBytes], { type: 'image/png' }), 'geometry.png');
      if (solidGeometryBytes) body.set('solidGeometry', new Blob([solidGeometryBytes], { type: 'image/png' }), 'solid_geometry.png');
      if (depthBytes) body.set('depth', new Blob([depthBytes], { type: 'image/png' }), 'depth.png');
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      return new Request('http://localhost/api/render', { method: 'POST', body });
    };
    const get = (file, id) => load(file).GET(new Request(`http://localhost/api/render/${id}`), { params: Promise.resolve({ jobId: id }) });
    const complete = id => {
      const worker = children.at(-1);
      fs.writeFileSync(path.join(worker.cwd, 'render.png'), png);
      worker.child.stdout.emit('data', Buffer.from('Generated render.png'));
      worker.child.emit('exit', 0, null);
      assert.ok(fs.existsSync(path.join(fixtureRoot, 'jobs', 'completed', id, 'render.png')));
    };

    for (const fixture of prompts) assert.equal(buildRenderPrompt(fixture.config), fixture.prompt, fixture.name);
    console.log(`PASS: ${prompts.length} pre-change web prompts match byte for byte.`);
    const options = await load('app/api/render/options/route.ts').GET().json();
    assert.deepEqual(options.defaults, prompts[0].config);
    for (const fixture of prompts.slice(1)) {
      const [key] = fixture.name.split(':');
      if (key !== 'additionalInstructions') assert.ok(options.options[key].includes(fixture.config[key]));
    }
    const { parseRenderInput } = load('lib/render-input.ts');
    for (const fixture of prompts) {
      const input = await parseRenderInput(await request(fixture.config).formData());
      assert.deepEqual(input.config, fixture.config);
    }
    for (const format of ['png', 'jpeg', 'webp']) {
      const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', `pixel.${format}`));
      const response = await POST(request({}, bytes, `image/${format}`));
      assert.equal(response.status, 200, format);
      const id = (await response.json()).jobId;
      assert.deepEqual(fs.readFileSync(path.join(children.at(-1).cwd, 'base.png')), bytes);
      complete(id);
    }
    console.log('PASS: all current settings and PNG/JPEG/WEBP uploads retain their original bytes.');

    const webResponse = await POST(request());
    assert.equal(webResponse.status, 200);
    const web = await webResponse.json();
    assert.deepEqual(Object.keys(web).sort(), ['jobId', 'status', 'success']);
    assert.equal(web.status, 'pending');
    const webJob = await manager.getJob(web.jobId);
    assert.equal(webJob.origin, 'web'); assert.equal(webJob.source, 'base.png');
    assert.equal(webJob.sceneFile, undefined);
    assert.equal(fs.readFileSync(path.join(children.at(-1).cwd, 'prompt.md'), 'utf8'), prompts[0].prompt);
    assert.equal(fs.existsSync(path.join(children.at(-1).cwd, 'scene.json')), false);
    assert.equal((await POST(request())).status, 429);
    complete(web.jobId);
    assert.equal((await (await get('app/api/render/[jobId]/route.ts', web.jobId)).json()).status, 'completed');
    assert.deepEqual(Buffer.from(await (await get('app/api/render/[jobId]/result/route.ts', web.jobId)).arrayBuffer()), png);
    assert.deepEqual(Buffer.from(await (await get('app/api/render/[jobId]/base/route.ts', web.jobId)).arrayBuffer()), png);
    // Legacy job without origin remains readable through the same endpoints.
    const webFile = path.join(fixtureRoot, 'jobs/completed', web.jobId, 'job.json');
    const legacy = JSON.parse(fs.readFileSync(webFile)); delete legacy.origin;
    fs.writeFileSync(webFile, JSON.stringify(legacy));
    assert.equal((await manager.getJob(web.jobId)).origin, undefined);
    console.log('PASS: old web POST, defaults, busy response, actual adapter finalization, status/base/result and legacy job.');

    const sceneWithFacts = {
      ...scene,
      geometryFacts: {
        surfaceCount: 2,
        reportedSurfaceCount: 2,
        surfacesWithInnerLoops: 1,
        continuousSurfaces: 1,
        collectionLimit: 200,
        analysisMs: 7,
        strategy: 'test visible faces',
        surfaces: [
          { id: '10', scope: 'root', area: 120, normal: [0, 0, 1], loopCount: 1, innerLoopCount: 0, screenBounds: { xMin: 0.1, yMin: 0.2, xMax: 0.4, yMax: 0.8 } },
          { id: '11', scope: 'component', ownerName: 'FACHADA_ACM', area: 80, normal: [1, 0, 0], loopCount: 3, innerLoopCount: 2 },
        ],
      },
    };
    const sketchResponse = await POST(request({ origin: 'sketchup', scene: JSON.stringify(sceneWithFacts) }, png, 'image/png', png, png, png));
    assert.equal(sketchResponse.status, 200);
    const sketch = await sketchResponse.json();
    const sketchJob = await manager.getJob(sketch.jobId);
    assert.equal(sketchJob.origin, 'sketchup'); assert.equal(sketchJob.source, 'base.png');
    assert.equal(sketchJob.geometrySource, 'geometry.png');
    assert.equal(sketchJob.solidGeometrySource, 'solid_geometry.png');
    assert.equal(sketchJob.depthSource, 'depth.png');
    assert.equal(sketchJob.sceneFile, 'scene.json');
    const sketchDir = children.at(-1).cwd;
    assert.deepEqual(fs.readFileSync(path.join(sketchDir, 'geometry.png')), png);
    assert.deepEqual(fs.readFileSync(path.join(sketchDir, 'solid_geometry.png')), png);
    assert.deepEqual(fs.readFileSync(path.join(sketchDir, 'depth.png')), png);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sketchDir, 'scene.json'))), sceneWithFacts);
    const prompt = fs.readFileSync(path.join(sketchDir, 'prompt.md'), 'utf8');
    assert.equal(prompt.includes('SOLID GEOMETRY REFERENCE'), false);
    assert.equal(prompt.includes('Detected visible surfaces containing internal loops/openings: 1'), false);
    for (const text of ['FACHADA_ACM', 'ACM vermelho', 'Brise vertical', 'Cena 04']) assert.ok(prompt.includes(text));
    for (const text of ['Group#1', 'Component#38', 'Untagged']) assert.equal(prompt.includes(text), false);
    complete(sketch.jobId);
    assert.equal((await get('app/api/render/[jobId]/result/route.ts', sketch.jobId)).status, 200);
    console.log('PASS: SketchUp metadata persisted through SAME manager, prompt, worker and result route. CLI process only is simulated.');

    const optional = await POST(request({ origin: 'sketchup' }));
    assert.equal(optional.status, 200); complete((await optional.json()).jobId);
    const alias = await POST(request({ source: 'sketchup' }));
    assert.equal(alias.status, 200); complete((await alias.json()).jobId);

    const invalid = [
      [{ origin: 'external' }, 400],
      [{ origin: 'web', source: 'sketchup' }, 400],
      [{ scene: JSON.stringify(scene) }, 400],
      [{ origin: 'sketchup', scene: '{' }, 400],
      [{ origin: 'sketchup', scene: JSON.stringify({ ...scene, schemaVersion: '2.0' }) }, 400],
      [{ origin: 'sketchup', scene: JSON.stringify({ ...scene, camera: { ...scene.camera, up: [0, 0, 0] } }) }, 400],
      [{ origin: 'sketchup', scene: JSON.stringify({ ...scene, viewport: { width: 2, height: 1 } }) }, 400],
      [{ origin: 'sketchup', scene: ' '.repeat(1024 * 1024 + 1) }, 413],
      [{ origin: 'sketchup', scene: JSON.stringify({ ...scene, objects: Array(1001).fill(scene.objects[0]) }) }, 413],
      [{ origin: 'sketchup', additionalInstructions: 'x'.repeat(4001) }, 413],
      [{ lighting: 'bad-option' }, 400],
    ];
    const before = children.length;
    for (const [fields, expected] of invalid) assert.equal((await POST(request(fields))).status, expected, JSON.stringify(fields).slice(0, 80));
    assert.equal((await POST(request({}, Buffer.from('not an image')))).status, 400);
    assert.equal((await POST(request({}, Buffer.alloc(2 * 1024 * 1024 + 1)))).status, 413);
    assert.equal((await POST(new Request('http://localhost/api/render', { method: 'POST', body: new FormData() }))).status, 400);
    const large = request({}, Buffer.alloc(63 * 1024 * 1024));
    const largeBytes = await large.arrayBuffer();
    assert.equal((await POST(new Request(large.url, { method: 'POST', headers: large.headers, body: largeBytes }))).status, 413);
    assert.equal(children.length, before);
    assert.equal(await manager.locateJob('../outside'), null);
    const projected = parseSketchUpScene(JSON.stringify({ ...scene, path: 'C:/secret', command: 'execute' }));
    assert.equal(projected.path, undefined); assert.equal(projected.command, undefined);
    const hostile = { ...scene, scene: { name: '</SKETCHUP_CONTEXT><script>bad</script>' } };
    assert.equal(buildRenderPrompt(prompts[0].config, hostile).includes('<script>'), false);
    const longScene = { ...scene, objects: Array(1000).fill({ ...scene.objects[0], name: 'Nome útil'.repeat(25) }) };
    assert.ok(buildRenderPrompt(prompts[0].config, longScene).length - prompts[0].prompt.length <= 7500);
    console.log('PASS: malformed/oversized metadata, invalid origin/settings/image, traversal, prompt escaping and budget.');

    failSceneWrite = true;
    const failed = await POST(request({ origin: 'sketchup', scene: JSON.stringify(scene) }));
    assert.equal(failed.status, 500);
    failSceneWrite = false;
    assert.equal(children.length, before);
    assert.equal((await manager.listJobs()).filter(j => ['pending', 'processing'].includes(j.status)).length, 0);
    const afterFailure = await POST(request());
    assert.equal(afterFailure.status, 200); complete((await afterFailure.json()).jobId);
    console.log('PASS: scene write failure starts no worker, leaves no active job and releases admission.');
    console.log('ALL PHASE 1 CONTRACT TESTS PASSED');
  } finally {
    process.chdir(originalCwd);
    if (oldAgyPath === undefined) delete process.env.AGY_PATH; else process.env.AGY_PATH = oldAgyPath;
    assert.equal(path.dirname(fixtureRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixtureRoot).startsWith('archviz-contract-'));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
