import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sizeOf from 'image-size';
import { Job, JobStatus } from '@/types/job';
import { RenderConfig } from '@/types/render';

const JOBS_DIR = path.resolve(process.cwd(), 'jobs');
const STATUSES: JobStatus[] = ['pending', 'processing', 'completed', 'failed'];

/**
 * Verifica se um ID é um UUID válido.
 */
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Retorna o caminho do diretório do job, garantindo que não há path traversal.
 */
function getSecureJobDir(status: JobStatus, jobId: string): string {
  if (!isValidUUID(jobId)) {
    throw new Error('Invalid Job ID');
  }
  const targetDir = path.resolve(JOBS_DIR, status, jobId);
  if (!targetDir.startsWith(JOBS_DIR)) {
    throw new Error('Path traversal detected');
  }
  return targetDir;
}

/**
 * Inicializa a estrutura de diretórios do Job Manager se não existir.
 */
async function initJobManager() {
  for (const status of STATUSES) {
    const dir = path.join(JOBS_DIR, status);
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Localiza em qual diretório (status) um job específico se encontra atualmente.
 * Retorna o status e o caminho absoluto, ou null se não for encontrado.
 */
export async function locateJob(jobId: string): Promise<{ status: JobStatus, dir: string } | null> {
  if (!isValidUUID(jobId)) return null;

  for (const status of STATUSES) {
    const dir = getSecureJobDir(status, jobId);
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) {
        return { status, dir };
      }
    } catch {
      // Ignorar se não existir
    }
  }
  return null;
}

/**
 * Cria um novo job.
 */
export async function createJob(
  baseImageBuffer: Buffer,
  prompt: string,
  settings: RenderConfig
): Promise<Job> {
  await initJobManager();

  const jobId = crypto.randomUUID();
  const jobDir = getSecureJobDir('pending', jobId);
  
  await fs.mkdir(jobDir, { recursive: true });

  let inputWidth, inputHeight, inputAspectRatio;
  try {
    const dimensions = sizeOf(baseImageBuffer);
    inputWidth = dimensions.width;
    inputHeight = dimensions.height;
    if (inputWidth && inputHeight) {
      // Calculate a simplified ratio for display, or just store the actual values.
      // Usually users just want to know WxH, but we can try to guess the ratio.
      // We will just store the W:H simplified if needed, or just let the frontend calculate it.
      // For now, we store exactly the requested ratio from settings as `requestedAspectRatio`.
    }
  } catch(e) {
    console.error('Error reading image dimensions:', e);
  }

  const job: Job = {
    id: jobId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    source: 'base.png',
    output: 'render.png',
    settings,
    inputWidth,
    inputHeight,
    requestedAspectRatio: settings.aspectRatio,
    requestedResolution: settings.resolution
  };

  // Write base.png
  await fs.writeFile(path.join(jobDir, 'base.png'), baseImageBuffer);
  
  // Write prompt.md
  await fs.writeFile(path.join(jobDir, 'prompt.md'), prompt, 'utf-8');
  
  // Write job.json
  await fs.writeFile(path.join(jobDir, 'job.json'), JSON.stringify(job, null, 2), 'utf-8');

  return job;
}

/**
 * Lê o job atual do sistema de arquivos.
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const location = await locateJob(jobId);
  if (!location) return null;

  try {
    const jobJsonPath = path.join(location.dir, 'job.json');
    const content = await fs.readFile(jobJsonPath, 'utf-8');
    const job = JSON.parse(content) as Job;
    // A folder move can be blocked by Windows after completion was persisted.
    // Terminal metadata remains authoritative even in the processing folder.
    if (job.status !== 'completed' && job.status !== 'failed') {
      job.status = location.status;
    }
    return job;
  } catch (error) {
    console.error(`Erro ao ler job ${jobId}:`, error);
    return null;
  }
}

/**
 * Obtém o caminho absoluto do render.png, caso o job esteja completed.
 */
export async function getJobResultPath(jobId: string): Promise<string | null> {
  const job = await getJob(jobId);
  if (job?.status !== 'completed') return null;
  const location = await locateJob(jobId);
  if (!location) return null;

  const resultPath = path.join(location.dir, 'render.png');
  try {
    const stat = await fs.stat(resultPath);
    if (stat.isFile()) {
      return resultPath;
    }
  } catch {
    // Ignorar se não existir
  }
  return null;
}

export async function listJobs(): Promise<Job[]> {
  const ids = new Set<string>();
  for (const status of STATUSES) {
    try {
      for (const id of await fs.readdir(path.join(JOBS_DIR, status))) ids.add(id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const jobs = await Promise.all([...ids].map(getJob));
  return jobs.filter((job): job is Job => job !== null);
}
