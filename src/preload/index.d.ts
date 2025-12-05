import { ElectronAPI } from '@electron-toolkit/preload'

interface PipelineInput {
  originalImage: string
  maskImage: string
  labelImage: string
}

interface PipelineResult {
  edges: Array<Record<string, unknown>>
  seeds: Array<Record<string, unknown>>
}

interface PipelineResponse {
  success: boolean
  data?: PipelineResult
  error?: string
}

interface LoadImageResponse {
  success: boolean
  data?: string // base64 data URL
  error?: string
}

interface OpenImageDialogResponse {
  success: boolean
  data?: string // base64 data URL
  filePath?: string
  canceled?: boolean
  error?: string
}

interface ColorMapResponse {
  success: boolean
  data?: string // base64 data URL
  error?: string
}

type ColorMapMode = 'red' | 'green' | 'blue' | 'green-viridis'

interface PipelineConfig {
  connected_components: {
    connectivity: number
    min_area: number
  }
  seed_extraction: {
    base_segment_length: number
  }
  component_pairing: {
    max_distance_threshold: number
    max_cost_threshold: number
  }
}

interface PipelineConfigResponse {
  success: boolean
  data?: PipelineConfig
  error?: string
}

interface UpdateConfigResponse {
  success: boolean
  error?: string
}

interface API {
  loadImage: (filePath: string) => Promise<LoadImageResponse>
  openImageDialog: () => Promise<OpenImageDialogResponse>
  runPipeline: (input: PipelineInput) => Promise<PipelineResponse>
  applyColorMap: (imageDataURL: string, colorMap: ColorMapMode) => Promise<ColorMapResponse>
  getPipelineConfig: () => Promise<PipelineConfigResponse>
  updatePipelineConfig: (config: PipelineConfig) => Promise<UpdateConfigResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
