import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/job-manager';

export async function GET() {
  try {
    const jobs = await listJobs();
    jobs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return NextResponse.json({ success: true, jobs: jobs.slice(0, 20) });
  } catch (error) {
    console.error('Jobs API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
