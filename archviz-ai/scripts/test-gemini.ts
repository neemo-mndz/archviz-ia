import { generateRender } from '../lib/gemini-image';



async function runTest() {
  try {
    // 1x1 pixel black JPEG
    const smallJpegBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAGBAQABPxA=';
    
    const prompt = 'Edit this image and improve photographic realism while preserving the architecture.';
    
    console.log('Sending request to Gemini...');
    const result = await generateRender(smallJpegBase64, prompt);
    console.log('Success! Received base64 image starting with:', result.substring(0, 50));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest();
