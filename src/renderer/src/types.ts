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
  isEffective?: boolean; // True for edges that are part of an effective crossing segment
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

export type EditMode = 'view' | 'edit' | 'particle';

export interface ImageLayers {
  original: string | null;
  mask: string | null;
  annotation: string | null;
  roiMask: string | null; // populated after the ROI stage runs
  preprocess: string | null; // populated after the Preprocess stage runs (Sato-enhanced fiber map)
}

export type ColorMapMode = 'red' | 'green' | 'blue' | 'green-viridis';

// A sample sub-folder inside the working directory. Paths are absolute file
// paths (null when that layer's file is missing).
export interface SampleFiles {
  name: string;
  image: string | null;
  epidermis: string | null;
  particle: string | null;
}

export interface PipelineParams {
  // Preprocessing
  offset_px: number;
  bg_kernel_radius: number; // actual kernel size = 2 * r + 1
  clahe_clip: number;
  clahe_grid_size: number; // CLAHE tile grid is square: (size, size)
  sato_sigmas_start: number;
  sato_sigmas_stop: number;
  // Pathfinding
  prune_threshold: number;
  // Postprocessing
  min_tree_components: number;
  stub_length_threshold: number;
}

export const DEFAULT_PIPELINE_PARAMS: PipelineParams = {
  offset_px: 50,
  bg_kernel_radius: 2, // 2*2+1 = 5 kernel
  clahe_clip: 40.0,
  clahe_grid_size: 768,
  sato_sigmas_start: 1,
  sato_sigmas_stop: 4,
  prune_threshold: 20.0,
  min_tree_components: 0,
  stub_length_threshold: 3
};

export interface LayerSettings {
  showOriginal: boolean;
  originalOpacity: number; // 0 to 1
  originalColorMap: ColorMapMode; // Color mapping mode for original image
  showMask: boolean;
  maskOpacity: number; // 0 to 1
  maskColor: string; // CSS color (#rrggbb) — tints white pixels of the binary mask
  showAnnotation: boolean;
  annotationOpacity: number; // 0 to 1
  annotationColor: string; // CSS color (#rrggbb) — tints white pixels of the binary annotation
  showRoi: boolean;
  roiOpacity: number;
  roiColor: string;
  showPreprocess: boolean;
  preprocessOpacity: number;
  preprocessColor: string;
  showGraph: boolean; // reconstruction result (nodes + edges overlay)
}

