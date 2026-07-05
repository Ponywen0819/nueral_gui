import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { writeFile, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import sharp from 'sharp'
import icon from '../../resources/icon.png?asset'
import { loadImageAsDataURL, dataURLToBuffer } from './utils'
import { applyColorMap } from './color_map'
import {
  closePythonWorker,
  pipelineRoi,
  pipelinePreprocess,
  pipelineReconstruct,
  pipelineCount
} from './pipeline'
import type {
  PipelineImages,
  PipelineParams,
  EditedGraph,
  ColorMapMode
} from './type'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // IPC handler for loading images (supports TIFF and other formats)
  ipcMain.handle('load-image', async (_, filePath: string) => {
    try {
      const dataURL = await loadImageAsDataURL(filePath)
      return { success: true, data: dataURL }
    } catch (error) {
      console.error('Image loading failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // IPC handler for opening file dialog
  ipcMain.handle('open-image-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'bmp', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    try {
      const filePath = result.filePaths[0]
      const dataURL = await loadImageAsDataURL(filePath)
      return { success: true, data: dataURL, filePath }
    } catch (error) {
      console.error('Image loading failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // ── Pipeline stages ────────────────────────────────────────────────────
  // Each stage is its own IPC channel. The main process holds session state
  // across calls; intermediate work is memoised by the linker's
  // StageOrchestrator so re-running a later stage with the same params is
  // effectively free.
  type StageArgs = {
    images: PipelineImages
    params: PipelineParams
    editedGraph?: EditedGraph
  }

  ipcMain.handle('pipeline:roi', async (_, args: StageArgs) => {
    try {
      const data = await pipelineRoi(args.images, args.params)
      return { success: true, data }
    } catch (error) {
      console.error('Pipeline ROI failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('pipeline:preprocess', async (_, args: StageArgs) => {
    try {
      const data = await pipelinePreprocess(args.images, args.params)
      return { success: true, data }
    } catch (error) {
      console.error('Pipeline preprocess failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('pipeline:reconstruct', async (_, args: StageArgs) => {
    try {
      const data = await pipelineReconstruct(args.images, args.params)
      return { success: true, data }
    } catch (error) {
      console.error('Pipeline reconstruct failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('pipeline:count', async (_, args: StageArgs) => {
    try {
      const data = await pipelineCount(args.images, args.params, args.editedGraph)
      return { success: true, data }
    } catch (error) {
      console.error('Pipeline count failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // IPC handler for saving a file via a native save dialog.
  // `encoding` selects how `data` is interpreted: 'utf8' for text (JSON),
  // 'base64' for binary payloads (e.g. a PNG data URL's base64 body).
  ipcMain.handle(
    'save-file',
    async (
      _,
      args: {
        defaultName: string
        data: string
        encoding: 'utf8' | 'base64'
        filters?: { name: string; extensions: string[] }[]
      }
    ) => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: args.defaultName,
          filters: args.filters
        })
        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true }
        }
        const buffer = Buffer.from(args.data, args.encoding)
        await writeFile(result.filePath, buffer)
        return { success: true, filePath: result.filePath }
      } catch (error) {
        console.error('Save file failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  // Auto-save: write/read a per-sample project file directly inside the
  // sample folder (no dialog). `dir` is the working folder, `name` the sample
  // sub-folder, `file` the project filename.
  ipcMain.handle(
    'write-sample-file',
    async (_, args: { dir: string; name: string; file: string; data: string }) => {
      try {
        await writeFile(join(args.dir, args.name, args.file), args.data, 'utf-8')
        return { success: true }
      } catch (error) {
        console.error('Write sample file failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  // Overwrite an image file on disk with an edited mask (particle painting).
  // Normalizes to a clean binary mask; sharp picks the encoder from the target
  // path's extension, so the original file format is preserved.
  ipcMain.handle('save-mask', async (_, args: { filePath: string; dataURL: string }) => {
    try {
      const buffer = dataURLToBuffer(args.dataURL)
      await sharp(buffer).grayscale().threshold(128).toFile(args.filePath)
      return { success: true }
    } catch (error) {
      console.error('Save mask failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle(
    'read-sample-file',
    async (_, args: { dir: string; name: string; file: string }) => {
      try {
        const data = await readFile(join(args.dir, args.name, args.file), 'utf-8')
        return { success: true, data }
      } catch {
        // Missing file is normal (sample not yet saved) — return null, not error.
        return { success: true, data: null }
      }
    }
  )

  // ── Working folder / sample browser ─────────────────────────────────────
  // A working folder holds one sub-folder per sample. Each sample folder has
  // three image files whose names start with `image`, `epidermis`, `particle`.
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp', '.bmp', '.gif'])
  const pickLayerFile = (files: string[], keyword: string): string | null => {
    const match = files.find((name) => {
      const lower = name.toLowerCase()
      const ext = lower.slice(lower.lastIndexOf('.'))
      return IMAGE_EXTS.has(ext) && lower.startsWith(keyword)
    })
    return match ?? null
  }

  ipcMain.handle('select-work-dir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    return { success: true, dir: result.filePaths[0] }
  })

  ipcMain.handle('list-samples', async (_, dir: string) => {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const samples = await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map(async (d) => {
            const subPath = join(dir, d.name)
            let files: string[] = []
            try {
              files = await readdir(subPath)
            } catch {
              // Unreadable sub-folder — treated as having no layer files.
            }
            const pick = (kw: string): string | null => {
              const f = pickLayerFile(files, kw)
              return f ? join(subPath, f) : null
            }
            return {
              name: d.name,
              image: pick('image'),
              epidermis: pick('epidermis'),
              particle: pick('particle')
            }
          })
      )
      // Only folders with at least an original image are usable samples.
      const usable = samples.filter((s) => s.image).sort((a, b) => a.name.localeCompare(b.name))
      return { success: true, samples: usable }
    } catch (error) {
      console.error('List samples failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // IPC handler for applying color map to image
  ipcMain.handle('apply-color-map', async (_, imageDataURL: string, colorMap: ColorMapMode) => {
    try {
      const result = await applyColorMap(imageDataURL, colorMap)
      return { success: true, data: result }
    } catch (error) {
      console.error('Color map application failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let workerCleanupDone = false
app.on('before-quit', (event) => {
  if (workerCleanupDone) return
  event.preventDefault()
  closePythonWorker()
    .catch((err) => console.error('Python worker close failed:', err))
    .finally(() => {
      workerCleanupDone = true
      app.quit()
    })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
