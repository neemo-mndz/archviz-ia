// Single local Node engine. Kept across development module reloads.
const state = globalThis as typeof globalThis & { archvizRenderAdmission?: boolean };

export function acquireRenderAdmission(): (() => void) | null {
  if (state.archvizRenderAdmission) return null;
  state.archvizRenderAdmission = true;
  return () => { state.archvizRenderAdmission = false; };
}
