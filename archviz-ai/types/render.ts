export type LightingOption = 'Natural Daylight' | 'Golden Hour' | 'Overcast' | 'Night' | 'Default';
export type FidelityOption = 'Maximum' | 'High' | 'Balanced';
export type DensityOption = 'Default' | 'None' | 'Low' | 'Medium' | 'High';
export type MaterialConditionOption = 'Preserve Original' | 'Brand New' | 'Natural' | 'Slightly Weathered';
export type WeatherOption = 'Default' | 'Clear Sky' | 'Partly Cloudy' | 'Cloudy' | 'Foggy' | 'Rainy';

export type AspectRatioOption = 'Original' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16';
export type OutputResolutionOption = 'Auto' | '1K' | '2K' | '4K';

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
