import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/job-manager';

export async function GET() {
  try {
    const activeJob = (await listJobs()).find(job =>
      job.status === 'processing' || job.status === 'pending') ?? null;
    return NextResponse.json({ success: true, activeJob });
  } catch (error) {
    console.error('Active Job API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
