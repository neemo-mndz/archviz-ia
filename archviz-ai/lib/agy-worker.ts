import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import sizeOf from 'image-size';
import { Job, JobStatus } from '@/types/job';

const runningWorkers = new Map<string, ChildProcess>();

type AgyInstructionJob = Pick<Job, 'source' | 'geometrySource' | 'solidGeometrySource' | 'depthSource'>;
type AgyInputImageCandidate = { order: number; role: string; file?: string };

function resolveAgyPath(): string {
  if (process.env.AGY_PATH) {
    return process.env.AGY_PATH;
  }
  
  try {
    const output = execFileSync('where.exe', ['agy'], { encoding: 'utf-8' });
    const paths = output.trim().split('\r\n');
    if (paths.length > 0 && paths[0]) {
      return paths[0];
    }
  } catch (err) {
    // Falha ao executar where.exe ou não encontrou
  }
  
  throw new Error('Antigravity CLI (agy) não encontrado pelo backend. Configure AGY_PATH ou reinicie o servidor após instalar o CLI.');
}

function updateJobStatusSync(jobDir: string, status: JobStatus, errorMsg?: string) {
  try {
    const jobFile = path.join(jobDir, 'job.json');
    if (fs.existsSync(jobFile)) {
      const data = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
      data.status = status;
      if (errorMsg) data.error = errorMsg;
      fs.writeFileSync(jobFile, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Falha ao atualizar job.json de forma síncrona:', e);
  }
}

function moveDirSync(src: string, dest: string, retries = 20) {
  try {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
    }
  } catch (e: any) {
    if (['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(e.code) && retries > 0) {
      console.warn(`[RETRY] ${e.code} ao mover ${src}, tentando novamente em 500ms...`);
      setTimeout(() => moveDirSync(src, dest, retries - 1), 500);
      return;
    }
    console.error(`Falha ao mover ${src} para ${dest}:`, e);
  }
}

function getJobDirSync(jobId: string): string | null {
  const baseJobs = path.resolve(process.cwd(), 'jobs');
  const dirs = ['pending', 'processing', 'completed', 'failed'];
  for (const d of dirs) {
    const dirPath = path.join(baseJobs, d, jobId);
    if (fs.existsSync(dirPath)) {
      return dirPath;
    }
  }
  return null;
}

function logToWorker(jobId: string, message: string, knownDir?: string) {
  // If knownDir is provided, we don't need to scan directories.
  const currentDir = knownDir || getJobDirSync(jobId);
  if (!currentDir) return;
  
  const logFile = path.join(currentDir, 'worker.log');
  const timestamp = new Date().toISOString();
  try {
    // Keep the log handle closed before a job directory is moved on Windows.
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error(`Erro ao escrever no worker.log do job ${jobId}:`, err);
    }
  }
}

function collectAgyInputImages(processingDir: string, jobData: AgyInstructionJob | null) {
  const candidates: AgyInputImageCandidate[] = [
    { order: 1, role: 'base visual reference', file: jobData?.source || 'base.png' },
    { order: 2, role: 'geometry edge/line reference', file: jobData?.geometrySource },
    { order: 3, role: 'solid mass/occupancy reference', file: jobData?.solidGeometrySource },
    { order: 4, role: 'depth spatial reference', file: jobData?.depthSource },
  ];

  return candidates
    .filter((candidate): candidate is AgyInputImageCandidate & { file: string } => (
      typeof candidate.file === 'string' && candidate.file.length > 0
    ))
    .map((candidate) => {
      const filePath = path.join(processingDir, candidate.file);
      let bytes = 0;
      let width: number | undefined;
      let height: number | undefined;

      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        bytes = buffer.length;
        try {
          const dimensions = sizeOf(buffer);
          width = dimensions.width;
          height = dimensions.height;
        } catch(e) {
          // Keep the image entry; dimensions are diagnostic only.
        }
      }

      return { ...candidate, bytes, width, height };
    })
    .filter((candidate) => candidate.bytes > 0);
}

