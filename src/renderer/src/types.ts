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
  preprocessing: {
    dermis_offset_px: number;
    rolling_ball_radius: number;
    sato_weight: number;
    sato_sigmas: [number, number];
    chan_vese_mu: number;
    chan_vese_lambda1: number;
    chan_vese_lambda2: number;
    chan_vese_tol: number;
    chan_vese_max_iter: number;
    chan_vese_dt: number;
    morphology_kernel_size: number;
  };
  reconstruction: {
    segment_length: number;
    search_radius: number;
    path_finding_bbox_padding: number;
  };
}