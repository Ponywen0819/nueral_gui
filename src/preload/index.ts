import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Load an image file from a given path (supports TIFF and other formats)
  loadImage: async (filePath: string): Promise<{
    success: boolean
    data?: string // base64 data URL
    error?: string
  }> => {
    return await ipcRenderer.invoke('load-image', filePath)
  },

  // Open native file dialog to select an image
  openImageDialog: async (): Promise<{
    success: boolean
    data?: string // base64 data URL
    filePath?: string
    canceled?: boolean
    error?: string
  }> => {
    return await ipcRenderer.invoke('open-image-dialog')
  },

  runPipeline: async (input: {
    originalImage: string
    maskImage: string
    labelImage: string
  }): Promise<{
    success: boolean
    data?: {
      edges: Array<Record<string, unknown>>
      seeds: Array<Record<string, unknown>>
    }
    error?: string
  }> => {
    return await ipcRenderer.invoke('run-pipeline', input)
  },

  // Apply color map to image
  applyColorMap: async (
    imageDataURL: string,
    colorMap: 'red' | 'green' | 'blue' | 'green-viridis'
  ): Promise<{
    success: boolean
    data?: string // base64 data URL
    error?: string
  }> => {
    return await ipcRenderer.invoke('apply-color-map', imageDataURL, colorMap)
  },

  // Get pipeline configuration
  getPipelineConfig: async (): Promise<{
    success: boolean
    data?: {
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
    error?: string
  }> => {
    return await ipcRenderer.invoke('get-pipeline-config')
  },

  // Update pipeline configuration
  updatePipelineConfig: async (config: {
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
  }): Promise<{
    success: boolean
    error?: string
  }> => {
    return await ipcRenderer.invoke('update-pipeline-config', config)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
