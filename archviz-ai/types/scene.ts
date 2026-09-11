export type RenderOrigin = 'web' | 'sketchup';
export type Vector3 = [number, number, number];

export interface GeometrySurfaceFact {
  id: string;
  scope: string;
  ownerName?: string;
  tag?: string;
  area: number;
  normal: Vector3;
  loopCount: number;
  innerLoopCount: number;
}

export interface GeometryFacts {
  surfaceCount: number;
  reportedSurfaceCount: number;
  surfacesWithInnerLoops: number;
  continuousSurfaces: number;
  collectionLimit: number;
  strategy: string;
  surfaces: GeometrySurfaceFact[];
}

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
  geometryFacts?: GeometryFacts;
}
