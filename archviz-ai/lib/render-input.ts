import sizeOf from 'image-size';
import { DEFAULT_RENDER_CONFIG, RENDER_OPTIONS } from '@/lib/render-options';
import { parseSketchUpScene, RenderInputError } from '@/lib/scene-validation';
import type { RenderOrigin } from '@/types/scene';

/** Enforce the body limit while reading, including chunked requests. */
export async function readRenderForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new RenderInputError('Expected multipart/form-data.');
  if (!request.body) throw new RenderInputError('No request body.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 22 * 1024 * 1024) {
        await reader.cancel();
        throw new RenderInputError('Upload excede 22 MiB.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
  } catch { throw new RenderInputError('Multipart inválido.'); }
}

export async function parseRenderInput(form: FormData) {
  const text = (key: string): string | undefined => {
    const value = form.get(key);
    if (value === null) return undefined;
    if (typeof value !== 'string') throw new RenderInputError(`Campo inválido: ${key}`);
    return value;
  };
  // origin is canonical; source is accepted as the alias from the approved plan.
  const originField = text('origin');
  const sourceField = text('source');
  if (originField !== undefined && sourceField !== undefined && originField !== sourceField) throw new RenderInputError('origin/source conflitantes.');
  const origin = originField ?? sourceField ?? 'web';
  if (origin !== 'web' && origin !== 'sketchup') throw new RenderInputError('Origem inválida.');
  const sceneText = text('scene');
  if (sceneText !== undefined && origin !== 'sketchup') throw new RenderInputError('Scene requer origin=sketchup.');
  const scene = sceneText === undefined ? undefined : parseSketchUpScene(sceneText);

  const config = { ...DEFAULT_RENDER_CONFIG };
  for (const key of Object.keys(RENDER_OPTIONS) as Array<keyof typeof RENDER_OPTIONS>) {
    const value = text(key) || DEFAULT_RENDER_CONFIG[key];
    if (!(RENDER_OPTIONS[key] as readonly string[]).includes(value)) throw new RenderInputError(`Configuração inválida: ${key}`);
    Object.assign(config, { [key]: value });
  }
  config.additionalInstructions = text('additionalInstructions') || '';
  if (origin === 'sketchup' && config.additionalInstructions.length > 4000) throw new RenderInputError('Observações excedem 4000 caracteres.', 413);

  const image = form.get('image');
  if (!image || typeof image === 'string') throw new RenderInputError('No image provided');
  const max = (origin === 'sketchup' ? 20 : 2) * 1024 * 1024;
  if (image.size > max) throw new RenderInputError('Imagem excede o limite permitido.', 413);
  const buffer = Buffer.from(await image.arrayBuffer());
  let dimensions;
  try { dimensions = sizeOf(buffer); } catch { throw new RenderInputError('Imagem inválida.'); }
  const allowed = origin === 'sketchup' ? ['png'] : ['png', 'jpg', 'webp'];
  if (!dimensions.type || !allowed.includes(dimensions.type)) throw new RenderInputError('Formato de imagem inválido.');
  if (origin === 'sketchup') {
    if (dimensions.width * dimensions.height > 16_000_000) throw new RenderInputError('Imagem excede 16 milhões de pixels.', 413);
    if (scene && (scene.viewport.width !== dimensions.width || scene.viewport.height !== dimensions.height)) throw new RenderInputError('Viewport e imagem têm dimensões diferentes.');
  }
  return { buffer, config, origin: origin as RenderOrigin, scene };
}
