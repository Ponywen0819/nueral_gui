import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadImageAsDataURL } from './utils'
import { applyColorMap } from './color_map'
import { runPipeline } from './pipeline'
import type { PipelineInput, ColorMapMode } from './type'
import * as yaml from 'js-yaml'

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

  // IPC handler for pipeline execution
  ipcMain.handle('run-pipeline', async (_, input: PipelineInput) => {
    try {
      const result = await runPipeline(input)
      return { success: true, data: result }
    } catch (error) {
      console.error('Pipeline execution failed:', error)
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

  // IPC handler for reading pipeline config
  ipcMain.handle('get-pipeline-config', async () => {
    try {
      let configPath = join(__dirname, '../../resources/ienf_q/config/app.yaml')
      let config: unknown = {}
      if (existsSync(configPath) === false) {
        const fileContent = readFileSync(
          join(__dirname, '../../resources/ienf_q/config/default.yaml'),
          'utf8'
        )
        config = yaml.load(fileContent)
        const yamlContent = yaml.dump(config, {
          indent: 2,
          lineWidth: -1,
          noRefs: true
        })
        writeFileSync(configPath, yamlContent, 'utf8')
      } else {
        const fileContent = readFileSync(configPath, 'utf8')
        config = yaml.load(fileContent)
      }

      return { success: true, data: config }
    } catch (error) {
      console.error('Failed to read pipeline config:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // IPC handler for updating pipeline config
  ipcMain.handle('update-pipeline-config', async (_, config: Record<string, unknown>) => {
    try {
      const configPath = join(__dirname, '../../resources/ienf_q/config/app.yaml')
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      })
      writeFileSync(configPath, yamlContent, 'utf8')
      return { success: true }
    } catch (error) {
      console.error('Failed to update pipeline config:', error)
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
