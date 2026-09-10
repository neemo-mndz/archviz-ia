export type RenderOrigin = 'web' | 'sketchup';
export type Vector3 = [number, number, number];

/** MVP 0.1: objects are top-level groups/components, without hierarchy analysis. */
export interface SketchUpScene {
  schemaVersion: '1.0';
  source: 'sketchup';
  units: 'inch';
  viewport: { width: number; height: number };
  camera: {
    eye: Vector3; target: Vector3; up: Vector3;
    perspective: boolean; fovDegrees: number | null;
    aspectRatio?: number;
  };
  scene: { name: string | null };
  model: { name: string; materialCount: number; objectCount: number };
  materials: Array<{
    name: string;
    color?: string;
    opacity?: number;
    texture?: { name: string; width: number; height: number } | null;
  }>;
  objects: Array<{
    name: string; definitionName: string; type: 'group' | 'component';
    material: string; tag: string; hidden: boolean;
  }>;
}
