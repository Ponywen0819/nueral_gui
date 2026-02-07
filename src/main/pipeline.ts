import type { PipelineInput, PipelineResult } from './type'
import { app } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, rm, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dataURLToBuffer } from './utils'
import { is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'

// Main pipeline execution function
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const imageId = 'temp-' + Date.now()
  const tempDataDir = join(app.getPath('temp'), 'neurotrace-data')
  const imageDir = join(tempDataDir, imageId)
  const outputDir = is.dev
    ? join(process.cwd(), 'resources/pipeline-output')
    : join(app.getPath('userData'), 'pipeline-output')

  try {
    // Create directory structure: {tempDataDir}/{imageId}/
    await mkdir(imageDir, { recursive: true })
    await mkdir(outputDir, { recursive: true })

    // Save images in expected structure
    await writeFile(join(imageDir, 'image.png'), dataURLToBuffer(input.originalImage))
    await writeFile(join(imageDir, 'mask.png'), dataURLToBuffer(input.maskImage))
    await writeFile(join(imageDir, 'annotation.png'), dataURLToBuffer(input.labelImage))

    // Get script path
    const scriptPath = is.dev
      ? join(process.cwd(), 'resources/script.py')
      : join(process.resourcesPath, 'script.py')

    // Execute script with its expected arguments
    const args = [
      'run',
      scriptPath,
      '--image_id',
      imageId,
      '--data_dir',
      tempDataDir,
      '--output_dir',
      outputDir,
      '--save-json'
    ]

    console.log('Executing pipeline: uv', args)

    // Execute pipeline using spawn
    await new Promise<void>((resolve, reject) => {
      const child = spawn('uv', args, {
        stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout and stderr for debugging
      })

      let stderrData = ''
      let stdoutData = ''

      child.stdout?.on('data', (data) => {
        stdoutData += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderrData += data.toString()
      })

      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('Pipeline execution timeout (5 minutes)'))
      }, 300000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve()
        } else {
          const errorMsg = `Pipeline exited with code ${code}\nStderr: ${stderrData}\nStdout: ${stdoutData}`
          console.error(errorMsg)
          reject(new Error(errorMsg))
        }
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    // Read JSON output file
    const jsonPath = join(outputDir, `${imageId}_result.json`)
    if (!existsSync(jsonPath)) {
      throw new Error('Pipeline did not generate expected JSON output file')
    }

    const jsonData = JSON.parse(await readFile(jsonPath, 'utf-8'))

    // Extract nodes and edges from JSON structure
    const seeds = jsonData.topology_points || []
    const edges: Array<Record<string, unknown>> = []

    for (const tree of jsonData.mst_trees || []) {
      for (const edge of tree.edges || []) {
        edges.push({
          path: edge.path || []
        })
      }
    }

    return { edges, seeds }
  } finally {
    // Cleanup temp directory
    if (existsSync(imageDir)) {
      await rm(imageDir, { recursive: true, force: true })
    }
  }
}
