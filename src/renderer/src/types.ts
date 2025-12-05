export interface Point {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  path?: Point[]; // Optional curved path for edges (array of coordinate points)
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export type EditMode = 'view' | 'edit';

export interface ImageLayers {
  original: string | null;
  mask: string | null;
  annotation: string | null;
}

export type ColorMapMode = 'red' | 'green' | 'blue' | 'green-viridis';

export interface LayerSettings {
  showOriginal: boolean;
  originalOpacity: number; // 0 to 1
  originalColorMap: ColorMapMode; // Color mapping mode for original image
  showMask: boolean;
  maskOpacity: number; // 0 to 1
  showAnnotation: boolean;
  annotationOpacity: number; // 0 to 1
}

export interface PipelineConfig {
  connected_components: {
    connectivity: number; // 4 or 8
    min_area: number;
  };
  seed_extraction: {
    base_segment_length: number;
  };
  component_pairing: {
    max_distance_threshold: number;
    max_cost_threshold: number;
  };
}