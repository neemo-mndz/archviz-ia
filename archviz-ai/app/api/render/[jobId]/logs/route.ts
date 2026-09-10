import { NextRequest, NextResponse } from 'next/server';
import { locateJob } from '@/lib/job-manager';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const location = await locateJob(jobId);

    if (!location) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    const logPath = path.join(location.dir, 'worker.log');
    let logs = '';
    try {
      logs = await fs.readFile(logPath, 'utf-8');
    } catch {
      logs = 'Aguardando logs...';
    }

    return NextResponse.json({
      success: true,
      logs
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
