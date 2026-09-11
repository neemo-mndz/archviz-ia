import { NextRequest, NextResponse } from 'next/server';
import { buildRenderPrompt } from '@/lib/render-prompt';
import { createJob, listJobs } from '@/lib/job-manager';
import { startAgyWorker } from '@/lib/agy-worker';
import { readRenderForm, parseRenderInput } from '@/lib/render-input';
import { RenderInputError } from '@/lib/scene-validation';
import { acquireRenderAdmission } from '@/lib/render-admission';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { buffer, geometryBuffer, solidGeometryBuffer, config, origin, scene } = await parseRenderInput(await readRenderForm(req));
    const release = acquireRenderAdmission();
    if (!release) {
      return NextResponse.json({ success: false, error: 'Existe um render em andamento. Aguarde a conclusão.' }, { status: 429 });
    }
    try {
      const activeJobs = (await listJobs()).filter(job =>
        job.status === 'pending' || job.status === 'processing');
      if (activeJobs.length > 0) {
        return NextResponse.json({ success: false, error: 'Existe um render em andamento. Aguarde a conclusão.' }, { status: 429 });
      }

      const prompt = buildRenderPrompt(config, scene);

      // Create job (UUID generated securely, saves base.png, prompt.md, job.json)
      const job = await createJob(buffer, prompt, config, { origin, scene, geometryBuffer, solidGeometryBuffer });
  
      // Start worker asynchronously
      const jobDir = path.resolve(process.cwd(), 'jobs', 'pending', job.id);
      try {
        startAgyWorker(job.id, jobDir);
      } catch (workerError: any) {
        console.error('Failed to start worker synchronously:', workerError);
    
        // Mark job as failed since worker couldn't start
        const fs = require('fs');
        try {
          const jobFile = path.join(jobDir, 'job.json');
          if (fs.existsSync(jobFile)) {
            const data = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
            data.status = 'failed';
            data.error = workerError.message;
            fs.writeFileSync(jobFile, JSON.stringify(data, null, 2), 'utf-8');
          }

          const failedDir = path.resolve(process.cwd(), 'jobs', 'failed', job.id);
          fs.mkdirSync(path.dirname(failedDir), { recursive: true });
          fs.renameSync(jobDir, failedDir);
        } catch (e) {
          console.error('Could not move failed job:', e);
        }
      
        return NextResponse.json({
          success: false,
          error: `Não foi possível iniciar o processamento: ${workerError.message}`
        }, { status: 500 });
      }
    
      // Return immediately for frontend polling
      return NextResponse.json({ 
        success: true,
        jobId: job.id,
        status: job.status
      });
    } finally { release(); }
  } catch (error: any) {
    if (error instanceof RenderInputError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Render API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'An unexpected error occurred while creating the job.' 
    }, { status: 500 });
  }
}
