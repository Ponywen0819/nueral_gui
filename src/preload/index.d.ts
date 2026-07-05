import { ElectronAPI } from '@electron-toolkit/preload'

interface PipelineImages {
  originalImage: string
  maskImage: string
  labelImage: string
}

interface PipelineParams {
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

interface EditedGraph {
  nodes: Array<{ y: number; x: number; attrs?: Record<string, unknown> }>
  edges: Array<{
    u: [number, number]
    v: [number, number]
    path?: Array<[number, number]>
    attrs?: Record<string, unknown>
  }>
}

interface StageArgs {
  images: PipelineImages
  params: PipelineParams
  editedGraph?: EditedGraph
}

interface GraphPayload {
  seeds: Array<[number, number]>
  edges: Array<{ path: Array<[number, number]>; isEffective: boolean }>
}

interface StageResponse {
  success: boolean
  error?: string
}

interface RoiResponse {
  success: boolean
  data?: { roiMaskDataURL: string }
  error?: string
}

interface PreprocessResponse {
  success: boolean
  data?: { preprocessDataURL: string }
  error?: string
}

interface ReconstructResponse {
  success: boolean
  data?: GraphPayload
  error?: string
}

interface CountResponse {
  success: boolean
  data?: GraphPayload & { validCount: number }
  error?: string
}

interface LoadImageResponse {
  success: boolean
  data?: string
  error?: string
}

interface OpenImageDialogResponse {
  success: boolean
  data?: string
  filePath?: string
  canceled?: boolean
  error?: string
}

interface ColorMapResponse {
  success: boolean
  data?: string
  error?: string
}

interface SaveFileArgs {
  defaultName: string
  data: string
  encoding: 'utf8' | 'base64'
  filters?: { name: string; extensions: string[] }[]
}

interface SaveFileResponse {
  success: boolean
  filePath?: string
  canceled?: boolean
  error?: string
}

interface SampleFiles {
  name: string
  image: string | null
  epidermis: string | null
  particle: string | null
}

interface SelectWorkDirResponse {
  success: boolean
  dir?: string
  canceled?: boolean
  error?: string
}

interface ListSamplesResponse {
  success: boolean
  samples?: SampleFiles[]
  error?: string
}

interface WriteSampleFileArgs {
  dir: string
  name: string
  file: string
  data: string
}

interface ReadSampleFileArgs {
  dir: string
  name: string
  file: string
}

interface ReadSampleFileResponse {
  success: boolean
  data?: string | null
  error?: string
}

type ColorMapMode = 'red' | 'green' | 'blue' | 'green-viridis'

interface API {
  loadImage: (filePath: string) => Promise<LoadImageResponse>
  openImageDialog: () => Promise<OpenImageDialogResponse>
  applyColorMap: (imageDataURL: string, colorMap: ColorMapMode) => Promise<ColorMapResponse>
  saveFile: (args: SaveFileArgs) => Promise<SaveFileResponse>
  selectWorkDir: () => Promise<SelectWorkDirResponse>
  listSamples: (dir: string) => Promise<ListSamplesResponse>
  writeSampleFile: (args: WriteSampleFileArgs) => Promise<{ success: boolean; error?: string }>
  readSampleFile: (args: ReadSampleFileArgs) => Promise<ReadSampleFileResponse>
  pipelineRoi: (args: StageArgs) => Promise<RoiResponse>
  pipelinePreprocess: (args: StageArgs) => Promise<PreprocessResponse>
  pipelineReconstruct: (args: StageArgs) => Promise<ReconstructResponse>
  pipelineCount: (args: StageArgs) => Promise<CountResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
