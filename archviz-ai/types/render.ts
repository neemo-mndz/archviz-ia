import type { RENDER_OPTIONS } from '@/lib/render-options';

export type LightingOption = (typeof RENDER_OPTIONS.lighting)[number];
export type FidelityOption = (typeof RENDER_OPTIONS.fidelity)[number];
export type DensityOption = (typeof RENDER_OPTIONS.people)[number];
export type MaterialConditionOption = (typeof RENDER_OPTIONS.materialCondition)[number];
export type WeatherOption = (typeof RENDER_OPTIONS.weather)[number];
export type AspectRatioOption = (typeof RENDER_OPTIONS.aspectRatio)[number];
export type OutputResolutionOption = (typeof RENDER_OPTIONS.resolution)[number];

export interface RenderConfig {
  lighting: LightingOption;
  weather: WeatherOption;
  fidelity: FidelityOption;
  people: DensityOption;
  vehicles: DensityOption;
  vegetation: DensityOption;
  materialCondition: MaterialConditionOption;
  aspectRatio: AspectRatioOption;
  resolution: OutputResolutionOption;
  additionalInstructions: string;
}

export interface RenderResponse {
  success: boolean;
  image?: string; // Base64 or URL
  metadata?: {
    model: string;
    durationMs: number;
    outputWidth?: number;
    outputHeight?: number;
    outputAspectRatio?: string;
    requestedAspectRatio?: string;
    requestedResolution?: string;
  };
  error?: string;
}
