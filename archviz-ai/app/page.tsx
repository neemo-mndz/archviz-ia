'use client';

import React, { useState, useEffect, useRef } from 'react';
import UploadArea from '@/components/UploadArea';
import RenderSettings from '@/components/RenderSettings';
import RenderResult from '@/components/RenderResult';
import { RenderConfig, RenderResponse } from '@/types/render';
import { Job } from '@/types/job';

type AppState = 'idle' | 'preparing' | 'pending' | 'processing' | 'success' | 'error';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  
  const [config, setConfig] = useState<RenderConfig>({
    lighting: 'Default',
    weather: 'Default',
    fidelity: 'Maximum',
    people: 'Default',
    vehicles: 'Default',
    vegetation: 'Default',
    materialCondition: 'Preserve Original',
    aspectRatio: 'Original',
    resolution: 'Auto',
    additionalInstructions: ''
  });

  const [result, setResult] = useState<RenderResponse | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [renderDuration, setRenderDuration] = useState<number>(0);
  const [health, setHealth] = useState<any>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [consoleExpanded, setConsoleExpanded] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- INSTRUMENTATION HELPER ---
  const instrumentedFetch = async (endpoint: string, options?: RequestInit) => {
    const timestamp = new Date().toISOString().split('T')[1];
    try {
      const res = await fetch(endpoint, options);
      console.log(`[FETCH] ${timestamp} | ${endpoint} | HTTP ${res.status} | ok: ${res.ok}`);
      return res;
    } catch (err: any) {
      console.error(`[FETCH FATAL] ${timestamp} | ${endpoint} | ERROR: ${err.message}`);
      throw err;
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchRecentJobs();
    checkActiveJob();
    const interval = setInterval(() => {
      fetchHealth();
      if (appState === 'idle') fetchRecentJobs();
    }, 10000);
    return () => clearInterval(interval);
  }, [appState]);

  useEffect(() => {
    if (consoleExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, consoleExpanded]);

  const checkActiveJob = async () => {
    if (appState !== 'idle') return;
    try {
      const res = await instrumentedFetch('/api/jobs/active');
      const data = await res.json();
      if (data.success && data.activeJob) {
        setActiveJobId(data.activeJob.id);
        setAppState(data.activeJob.status);
        setConfig(data.activeJob.settings);
        setOriginalImageUrl(`/api/render/${data.activeJob.id}/base`);
        pollJobStatus(data.activeJob.id);
        pollLogs(data.activeJob.id);
      }
    } catch(e) {}
  };

  const fetchHealth = async () => {
    try {
      const res = await instrumentedFetch('/api/health');
      const data = await res.json();
      if (data.success) setHealth(data.health);
    } catch(e) {}
  };

  const fetchRecentJobs = async () => {
    try {
      const res = await instrumentedFetch('/api/jobs/recent');
      const data = await res.json();
      if (data.success) setRecentJobs(data.jobs);
    } catch(e) {}
  };

  const handleImageSelected = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setOriginalImageUrl(url);
    if (appState === 'error' || appState === 'success') {
      setAppState('idle');
      setResult(null);
      setErrorMessage(null);
      setLogs('');
    }
  };

  const handleRender = async () => {
    if (!selectedFile) return;

    setAppState('preparing');
    setErrorMessage(null);
    setLogs('Preparando envio para o motor de renderização...\n');
    setRenderDuration(0);
    setConsoleExpanded(true);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('lighting', config.lighting);
      formData.append('weather', config.weather);
      formData.append('fidelity', config.fidelity);
      formData.append('people', config.people);
      formData.append('vehicles', config.vehicles);
      formData.append('vegetation', config.vegetation);
      formData.append('materialCondition', config.materialCondition);
      formData.append('aspectRatio', config.aspectRatio || 'Original');
      formData.append('resolution', config.resolution || 'Auto');
      formData.append('additionalInstructions', config.additionalInstructions);

      const response = await instrumentedFetch('/api/render', {
        method: 'POST',
        body: formData,
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        setErrorMessage(`O servidor retornou um erro HTTP ${response.status}`);
        setAppState('error');
        return;
      }

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || `Erro na requisição: HTTP ${response.status}`);
        setAppState('error');
        return;
      }

      setAppState(data.status as AppState);
      setActiveJobId(data.jobId);
      pollJobStatus(data.jobId);
      pollLogs(data.jobId);
      fetchHealth();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro de conexão.');
      setAppState('error');
    }
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      setLogs(prev => prev + '\nCancelando trabalho...\n');
      await instrumentedFetch(`/api/render/${activeJobId}/cancel`, { method: 'POST' });
      setAppState('error');
      setErrorMessage('Trabalho cancelado pelo usuário.');
      setActiveJobId(null);
      fetchHealth();
    } catch (e) {
      console.error(e);
    }
  };

  const pollLogs = async (jobId: string) => {
    try {
      const res = await instrumentedFetch(`/api/render/${jobId}/logs`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.logs) {
          setLogs(data.logs);
        }
      }
    } catch (e) {}
    
    setAppState(state => {
      if (['preparing', 'pending', 'processing'].includes(state)) {
        setTimeout(() => pollLogs(jobId), 2000);
      }
      return state;
    });
  };

  const pollJobStatus = async (jobId: string, errorCount = 0) => {
    try {
      const res = await instrumentedFetch(`/api/render/${jobId}`);
      if (!res.ok) {
        throw new Error(`Erro ao consultar render: HTTP ${res.status}`);
      }
      
      const data = await res.json();
      if (!data.success) {
         setErrorMessage(data.error || 'Erro ao consultar status');
         setAppState('error');
         setActiveJobId(null);
         return;
      }
      
      if (data.status === 'completed') {
        setOriginalImageUrl(`/api/render/${jobId}/base`);
        const duration = data.createdAt && data.completedAt 
          ? new Date(data.completedAt).getTime() - new Date(data.createdAt).getTime() 
          : 0;
          
        setResult({
          success: true,
          image: `/api/render/${jobId}/result`,
          metadata: {
            model: 'Antigravity Local Renderer',
            durationMs: duration,
            outputWidth: data.outputWidth,
            outputHeight: data.outputHeight,
            outputAspectRatio: data.outputAspectRatio,
            requestedAspectRatio: data.requestedAspectRatio,
            requestedResolution: data.requestedResolution
          }
        });
        setRenderDuration(duration);
        setAppState('success');
        setActiveJobId(null);
        fetchRecentJobs();
        fetchHealth();
      } else if (data.status === 'failed') {
        setErrorMessage(data.error || 'Falha ao renderizar a imagem no worker.');
        setAppState('error');
        setActiveJobId(null);
        fetchHealth();
      } else {
        setAppState(data.status as AppState);
        setTimeout(() => pollJobStatus(jobId, 0), 3000); // Reset error count on success
      }
    } catch (err: any) {
      if (errorCount < 3) {
        console.warn(`Transient fetch error in pollJobStatus (attempt ${errorCount + 1}): ${err.message}. Retrying...`);
        setTimeout(() => pollJobStatus(jobId, errorCount + 1), 3000);
      } else {
        setErrorMessage(`Falha na comunicação com o servidor: ${err.message}`);
        setAppState('error');
        setActiveJobId(null);
        fetchHealth();
      }
    }
  };

  const handleReset = () => {
    setAppState('idle');
    setSelectedFile(null);
    setOriginalImageUrl(null);
    setResult(null);
    setErrorMessage(null);
    setLogs('');
  };

  const handleOpenRecentResult = (job: Job) => {
    setConfig(job.settings);
    if (job.status === 'completed') {
      setActiveJobId(job.id);
      setAppState('success');
      setOriginalImageUrl(`/api/render/${job.id}/base`);
      setResult({
        success: true,
        image: `/api/render/${job.id}/result`,
        metadata: {
          model: 'Antigravity Local Renderer',
          durationMs: job.durationMs || 0,
          outputWidth: job.outputWidth,
          outputHeight: job.outputHeight,
          outputAspectRatio: job.outputAspectRatio,
          requestedAspectRatio: job.requestedAspectRatio,
          requestedResolution: job.requestedResolution
        }
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isWorking = ['preparing', 'pending', 'processing'].includes(appState);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 pb-20">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            ARCHVIZ <span className="text-blue-600">AI</span> buginganga
          </h1>
          <div className="flex items-center gap-6">
            {health && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className={`w-2 h-2 rounded-full ${health.state === 'Pronto' ? 'bg-green-500' : health.state === 'Ocupado' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-gray-600">Renderer: {health.state}</span>
              </div>
            )}
            {appState === 'success' && (
              <button onClick={handleReset} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
                Novo Render
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        
        {/* TOP SECTION: Upload & Settings Side-by-side */}
        {appState !== 'success' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
            <div className="lg:col-span-5 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-4 text-gray-800">1. Imagem Base</h2>
                <UploadArea 
                  onImageSelected={handleImageSelected} 
                  disabled={isWorking} 
                />
              </div>
              
              {/* ACTION BUTTON */}
              {(appState === 'idle' || appState === 'error') && selectedFile && (
                <div className="pt-4">
                  <button 
                    onClick={handleRender}
                    disabled={health?.state === 'Ocupado'}
                    className="w-full py-4 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {health?.state === 'Ocupado' ? 'RENDERER OCUPADO' : 'RENDERIZAR'}
                  </button>
                </div>
              )}
            </div>
            
            <div className="lg:col-span-7">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">2. Intenção de Render</h2>
              <RenderSettings 
                config={config} 
                onChange={setConfig} 
                disabled={isWorking || !selectedFile} 
              />
            </div>
          </div>
        )}

        {/* ERROR MESSAGE */}
        {appState === 'error' && errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center justify-between shadow-sm">
            <p className="font-medium">{errorMessage}</p>
            <button onClick={() => setAppState('idle')} className="font-semibold hover:underline text-red-800">OK</button>
          </div>
        )}

        {/* PROCESSING UI & CONSOLE */}
        {isWorking && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6 bg-gray-50/50 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="relative w-12 h-12">
                  <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
                  <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-gray-900">
                    {appState === 'preparing' && 'Preparando...'}
                    {appState === 'pending' && 'Na fila...'}
                    {appState === 'processing' && 'Renderizando...'}
                  </h3>
                  <p className="text-gray-500 text-sm">Proteção Geométrica ativada. Aguarde o processamento.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConsoleExpanded(!consoleExpanded)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  {consoleExpanded ? 'Recolher Console' : 'Expandir Console'}
                </button>
                <button 
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
                >
                  Cancelar Render
                </button>
              </div>
            </div>
            
            {consoleExpanded && (
              <div className="bg-gray-900 text-green-400 p-6 font-mono text-sm h-80 flex flex-col">
                <div className="mb-4 text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700 pb-2 flex justify-between">
                  <span>Console do Renderer</span>
                  <span className="text-green-400 animate-pulse">● LIVE</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <pre className="whitespace-pre-wrap leading-relaxed">{logs}</pre>
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUCCESS RESULT */}
        {appState === 'success' && result && result.image && originalImageUrl && (
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
            <RenderResult 
              originalImage={originalImageUrl} 
              renderedImage={result.image} 
              durationMs={renderDuration} 
              outputWidth={result.metadata?.outputWidth}
              outputHeight={result.metadata?.outputHeight}
              outputAspectRatio={result.metadata?.outputAspectRatio}
              requestedAspectRatio={result.metadata?.requestedAspectRatio}
              requestedResolution={result.metadata?.requestedResolution}
            />
          </div>
        )}

        {/* RECENT RENDERS */}
        {recentJobs.length > 0 && appState === 'idle' && (
          <div className="pt-8">
            <h3 className="text-xl font-bold mb-6 text-gray-800">Renders Recentes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentJobs.map(job => (
                <div key={job.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {job.status === 'completed' ? (
                    <div className="h-48 bg-gray-100 overflow-hidden">
                      <img src={`/api/render/${job.id}/result`} className="w-full h-full object-cover" alt="Render result" />
                    </div>
                  ) : (
                    <div className="h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-medium">
                      {job.status.toUpperCase()}
                    </div>
                  )}
                  <div className="p-5 space-y-4">
                    <div className="text-xs text-gray-500">
                      {new Date(job.createdAt).toLocaleString()}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded">{job.settings.lighting}</span>
                      <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded">{job.settings.fidelity}</span>
                      <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded">{job.settings.aspectRatio || 'Original'}</span>
                      {job.outputWidth && job.outputHeight && (
                        <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded">
                          {job.outputWidth} × {job.outputHeight}
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => handleOpenRecentResult(job)}
                      className="w-full py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                    >
                      {job.status === 'completed' ? 'Abrir Render' : 'Usar estas configurações'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
