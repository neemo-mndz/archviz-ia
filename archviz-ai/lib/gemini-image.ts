export async function generateRender(imageBase64: string, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured no servidor.');
  }

  const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
  const mimeType = imageBase64.includes('data:') ? imageBase64.split('data:')[1].split(';')[0] : 'image/jpeg';

  const model = "gemini-3.1-flash-image";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2, // Low temperature for more strict fidelity
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API Error:', errorText);
    throw new Error(`Falha na Gemini API: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  try {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    
    // Look for image inlineData in response parts
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
      }
    }
    
    // Fallback if model returns text containing a data URL or just text (should not happen if it's an image model)
    if (parts[0]?.text) {
      throw new Error('API retornou texto em vez de imagem.');
    }

    throw new Error('Nenhuma imagem retornada no payload (inlineData ausente).');
  } catch (error) {
    console.error('Error parsing Gemini response:', error);
    throw new Error('Falha ao processar a resposta visual da IA.');
  }
}
