import { NextRequest, NextResponse } from 'next/server';
import { getJobResultPath } from '@/lib/job-manager';
import fs from 'fs/promises';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    // getJobResultPath already validates UUID, prevents traversal, and checks if it's completed
    const resultPath = await getJobResultPath(jobId);

    if (!resultPath) {
      return new NextResponse('Not found or not completed', { status: 404 });
    }

    const imageBuffer = await fs.readFile(resultPath);

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('API Result Error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