export function startAgyWorker(jobId: string, pendingJobDir: string) {
  if (runningWorkers.has(jobId)) {
    throw new Error(`Worker for job ${jobId} is already running.`);
  }

  const baseJobs = path.resolve(process.cwd(), 'jobs');
  const processingDir = path.join(baseJobs, 'processing', jobId);
  const agyPath = resolveAgyPath();
  
  // 1. Move from pending to processing
  moveDirSync(pendingJobDir, processingDir);
  
  // 2. Update job.json
  const startedAt = new Date().toISOString();
  let jobDataForInstruction: AgyInstructionJob | null = null;
  try {
    const jobFile = path.join(processingDir, 'job.json');
    if (fs.existsSync(jobFile)) {
      const data = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
      data.status = 'processing';
      data.startedAt = startedAt;
      fs.writeFileSync(jobFile, JSON.stringify(data, null, 2), 'utf-8');
      jobDataForInstruction = data as AgyInstructionJob;
    }
  } catch (e) {
    console.error('Falha ao atualizar startedAt:', e);
  }

  logToWorker(jobId, `Starting worker for jobId: ${jobId}`, processingDir);
  logToWorker(jobId, `Job moved to processing dir: ${processingDir}`, processingDir);

  const inputImages = collectAgyInputImages(processingDir, jobDataForInstruction);
  logToWorker(jobId, 'Antigravity input images:', processingDir);
  inputImages.forEach((image) => {
    const dimensions = image.width && image.height ? ` ${image.width}x${image.height}` : '';
    logToWorker(jobId, `${image.order}. ${image.file} (${image.role}) bytes=${image.bytes}${dimensions}`, processingDir);
  });

  const imageInstructions = inputImages
    .map((image) => `${image.order}. ${image.file} - ${image.role}`)
    .join('\n');

  const instruction = `You are the ArchViz worker. Go to the directory: ${processingDir.replace(/\\/g, '/')}. Read the file 'prompt.md' and edit 'base.png' exactly as instructed.

Input images are available in this exact order:
${imageInstructions}

Use image 1 as the base visual reference. When images 2, 3, or 4 are present, use them only as structural references for geometry, mass/occupancy, and depth. Preserve the ordered roles above. Save the resulting image EXACTLY as 'render.png' in the same directory. DO NOT modify 'job.json'. DO NOT move the directory. Just generate and save 'render.png' and exit.`;

  logToWorker(jobId, `Resolved agy path: ${agyPath}`, processingDir);

  const worker = spawn(
    /*turbopackIgnore: true*/ agyPath,
    [
      '--dangerously-skip-permissions',
      '-p',
      instruction
    ],
    {
      cwd: processingDir,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  runningWorkers.set(jobId, worker);
  logToWorker(jobId, `PID: ${worker.pid}`);

  let workerStdout = '';
  let workerStderr = '';

  if (worker.stdout) {
    worker.stdout.on('data', (data) => {
      const text = data.toString();
      workerStdout += text;
      logToWorker(jobId, `STDOUT: ${text.trim()}`, processingDir);
    });
  }

  if (worker.stderr) {
    worker.stderr.on('data', (data) => {
      const text = data.toString();
      workerStderr += text;
      logToWorker(jobId, `STDERR: ${text.trim()}`, processingDir);
    });
  }

  worker.on('error', (err) => {
    const errorMsg = `Spawn error: ${err.message}`;
    logToWorker(jobId, `ERROR: ${errorMsg}`, processingDir);
    
    // Update and move to failed
    const failedAt = new Date().toISOString();
    try {
      const jobFile = path.join(processingDir, 'job.json');
      if (fs.existsSync(jobFile)) {
        const data = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
        data.status = 'failed';
        data.error = errorMsg;
        data.failedAt = failedAt;
        if (data.startedAt) {
          data.durationMs = new Date(failedAt).getTime() - new Date(data.startedAt).getTime();
        }
        fs.writeFileSync(jobFile, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch(e) {}
    
    const failedDir = path.resolve(baseJobs, 'failed', jobId);
    moveDirSync(processingDir, failedDir);
    
    runningWorkers.delete(jobId);
  });

  worker.on('exit', (code, signal) => {
    logToWorker(jobId, `EXIT: code=${code}, signal=${signal}`, processingDir);
    runningWorkers.delete(jobId);

    const renderFile = path.join(processingDir, 'render.png');
    const isCompleted = fs.existsSync(renderFile);
    
    const endedAt = new Date().toISOString();
    let jobData: any = null;
    
    try {
      const jobFile = path.join(processingDir, 'job.json');
      if (fs.existsSync(jobFile)) {
        jobData = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
        if (jobData.startedAt) {
          jobData.durationMs = new Date(endedAt).getTime() - new Date(jobData.startedAt).getTime();
        }
      }
    } catch(e) {}

    if (isCompleted) {
      logToWorker(jobId, `SUCCESS: render.png created.`, processingDir);
      if (jobData) {
        jobData.status = 'completed';
        jobData.completedAt = endedAt;
        
        // Detect actual resolution
        try {
          const imageBuffer = fs.readFileSync(renderFile);
          const dimensions = sizeOf(imageBuffer);
          jobData.outputWidth = dimensions.width;
          jobData.outputHeight = dimensions.height;
        } catch(e) {
          logToWorker(jobId, `Warning: Could not read output resolution.`, processingDir);
        }

        try {
          fs.writeFileSync(path.join(processingDir, 'job.json'), JSON.stringify(jobData, null, 2), 'utf-8');
        } catch(e) {}
      }
      const completedDir = path.join(baseJobs, 'completed', jobId);
      moveDirSync(processingDir, completedDir);
    } else {
      let errorMsg = `Worker exited with code ${code} mas não gerou a imagem (render.png).`;
      
      const fullLog = (workerStdout + workerStderr).toLowerCase();
      if (fullLog.includes('quota') || fullLog.includes('resource_exhausted')) {
        errorMsg = 'Limite de uso atingido (Quota Exhausted). O modelo de geração de imagens esgotou seu limite temporário.';
      } else if (workerStderr) {
        // Extract the first non-empty line from stderr as a hint
        const errHint = workerStderr.split('\n').map(l => l.trim()).filter(Boolean)[0];
        if (errHint) errorMsg += ` Erro: ${errHint}`;
      } else if (workerStdout.includes('Error:')) {
        const errHint = workerStdout.split('Error:')[1].split('\n')[0].trim();
        if (errHint) errorMsg = `Erro interno no modelo: ${errHint}`;
      }

      logToWorker(jobId, `FAILED: ${errorMsg}`, processingDir);
      if (jobData) {
        jobData.status = 'failed';
        jobData.error = errorMsg;
        jobData.failedAt = endedAt;
        try {
          fs.writeFileSync(path.join(processingDir, 'job.json'), JSON.stringify(jobData, null, 2), 'utf-8');
        } catch(e) {}
      }
      const failedDir = path.join(baseJobs, 'failed', jobId);
      moveDirSync(processingDir, failedDir);
    }
  });
}

export function killAgyWorker(jobId: string) {
  const worker = runningWorkers.get(jobId);
  if (worker) {
    try {
      worker.kill('SIGTERM');
      console.log(`Worker for job ${jobId} was manually terminated.`);
    } catch (e) {
      console.error(`Error killing worker for job ${jobId}:`, e);
    }
    runningWorkers.delete(jobId);
  }
}
