'use client';

import React, { useState, useRef } from 'react';
import UploadArea from '@/components/UploadArea';
import RenderSettings from '@/components/RenderSettings';
import RenderResult from '@/components/RenderResult';
import { RenderConfig, RenderResponse } from '@/types/render';

type AppState = 'idle' | 'uploading' | 'rendering' | 'success' | 'error';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  
  const [config, setConfig] = useState<RenderConfig>({
    lighting: 'Padrão',
    fidelity: 'Estrita',
    people: 'Padrão',
    vehicles: 'Padrão',
    vegetation: 'Padrão',
    materialCondition: 'Preservar imagem',
    additionalInstructions: ''
  });

  const [result, setResult] = useState<RenderResponse | null>(null);

  const handleImageSelected = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setOriginalImageUrl(url);
    if (appState === 'error' || appState === 'success') {
      setAppState('idle');
      setResult(null);
      setErrorMessage(null);
    }
  };

  const handleRender = async () => {
    if (!selectedFile) return;

    setAppState('rendering');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('lighting', config.lighting);
      formData.append('fidelity', config.fidelity);
      formData.append('people', config.people);
      formData.append('vehicles', config.vehicles);
      formData.append('vegetation', config.vegetation);
      formData.append('materialCondition', config.materialCondition);
      formData.append('additionalInstructions', config.additionalInstructions);

      const response = await fetch('/api/render', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as RenderResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro desconhecido ao renderizar a imagem.');
      }

      setResult(data);
      setAppState('success');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Erro de conexão.');
      setAppState('error');
    }
  };

  const handleReset = () => {
    setAppState('idle');
    setSelectedFile(null);
    setOriginalImageUrl(null);
    setResult(null);
    setErrorMessage(null);
    // keeping config for convenience
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">ARCHVIZ <span className="text-blue-600">AI</span></h1>
          {appState === 'success' && (
            <button onClick={handleReset} className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Novo Render
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* TOP SECTION: Upload & Settings */}
        {appState !== 'success' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="lg:col-span-5 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-4">Upload da Imagem Base</h2>
                <UploadArea 
                  onImageSelected={handleImageSelected} 
                  disabled={appState === 'rendering'} 
                />
              </div>
            </div>
            
            <div className="lg:col-span-7">
              <RenderSettings 
                config={config} 
                onChange={setConfig} 
                disabled={appState === 'rendering' || !selectedFile} 
              />
            </div>
          </div>
        )}

        {/* ERROR MESSAGE */}
        {appState === 'error' && errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center justify-between">
            <p>{errorMessage}</p>
            <button onClick={() => setAppState('idle')} className="font-medium hover:underline text-red-800">Tentar novamente</button>
          </div>
        )}

        {/* RENDERING STATE */}
        {appState === 'rendering' && (
          <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center space-y-6">
            <div className="inline-block relative w-16 h-16">
              <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
              <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <div>
              <h3 className="text-xl font-medium">Gerando visualização...</h3>
              <p className="text-gray-500 mt-2">Isso pode levar alguns instantes. Por favor, aguarde.</p>
            </div>
          </div>
        )}

        {/* SUCCESS RESULT */}
        {appState === 'success' && result && result.image && originalImageUrl && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <RenderResult 
              originalImage={originalImageUrl} 
              renderedImage={result.image} 
              durationMs={result.metadata?.durationMs || 0} 
            />
          </div>
        )}

        {/* ACTION BUTTON */}
        {(appState === 'idle' || appState === 'error') && selectedFile && (
          <div className="flex justify-end">
            <button 
              onClick={handleRender}
              className="px-10 py-4 bg-gray-900 text-white text-lg font-semibold rounded-xl hover:bg-gray-800 transition-all shadow-md active:scale-95"
            >
              RENDERIZAR
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
