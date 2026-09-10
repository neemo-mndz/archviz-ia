import { RenderConfig } from '@/types/render';
import type { SketchUpScene } from '@/types/scene';
import { buildScenePromptContext } from '@/lib/scene-prompt-context';

export function buildRenderPrompt(config: RenderConfig, scene?: SketchUpScene): string {
  let prompt = `<SYSTEM_DIRECTIVE>
YOU ARE AN ARCHITECTURAL VISUALIZATION EXPERT.
THIS IS A STRICT IMAGE EDITING TASK. DO NOT RECREATE THE IMAGE.
YOUR JOB IS TO ENHANCE THE RENDER QUALITY WHILE ABSOLUTELY PRESERVING THE ARCHITECTURE AND GEOMETRY.
</SYSTEM_DIRECTIVE>\n\n`;

  // --- GEOMETRY & ARCHITECTURE LOCK ---
  prompt += `<GEOMETRY_LOCK>\n`;
  prompt += `The supplied base image is the single authoritative source of truth.\n`;
  prompt += `PRESERVE EXACTLY:\n`;
  prompt += `- Camera position, viewpoint, and perspective\n`;
  prompt += `- Building geometry, volumetry, and facade proportions\n`;
  prompt += `- Openings, windows, doors, stairs, ramps, railings, roofs\n`;
  prompt += `- Terrain, level differences, and spatial relationships\n`;
  prompt += `- Surrounding buildings and urban context\n`;

  if (config.fidelity === 'Maximum') {
    prompt += `\nFIDELITY LEVEL: MAXIMUM. STRICT ADHERENCE REQUIRED. ANY ARCHITECTURAL ALTERATION IS STRICTLY FORBIDDEN. DO NOT ADD OR REMOVE STRUCTURAL ELEMENTS.\n`;
  } else if (config.fidelity === 'High') {
    prompt += `\nFIDELITY LEVEL: HIGH. Preserve architecture strictly. Minor detailing (e.g., adding subtle window frames) is allowed ONLY if it respects the original bounding boxes.\n`;
  } else if (config.fidelity === 'Balanced') {
    prompt += `\nFIDELITY LEVEL: BALANCED. Keep core geometry strictly intact. Minor realism adjustments permitted.\n`;
  }
  prompt += `</GEOMETRY_LOCK>\n\n`;

  // --- ENVIRONMENT & ENTOURAGE ---
  prompt += `<ENVIRONMENT_AND_ENTOURAGE>\n`;
  prompt += `DO NOT alter the layout of streets, sidewalks, or existing vegetation unless strictly necessary to match the requested density.\n`;
  
  if (config.people !== 'Default') prompt += `- People Density: ${config.people}\n`;
  if (config.vehicles !== 'Default') prompt += `- Vehicles Density: ${config.vehicles}\n`;
  if (config.vegetation !== 'Default') prompt += `- Vegetation Density: ${config.vegetation}\n`;
  prompt += `</ENVIRONMENT_AND_ENTOURAGE>\n\n`;

  // --- RENDER INTENT ---
  prompt += `<RENDER_INTENT>\n`;
  prompt += `Focus purely on achieving a photorealistic architectural visualization.\n`;
  prompt += `Enhance lighting, physically plausible shadows, reflections (especially glass), and photographic atmosphere.\n`;

  if (config.lighting && config.lighting !== 'Default') {
    prompt += `- Lighting Condition: ${config.lighting}\n`;
  }
  if (config.weather && config.weather !== 'Default') {
    prompt += `- Weather/Atmosphere: ${config.weather}\n`;
  }
  if (config.materialCondition && config.materialCondition !== 'Preserve Original') {
    prompt += `- Material Condition: ${config.materialCondition}\n`;
  }
  prompt += `</RENDER_INTENT>\n\n`;

  // --- NEGATIVE PROMPT ---
  prompt += `<NEGATIVE_PROMPT>\n`;
  prompt += `DO NOT add dirt, stains, damage, artificial aging, excessive weathering, or wet pavement unless explicitly requested.\n`;
  prompt += `DO NOT redesign the architecture or invent new shapes.\n`;
  prompt += `DO NOT change the time of day if it conflicts with the Lighting Condition.\n`;
  prompt += `</NEGATIVE_PROMPT>\n`;

  // --- OUTPUT FORMAT ---
  prompt += `<OUTPUT_FORMAT>\n`;
  if (config.aspectRatio && config.aspectRatio !== 'Original') {
    prompt += `Requested aspect ratio: ${config.aspectRatio}\n`;
  }
  if (config.resolution && config.resolution !== 'Auto') {
    prompt += `Requested output resolution: ${config.resolution}\n`;
  }
  
  if (!config.aspectRatio || config.aspectRatio === 'Original') {
    prompt += `Preserve the exact aspect ratio and framing of the supplied base image.\n`;
  } else {
    prompt += `Preserve the architectural subject and camera perspective.\n`;
    prompt += `If canvas expansion is required to achieve the requested aspect ratio (${config.aspectRatio}), extend only peripheral contextual areas such as sky, ground and surroundings.\n`;
    prompt += `Do not crop, stretch, deform or redesign the architecture merely to satisfy the requested aspect ratio.\n`;
  }
  prompt += `</OUTPUT_FORMAT>\n\n`;

  if (config.additionalInstructions) {
    prompt += `<USER_CUSTOM_INSTRUCTIONS>\n${config.additionalInstructions}\n</USER_CUSTOM_INSTRUCTIONS>\n`;
  }

  return scene ? prompt + '\n' + buildScenePromptContext(scene) : prompt;
}
