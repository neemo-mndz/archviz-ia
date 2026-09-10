import React, { useState, useRef, useEffect } from 'react';

interface RenderResultProps {
  originalImage: string;
  renderedImage: string;
  durationMs: number;
  outputWidth?: number;
  outputHeight?: number;
  outputAspectRatio?: string;
  requestedAspectRatio?: string;
  requestedResolution?: string;
}

export default function RenderResult({ 
  originalImage, 
  renderedImage, 
  durationMs,
  outputWidth,
  outputHeight,
  outputAspectRatio,
  requestedAspectRatio,
  requestedResolution
}: RenderResultProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  const durationSec = (durationMs / 1000).toFixed(1);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.max(0, Math.min((x / rect.width) * 100, 100));
    setSliderPosition(percent);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };
  
  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = renderedImage;
    const dateStr = new Date().toISOString().replace(/T/, '-').replace(/:/g, '').slice(0, 15);
    a.download = `archviz-${dateStr}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sliderComponent = (
    <div 
      ref={containerRef}
      className={`relative rounded-xl overflow-hidden shadow-sm bg-gray-100 flex items-center justify-center select-none ${isFullscreen ? 'h-[90vh] w-[90vw]' : 'h-[60vh] w-full'}`}
      onMouseDown={(e) => { setIsDragging(true); handleMove(e.clientX); }}
      onTouchStart={(e) => { setIsDragging(true); handleMove(e.touches[0].clientX); }}
    >
      {/* Imagem Original (Background) */}
      <img 
        src={originalImage} 
        alt="Original"
        className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
      />
      
      {/* Imagem Renderizada (Clipped) */}
      <div 
        className="absolute top-0 left-0 h-full w-full overflow-hidden pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <img 
          src={renderedImage} 
          alt="Renderizada"
          className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
        />
      </div>
      
      {/* Slider Line & Handle */}
      <div 
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize flex items-center justify-center group"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border border-gray-200 transition-transform group-hover:scale-110">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 -ml-2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
      
      {/* Labels */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-xs font-semibold tracking-wider px-3 py-1.5 rounded-md uppercase pointer-events-none">
        Render
      </div>
      <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white text-xs font-semibold tracking-wider px-3 py-1.5 rounded-md uppercase pointer-events-none">
        Base
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Resultado</h2>
          
          {outputWidth && outputHeight && (
            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
              <span>{outputWidth} × {outputHeight}</span>
              {requestedAspectRatio && requestedAspectRatio !== 'Original' && (
                <>
                  <span className="text-gray-300">•</span>
                  <span>{requestedAspectRatio}</span>
                </>
              )}
              {requestedResolution && requestedResolution !== 'Auto' && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-blue-600 bg-blue-50 px-2 rounded-full">{requestedResolution} solicitado</span>
                </>
              )}
            </div>
          )}
        </div>
        
        {durationMs > 0 && (
          <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-4 py-1.5 rounded-full">
            Concluído em {durationSec}s
          </span>
        )}
      </div>
      
      {sliderComponent}

      <div className="flex gap-4 justify-end flex-wrap">
        <button 
          onClick={() => setIsFullscreen(true)}
          className="px-6 py-3 border border-gray-300 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          TELA CHEIA
        </button>
        <button 
          onClick={handleDownload}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          DOWNLOAD RENDER
        </button>
      </div>

      {/* Lightbox / Fullscreen mode */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4">
          <button 
            className="absolute top-6 right-6 text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-colors z-10"
            onClick={() => setIsFullscreen(false)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          {sliderComponent}
        </div>
      )}
    </div>
  );
}
