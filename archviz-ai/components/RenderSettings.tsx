import React from 'react';
import { RenderConfig, LightingOption, FidelityOption, DensityOption, MaterialConditionOption } from '@/types/render';

interface RenderSettingsProps {
  config: RenderConfig;
  onChange: (newConfig: RenderConfig) => void;
  disabled?: boolean;
}

const LIGHTING_OPTIONS: LightingOption[] = ['Padrão', 'Dia', 'Nublado', 'Golden Hour', 'Entardecer', 'Noite'];
const FIDELITY_OPTIONS: FidelityOption[] = ['Estrita', 'Equilibrada', 'Criativa'];
const DENSITY_OPTIONS: DensityOption[] = ['Padrão', 'Nenhuma', 'Baixa', 'Média', 'Alta'];
const MATERIAL_OPTIONS: MaterialConditionOption[] = ['Preservar imagem', 'Novo / Limpo', 'Natural', 'Levemente envelhecido'];

export default function RenderSettings({ config, onChange, disabled }: RenderSettingsProps) {
  
  const updateField = (field: keyof RenderConfig, value: string) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className={`space-y-6 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <h2 className="text-xl font-semibold mb-4">Configurações</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Iluminação */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Iluminação</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white"
            value={config.lighting}
            onChange={(e) => updateField('lighting', e.target.value)}
          >
            {LIGHTING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Fidelidade */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fidelidade</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white"
            value={config.fidelity}
            onChange={(e) => updateField('fidelity', e.target.value)}
          >
            {FIDELITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Pessoas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Pessoas</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white"
            value={config.people}
            onChange={(e) => updateField('people', e.target.value)}
          >
            {DENSITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Veículos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Veículos</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white"
            value={config.vehicles}
            onChange={(e) => updateField('vehicles', e.target.value)}
          >
            {DENSITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Vegetação */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vegetação</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white"
            value={config.vegetation}
            onChange={(e) => updateField('vegetation', e.target.value)}
          >
            {DENSITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Condição dos Materiais */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Condição dos Materiais</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white"
            value={config.materialCondition}
            onChange={(e) => updateField('materialCondition', e.target.value)}
          >
            {MATERIAL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      </div>

      {/* Observações Adicionais */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Observações Adicionais</label>
        <textarea 
          className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
          placeholder="Ex: Adicionar neve, piso molhado, etc..."
          value={config.additionalInstructions}
          onChange={(e) => updateField('additionalInstructions', e.target.value)}
        />
      </div>
    </div>
  );
}
