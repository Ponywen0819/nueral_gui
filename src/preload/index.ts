import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

  saveFile: async (args: {
    defaultName: string
    data: string
    encoding: 'utf8' | 'base64'
    filters?: { name: string; extensions: string[] }[]
  }): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> => {
    return await ipcRenderer.invoke('save-file', args)
  },

  selectWorkDir: async (): Promise<{
    success: boolean
    dir?: string
    canceled?: boolean
    error?: string
  }> => {
    return await ipcRenderer.invoke('select-work-dir')
  },

  listSamples: async (
    dir: string
  ): Promise<{
    success: boolean
    samples?: Array<{
      name: string
      image: string | null
      epidermis: string | null
      particle: string | null
    }>
    error?: string
  }> => {
    return await ipcRenderer.invoke('list-samples', dir)
  },

  writeSampleFile: async (args: {
    dir: string
    name: string
    file: string
    data: string
  }): Promise<{ success: boolean; error?: string }> => {
    return await ipcRenderer.invoke('write-sample-file', args)
  },

  readSampleFile: async (args: {
    dir: string
    name: string
    file: string
  }): Promise<{ success: boolean; data?: string | null; error?: string }> => {
    return await ipcRenderer.invoke('read-sample-file', args)
  },

  // Overwrite an image file (e.g. the particle mask) with an edited PNG data URL.
  saveMask: async (args: {
    filePath: string
    dataURL: string
  }): Promise<{ success: boolean; error?: string }> => {
    return await ipcRenderer.invoke('save-mask', args)
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
