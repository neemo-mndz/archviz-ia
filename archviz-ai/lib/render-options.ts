import type { RenderConfig } from '@/types/render';

const density = ['Default', 'None', 'Low', 'Medium', 'High'] as const;
export const RENDER_OPTIONS = {
  lighting: ['Default', 'Natural Daylight', 'Golden Hour', 'Overcast', 'Night'],
  weather: ['Default', 'Clear Sky', 'Partly Cloudy', 'Cloudy', 'Foggy', 'Rainy'],
  fidelity: ['Maximum', 'High', 'Balanced'],
  people: density,
  vehicles: density,
  vegetation: density,
  materialCondition: ['Preserve Original', 'Brand New', 'Natural', 'Slightly Weathered'],
  aspectRatio: ['Original', '1:1', '4:3', '3:2', '16:9', '9:16'],
  resolution: ['Auto', '1K', '2K', '4K'],
} as const;

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  lighting: 'Default', weather: 'Default', fidelity: 'Maximum',
  people: 'Default', vehicles: 'Default', vegetation: 'Default',
  materialCondition: 'Preserve Original', aspectRatio: 'Original',
  resolution: 'Auto', additionalInstructions: '',
};
