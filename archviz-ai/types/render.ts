export type LightingOption = 'Padrão' | 'Dia' | 'Nublado' | 'Golden Hour' | 'Entardecer' | 'Noite';
export type FidelityOption = 'Estrita' | 'Equilibrada' | 'Criativa';
export type DensityOption = 'Padrão' | 'Nenhuma' | 'Baixa' | 'Média' | 'Alta';
export type MaterialConditionOption = 'Preservar imagem' | 'Novo / Limpo' | 'Natural' | 'Levemente envelhecido';

export interface RenderConfig {
  lighting: LightingOption;
  fidelity: FidelityOption;
  people: DensityOption;
  vehicles: DensityOption;
  vegetation: DensityOption;
  materialCondition: MaterialConditionOption;
  additionalInstructions: string;
}

export interface RenderResponse {
  success: boolean;
  image?: string; // Base64 or URL
  metadata?: {
    model: string;
    durationMs: number;
  };
  error?: string;
}
