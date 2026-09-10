import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/job-manager';
import { execFileSync } from 'child_process';


function resolveAgyPath(): string | null {
  if (process.env.AGY_PATH) return process.env.AGY_PATH;
  try {
    const output = execFileSync('where.exe', ['agy'], { encoding: 'utf-8' });
    const paths = output.trim().split('\r\n');
    if (paths.length > 0 && paths[0]) return paths[0];
  } catch (err) {}
  return null;
}

export async function GET() {
  try {
    const agyPath = resolveAgyPath();
    const statuses = ['completed', 'failed', 'processing', 'pending'];
    const jobCounts: Record<string, number> = {};

    for (const status of statuses) jobCounts[status] = 0;
    for (const job of await listJobs()) jobCounts[job.status]++;

    const isReady = agyPath !== null;
    const isBusy = (jobCounts['processing'] || 0) + (jobCounts['pending'] || 0) > 0;
    
    let state = 'Offline';
    if (isReady) {
      state = isBusy ? 'Ocupado' : 'Pronto';
    } else if (!isReady) {
      state = 'Não configurado';
    }

    return NextResponse.json({
      success: true,
      health: {
        state,
        agyPath,
        jobs: jobCounts
      }
    });

  } catch (error: any) {
    console.error('Health API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
