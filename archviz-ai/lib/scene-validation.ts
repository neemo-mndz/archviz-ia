import type { SketchUpScene, Vector3 } from '@/types/scene';

export class RenderInputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

const fail = (field: string): never => { throw new RenderInputError(`Scene inválida: ${field}`); };
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(field);
  return value as Record<string, unknown>;
}
function name(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 256) return fail(field);
  return value;
}
function number(value: unknown, field: string, min = -1e12, max = 1e12): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(field);
  return value;
}
function integer(value: unknown, field: string, min = 0, max = 1e9): number {
  const result = number(value, field, min, max);
  return Number.isInteger(result) ? result : fail(field);
}
function bool(value: unknown, field: string): boolean {
  return typeof value === 'boolean' ? value : fail(field);
}
function vector(value: unknown, field: string): Vector3 {
  if (!Array.isArray(value) || value.length !== 3) return fail(field);
  return value.map(v => number(v, field)) as Vector3;
}
function array(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value)) return fail(field);
  if (value.length > max) throw new RenderInputError(`Scene excede o limite de ${field}: ${max}`, 413);
  return value;
}

/** Project only known fields. Metadata never supplies paths or executable commands. */
export function parseSketchUpScene(text: string): SketchUpScene {
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new RenderInputError('Scene excede 1 MiB.', 413);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return fail('JSON'); }
  const root = record(parsed, 'root');
  if (root.schemaVersion !== '1.0' || root.source !== 'sketchup') return fail('schemaVersion/source');
  if (root.units !== undefined && root.units !== 'inch') return fail('units');
  const view = record(root.viewport, 'viewport');
  const camera = record(root.camera, 'camera');
  const scene = record(root.scene, 'scene');
  const model = record(root.model, 'model');
  const perspective = bool(camera.perspective, 'camera.perspective');
  const width = integer(view.width, 'viewport.width', 1, 16000);
  const height = integer(view.height, 'viewport.height', 1, 16000);
  if (width * height > 16_000_000) throw new RenderInputError('Viewport excede 16 milhões de pixels.', 413);
  const up = vector(camera.up, 'camera.up');
  if (up.every(v => v === 0)) return fail('camera.up');
  const materials = array(root.materials, 'materials', 200).map(value => {
    const item = record(value, 'material');
    const output: SketchUpScene['materials'][number] = { name: name(item.name, 'material.name') };
    if (item.color !== undefined) {
      if (typeof item.color !== 'string' || !/^#[\da-f]{6}$/i.test(item.color)) return fail('material.color');
      output.color = item.color;
    }
    if (item.opacity !== undefined) output.opacity = number(item.opacity, 'material.opacity', 0, 1);
    if (item.texture === null) output.texture = null;
    else if (item.texture !== undefined) {
      const texture = record(item.texture, 'texture');
      const textureName = name(texture.name, 'texture.name');
      if (/[\\/:]/.test(textureName) || textureName === '..') return fail('texture.name must be a basename');
      output.texture = { name: textureName, width: number(texture.width, 'texture.width', 0), height: number(texture.height, 'texture.height', 0) };
    }
    return output;
  });
  const objects = array(root.objects, 'objects', 1000).map((value): SketchUpScene['objects'][number] => {
    const item = record(value, 'object');
    if (item.type !== 'group' && item.type !== 'component') return fail('object.type');
    return {
      name: name(item.name, 'object.name'), definitionName: name(item.definitionName, 'object.definitionName'),
      type: item.type, material: name(item.material, 'object.material'),
      tag: name(item.tag, 'object.tag'), hidden: bool(item.hidden, 'object.hidden'),
    };
  });
  let geometryFacts: SketchUpScene['geometryFacts'];
  if (root.geometryFacts !== undefined) {
    const facts = record(root.geometryFacts, 'geometryFacts');
    const surfaces = array(facts.surfaces, 'geometryFacts.surfaces', 200).map((value): NonNullable<SketchUpScene['geometryFacts']>['surfaces'][number] => {
      const item = record(value, 'geometryFacts.surface');
      const output: NonNullable<SketchUpScene['geometryFacts']>['surfaces'][number] = {
        id: name(item.id, 'geometryFacts.surface.id'),
        scope: name(item.scope, 'geometryFacts.surface.scope'),
        area: number(item.area, 'geometryFacts.surface.area', 0),
        normal: vector(item.normal, 'geometryFacts.surface.normal'),
        loopCount: integer(item.loopCount, 'geometryFacts.surface.loopCount', 1, 100000),
        innerLoopCount: integer(item.innerLoopCount, 'geometryFacts.surface.innerLoopCount', 0, 100000),
      };
      if (item.ownerName !== undefined) output.ownerName = name(item.ownerName, 'geometryFacts.surface.ownerName');
      if (item.tag !== undefined) output.tag = name(item.tag, 'geometryFacts.surface.tag');
      return output;
    });
    geometryFacts = {
      surfaceCount: integer(facts.surfaceCount, 'geometryFacts.surfaceCount', 0, 1000000),
      reportedSurfaceCount: integer(facts.reportedSurfaceCount, 'geometryFacts.reportedSurfaceCount', 0, 200),
      surfacesWithInnerLoops: integer(facts.surfacesWithInnerLoops, 'geometryFacts.surfacesWithInnerLoops', 0, 1000000),
      continuousSurfaces: integer(facts.continuousSurfaces, 'geometryFacts.continuousSurfaces', 0, 1000000),
      collectionLimit: integer(facts.collectionLimit, 'geometryFacts.collectionLimit', 1, 200),
      strategy: name(facts.strategy, 'geometryFacts.strategy'),
      surfaces,
    };
  }
  const materialCount = integer(model.materialCount, 'model.materialCount');
  const objectCount = integer(model.objectCount, 'model.objectCount');
  if (materialCount < materials.length || objectCount < objects.length) return fail('model counts');
  return {
    schemaVersion: '1.0', source: 'sketchup', units: 'inch', viewport: { width, height },
    camera: {
      eye: vector(camera.eye, 'camera.eye'), target: vector(camera.target, 'camera.target'), up,
      perspective,
      fovDegrees: perspective ? number(camera.fovDegrees, 'camera.fovDegrees', 0.01, 179.99) : null,
      ...(camera.aspectRatio !== undefined ? { aspectRatio: number(camera.aspectRatio, 'camera.aspectRatio', 0, 100) } : {}),
    },
    scene: { name: scene.name === null ? null : name(scene.name, 'scene.name') },
    model: { name: name(model.name, 'model.name'), materialCount, objectCount }, materials, objects,
    ...(geometryFacts ? { geometryFacts } : {}),
  };
}
