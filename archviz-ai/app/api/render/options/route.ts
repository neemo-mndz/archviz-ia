import { NextResponse } from 'next/server';
import { DEFAULT_RENDER_CONFIG, RENDER_OPTIONS } from '@/lib/render-options';

export function GET() {
  return NextResponse.json({ success: true, contractVersion: '1.0', options: RENDER_OPTIONS, defaults: DEFAULT_RENDER_CONFIG });
}
