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
      return new NextResponse('Job not found', { status: 404 });
    }

    const basePath = path.join(location.dir, 'base.png');
    
    try {
      const stat = await fs.stat(basePath);
      if (!stat.isFile()) throw new Error();
    } catch {
      return new NextResponse('Base image not found', { status: 404 });
    }

    const imageBuffer = await fs.readFile(basePath);

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('API Base Image Error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
