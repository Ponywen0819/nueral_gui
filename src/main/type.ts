// Types for pipeline
export interface PipelineParams {
  offset_px: number
  bg_kernel_radius: number
  clahe_clip: number
  clahe_grid_size: number
  sato_sigmas_start: number
  sato_sigmas_stop: number
  prune_threshold: number
  min_tree_components: number
  stub_length_threshold: number
}

export interface PipelineImages {
  originalImage: string // base64 data URL
  maskImage: string // base64 data URL
  labelImage: string // base64 data URL
}

export interface RoiResult {
  roiMaskDataURL: string
}

export interface PreprocessResult {
  preprocessDataURL: string
}

export interface ReconstructResult {
  seeds: Array<[number, number]>
  edges: Array<{ path: Array<[number, number]>; isEffective: boolean }>
}

export interface CountResult {
  validCount: number
  seeds: Array<[number, number]>
  edges: Array<{ path: Array<[number, number]>; isEffective: boolean }>
}

/** Serialized graph the renderer sends back for re-counting after edits.
 *  Mirrors `extract_graph` shape; attrs are passed through unchanged. */
export interface EditedGraph {
  nodes: Array<{ y: number; x: number; attrs?: Record<string, unknown> }>
  edges: Array<{
    u: [number, number]
    v: [number, number]
    path?: Array<[number, number]>
    attrs?: Record<string, unknown>
  }>
}

export type ColorMapMode = 'red' | 'green' | 'blue' | 'green-viridis'
