/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeLoader } = require('../../scripts/test-support/loader.cjs');
const load = makeLoader();
const { parseRenderInput } = load('lib/render-input.ts');
const { DEFAULT_RENDER_CONFIG } = load('lib/render-options.ts');
const evidence = path.resolve(__dirname, '../../docs/sketchup-phase2/evidence');
const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8'));

async function main() {
  for (const name of ['perspective', 'parallel', 'camera-moved', 'user-model']) {
    const scene = read(`${name}-scene.json`);
    const result = read(`${name}-result.json`);
    assert.equal(result.unchanged, true);
    assert.deepEqual(result.before, result.after);
    const png = fs.readFileSync(path.join(evidence, `${name}.png`));
    assert.equal(png.length, result.image_bytes);
    const form = new FormData();
    form.set('image', new Blob([png], { type: 'image/png' }), 'scene.png');
    form.set('origin', 'sketchup');
    form.set('scene', JSON.stringify(scene));
    for (const [key, value] of Object.entries(DEFAULT_RENDER_CONFIG)) form.set(key, value);
    // Invoke only the existing input parser. No HTTP, route, job or worker.
    const parsed = await parseRenderInput(form);
    assert.equal(parsed.origin, 'sketchup');
    assert.deepEqual(parsed.buffer, png);
    assert.deepEqual(parsed.scene.viewport, scene.viewport);
  }
  assert.equal(read('perspective-scene.json').scene.name, null);
  assert.equal(read('perspective-scene.json').camera.perspective, true);
  assert.equal(read('parallel-scene.json').camera.fovDegrees, null);
  assert.equal(read('parallel-scene.json').camera.perspective, false);
  assert.notDeepEqual(read('perspective-scene.json').camera.eye, read('camera-moved-scene.json').camera.eye);
  assert.equal(read('user-model-result.json').before.modified, false);
  assert.equal(read('ui-offline.json').captureDisabled, true);
  for (const name of ['ui-online.json', 'ui-online-recovered.json']) {
    assert.equal(read(name).captureDisabled, false);
    assert.equal(read(name).selects, 9);
    assert.match(read(name).health, /Engine online/);
  }
  assert.equal(read('ruby-checks.json').passed, 16);
  console.log('PASS: four real captures accepted by phase 1 parser; unchanged model/camera, projections, fresh camera and offline/online UI. No POST performed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
