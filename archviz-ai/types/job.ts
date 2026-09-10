import { RenderConfig } from './render';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string; // ISO string
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  durationMs?: number;
  totalDurationMs?: number;
  source: string; // usually 'base.png'
  output: string; // usually 'render.png'
  settings: RenderConfig;
  error?: string;
  // Metadata for resolution and aspect ratio tracking
  inputWidth?: number;
  inputHeight?: number;
  inputAspectRatio?: string;
  requestedAspectRatio?: string;
  requestedResolution?: string;
  outputWidth?: number;
  outputHeight?: number;
  outputAspectRatio?: string;
}
