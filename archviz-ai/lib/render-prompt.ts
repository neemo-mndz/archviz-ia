import { RenderConfig } from '@/types/render';

export function buildRenderPrompt(config: RenderConfig): string {
  const basePrompt = `This is an image editing task, not an architectural redesign task.

The supplied image is the authoritative source for architecture, geometry, camera, framing and surroundings.

Preserve the existing building and scene.

Improve only photographic realism, material response, reflections, shadows, lighting and surface detail.

Do not redesign the architecture.

Do not change camera or composition.

Do not create a different building.`;

  const configParts = [];

  if (config.lighting !== 'Padrão') {
    configParts.push(`Lighting: ${config.lighting}.`);
  }
  
  if (config.fidelity !== 'Estrita') {
    if (config.fidelity === 'Equilibrada') {
      configParts.push(`Fidelity: Balanced. Allow minor adjustments for realism while keeping the core geometry.`);
    } else if (config.fidelity === 'Criativa') {
      configParts.push(`Fidelity: Creative. Allow more freedom in interpreting materials and subtle architectural details, but keep the main shapes.`);
    }
  }

  if (config.people !== 'Padrão') {
    configParts.push(`People density: ${config.people}.`);
  }

  if (config.vehicles !== 'Padrão') {
    configParts.push(`Vehicle density: ${config.vehicles}.`);
  }

  if (config.vegetation !== 'Padrão') {
    configParts.push(`Vegetation density: ${config.vegetation}.`);
  }

  if (config.materialCondition !== 'Preservar imagem') {
    configParts.push(`Material condition: ${config.materialCondition}.`);
  }

  if (config.additionalInstructions) {
    configParts.push(`\nAdditional Instructions:\n${config.additionalInstructions}`);
  }

  const finalPrompt = configParts.length > 0 
    ? `${basePrompt}\n\nSpecific settings to apply:\n${configParts.join('\n')}`
    : basePrompt;

  return finalPrompt;
}
