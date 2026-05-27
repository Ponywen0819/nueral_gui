import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface PipelineImages {
  originalImage: string
  maskImage: string
  labelImage: string
}

interface PipelineParams {
  offset_px: number
  bg_kernel_size: number
  clahe_clip: number
  clahe_grid_size: number
  sato_sigmas_start: number
  sato_sigmas_stop: number
  connectivity: number
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

const api = {
  loadImage: async (
    filePath: string
  ): Promise<{ success: boolean; data?: string; error?: string }> => {
    return await ipcRenderer.invoke('load-image', filePath)
  },

  openImageDialog: async (): Promise<{
    success: boolean
    data?: string
    filePath?: string
    canceled?: boolean
    error?: string
  }> => {
    return await ipcRenderer.invoke('open-image-dialog')
  },

  applyColorMap: async (
    imageDataURL: string,
    colorMap: 'red' | 'green' | 'blue' | 'green-viridis'
  ): Promise<{ success: boolean; data?: string; error?: string }> => {
    return await ipcRenderer.invoke('apply-color-map', imageDataURL, colorMap)
  },

  pipelineRoi: async (args: StageArgs): Promise<RoiResponse> => {
    return await ipcRenderer.invoke('pipeline:roi', args)
  },
  pipelinePreprocess: async (args: StageArgs): Promise<PreprocessResponse> => {
    return await ipcRenderer.invoke('pipeline:preprocess', args)
  },
  pipelineReconstruct: async (args: StageArgs): Promise<ReconstructResponse> => {
    return await ipcRenderer.invoke('pipeline:reconstruct', args)
  },
  pipelineCount: async (args: StageArgs): Promise<CountResponse> => {
    return await ipcRenderer.invoke('pipeline:count', args)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
