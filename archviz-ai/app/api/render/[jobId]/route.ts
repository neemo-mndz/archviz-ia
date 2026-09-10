import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-manager';
import { killAgyWorker } from '@/lib/agy-worker';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    // Se o job terminou, tentamos garantir que o worker seja encerrado caso tenha ficado zumbi
    if (job.status === 'completed' || job.status === 'failed') {
      killAgyWorker(jobId);
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      // Metadata útil para o frontend calcular tempo ou exibir erros
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      outputWidth: job.outputWidth,
      outputHeight: job.outputHeight,
      outputAspectRatio: job.outputAspectRatio,
      requestedAspectRatio: job.requestedAspectRatio,
      requestedResolution: job.requestedResolution
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
