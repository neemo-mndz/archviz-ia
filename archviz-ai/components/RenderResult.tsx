import React, { useState } from 'react';

interface RenderResultProps {
  originalImage: string;
  renderedImage: string;
  durationMs: number;
}

export default function RenderResult({ originalImage, renderedImage, durationMs }: RenderResultProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const durationSec = (durationMs / 1000).toFixed(1);

  const handleDownload = () => {
    // Basic download trigger
    const a = document.createElement('a');
    a.href = renderedImage;
    a.download = `archviz_render_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpen = () => {
    // If it's a base64 or object URL, this will open it in a new tab
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`<img src="${renderedImage}" style="max-width: 100%;" />`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Resultado</h2>
        <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          Render concluído em {durationSec} segundos
        </span>
      </div>
      
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50 flex items-center justify-center min-h-[400px]">
        <img 
          src={showOriginal ? originalImage : renderedImage} 
          alt={showOriginal ? "Imagem Original" : "Imagem Renderizada"}
          className="max-h-[70vh] object-contain transition-opacity duration-300"
        />
        
        {/* Toggle Overlay Button */}
        <button 
          className="absolute top-4 right-4 bg-white/80 backdrop-blur px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-white transition-colors"
          onMouseDown={() => setShowOriginal(true)}
          onMouseUp={() => setShowOriginal(false)}
          onMouseLeave={() => setShowOriginal(false)}
          onTouchStart={() => setShowOriginal(true)}
          onTouchEnd={() => setShowOriginal(false)}
        >
          {showOriginal ? 'MOSTRANDO ORIGINAL' : 'Segure para ver original'}
        </button>
      </div>

      <div className="flex gap-4 justify-end">
        <button 
          onClick={handleOpen}
          className="px-6 py-2 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          ABRIR RENDER
        </button>
        <button 
          onClick={handleDownload}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          DOWNLOAD RENDER
        </button>
      </div>
    </div>
  );
}
