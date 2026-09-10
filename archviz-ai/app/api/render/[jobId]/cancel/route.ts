import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-manager';
import { killAgyWorker } from '@/lib/agy-worker';
import path from 'path';
import fs from 'fs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'processing' || job.status === 'pending') {
      killAgyWorker(jobId);
      
      // Update job state directly here to ensure it's marked as cancelled quickly
      try {
        const baseJobs = path.resolve(process.cwd(), 'jobs');
        const processingDir = path.join(baseJobs, 'processing', jobId);
        const jobFile = path.join(processingDir, 'job.json');
        
        if (fs.existsSync(jobFile)) {
          const data = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
          data.status = 'failed';
          data.error = 'Cancelled by user';
          data.failedAt = new Date().toISOString();
          fs.writeFileSync(jobFile, JSON.stringify(data, null, 2), 'utf-8');
          
          const failedDir = path.join(baseJobs, 'failed', jobId);
          fs.renameSync(processingDir, failedDir);
        }
      } catch (e) {
        console.error('Error updating job status on cancel:', e);
      }
      
      return NextResponse.json({ success: true, message: 'Job cancelled' });
    }

    return NextResponse.json({ success: false, error: 'Job cannot be cancelled in its current state' }, { status: 400 });
    
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
