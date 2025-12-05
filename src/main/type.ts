// Types for pipeline
export interface PipelineInput {
  originalImage: string // base64 data URL
  maskImage: string // base64 data URL
  labelImage: string // base64 data URL
}

export interface PipelineResult {
  edges: Array<Record<string, unknown>>
  seeds: Array<Record<string, unknown>>
}

export type ColorMapMode = 'red' | 'green' | 'blue' | 'green-viridis'
