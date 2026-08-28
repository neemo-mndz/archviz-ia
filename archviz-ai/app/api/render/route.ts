import { NextRequest, NextResponse } from 'next/server';
import { buildRenderPrompt } from '@/lib/render-prompt';
import { generateRender } from '@/lib/gemini-image';
import { RenderConfig } from '@/types/render';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    const image = formData.get('image') as File | null;
    const lighting = formData.get('lighting') as string || 'Padrão';
    const fidelity = formData.get('fidelity') as string || 'Estrita';
    const people = formData.get('people') as string || 'Padrão';
    const vehicles = formData.get('vehicles') as string || 'Padrão';
    const vegetation = formData.get('vegetation') as string || 'Padrão';
    const materialCondition = formData.get('materialCondition') as string || 'Preservar imagem';
    const additionalInstructions = formData.get('additionalInstructions') as string || '';

    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 });
    }

    // Convert file to base64
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = `data:${image.type};base64,${buffer.toString('base64')}`;

    const config: RenderConfig = {
      lighting: lighting as any,
      fidelity: fidelity as any,
      people: people as any,
      vehicles: vehicles as any,
      vegetation: vegetation as any,
      materialCondition: materialCondition as any,
      additionalInstructions
    };

    const prompt = buildRenderPrompt(config);

    const startTime = Date.now();
    
    // Call Gemini Image API
    const generatedImageBase64 = await generateRender(base64Image, prompt);
    
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    return NextResponse.json({
      success: true,
      image: generatedImageBase64,
      metadata: {
        model: 'gemini-3.1-flash-image',
        durationMs
      }
    });
  } catch (error: any) {
    console.error('Render API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'An unexpected error occurred during rendering.' 
    }, { status: 500 });
  }
}
