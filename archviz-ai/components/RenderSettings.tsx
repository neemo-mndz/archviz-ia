import React from 'react';
import { RenderConfig } from '@/types/render';
import { RENDER_OPTIONS } from '@/lib/render-options';

interface RenderSettingsProps {
  config: RenderConfig;
  onChange: (newConfig: RenderConfig) => void;
  disabled?: boolean;
}

const {
  lighting: LIGHTING_OPTIONS, weather: WEATHER_OPTIONS, fidelity: FIDELITY_OPTIONS,
  people: DENSITY_OPTIONS, materialCondition: MATERIAL_OPTIONS,
  aspectRatio: ASPECT_RATIO_OPTIONS, resolution: RESOLUTION_OPTIONS,
} = RENDER_OPTIONS;

export default function RenderSettings({ config, onChange, disabled }: RenderSettingsProps) {
  
  const updateField = (field: keyof RenderConfig, value: string) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className={`space-y-6 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <h2 className="text-xl font-semibold mb-4">Configurações de Render</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Iluminação */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Lighting</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.lighting}
            onChange={(e) => updateField('lighting', e.target.value)}
          >
            {LIGHTING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Clima */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Weather / Atmosphere</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.weather}
            onChange={(e) => updateField('weather', e.target.value)}
          >
            {WEATHER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Fidelidade */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fidelity</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.fidelity}
            onChange={(e) => updateField('fidelity', e.target.value)}
          >
            {FIDELITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Pessoas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">People Density</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.people}
            onChange={(e) => updateField('people', e.target.value)}
          >
            {DENSITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Veículos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vehicles Density</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.vehicles}
            onChange={(e) => updateField('vehicles', e.target.value)}
          >
            {DENSITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Vegetação */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vegetation Density</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.vegetation}
            onChange={(e) => updateField('vegetation', e.target.value)}
          >
            {DENSITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Condição dos Materiais */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Material Condition</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.materialCondition}
            onChange={(e) => updateField('materialCondition', e.target.value)}
          >
            {MATERIAL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Aspect Ratio / Format</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm"
            value={config.aspectRatio || 'Original'}
            onChange={(e) => updateField('aspectRatio', e.target.value)}
          >
            {ASPECT_RATIO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Resolution */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Output Resolution</label>
          <select 
            className="w-full border border-gray-300 rounded-md p-2 bg-white text-sm col-span-1 md:col-span-2"
            value={config.resolution || 'Auto'}
            onChange={(e) => updateField('resolution', e.target.value)}
          >
            {RESOLUTION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      </div>

      {/* Observações Adicionais */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Additional Instructions</label>
        <textarea 
          className="w-full border border-gray-300 rounded-md p-2 min-h-[100px] text-sm"
          placeholder="Ex: Make the facade material dark wood..."
          value={config.additionalInstructions}
          onChange={(e) => updateField('additionalInstructions', e.target.value)}
        />
      </div>
    </div>
  );
}
