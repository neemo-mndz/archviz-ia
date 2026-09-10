import { NextRequest, NextResponse } from 'next/server';
import { buildRenderPrompt } from '@/lib/render-prompt';
import { createJob, listJobs } from '@/lib/job-manager';
import { startAgyWorker } from '@/lib/agy-worker';
import { RenderConfig } from '@/types/render';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get('image') as File | null;
    const lighting = formData.get('lighting') as string || 'Default';
    const weather = formData.get('weather') as string || 'Default';
    const fidelity = formData.get('fidelity') as string || 'Maximum';
    const people = formData.get('people') as string || 'Default';
    const vehicles = formData.get('vehicles') as string || 'Default';
    const vegetation = formData.get('vegetation') as string || 'Default';
    const materialCondition = (formData.get('materialCondition') || 'Preserve Original') as any;
    const aspectRatio = (formData.get('aspectRatio') || 'Original') as any;
    const resolution = (formData.get('resolution') || 'Auto') as any;
    const additionalInstructions = formData.get('additionalInstructions') as string || '';
    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 });
    }
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const config: RenderConfig = {
      lighting: lighting as any,
      weather: weather as any,
      fidelity: fidelity as any,
      people: people as any,
      vehicles: vehicles as any,
      vegetation: vegetation as any,
      materialCondition: materialCondition as any,
      aspectRatio,
      resolution,
      additionalInstructions
    };

    const activeJobs = (await listJobs()).filter(job =>
      job.status === 'pending' || job.status === 'processing');
    if (activeJobs.length > 0) {
      return NextResponse.json({ success: false, error: 'Existe um render em andamento. Aguarde a conclusão.' }, { status: 429 });
    }

    const prompt = buildRenderPrompt(config);

    // Create job (UUID generated securely, saves base.png, prompt.md, job.json)
    const job = await createJob(buffer, prompt, config);
  
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
  } catch (error: any) {
    console.error('Render API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'An unexpected error occurred while creating the job.' 
    }, { status: 500 });
  }
}
