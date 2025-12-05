import type { PipelineInput, PipelineResult } from './type'
import { app } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { dataURLToBuffer, parseJSONL } from './utils'
import { is } from '@electron-toolkit/utils'
import { spawn } from 'child_process'
// Main pipeline execution function
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const tempDir = join(app.getPath('temp'), 'neurotrace-pipeline-' + Date.now())
  const outputDir = is.dev
    ? join(process.cwd(), 'resources/pipeline-output')
    : join(app.getPath('userData'), 'pipeline-output')

  try {
    // Create temp and output directories
    await mkdir(tempDir, { recursive: true })
    await mkdir(outputDir, { recursive: true })

    // Save images to temp files
    const originalPath = join(tempDir, 'original.png')
    const maskPath = join(tempDir, 'mask.png')
    const labelPath = join(tempDir, 'label.png')

    await writeFile(originalPath, dataURLToBuffer(input.originalImage))
    await writeFile(maskPath, dataURLToBuffer(input.maskImage))
    await writeFile(labelPath, dataURLToBuffer(input.labelImage))

    // Get Python script path (in development vs production)
    const scriptPath = is.dev
      ? join(process.cwd(), 'resources/ienf_q/script/run_pipeline.py')
      : join(process.resourcesPath, 'ienf_q/script/run_pipeline.py')

    const configPath = is.dev
      ? join(process.cwd(), 'resources/ienf_q/config/app.yaml')
      : join(process.resourcesPath, 'resources/ienf_q/config/app.yaml')
    // Execute pipeline using uv
    const args = [
      'run',
      scriptPath,
      '--original_image',
      originalPath,
      '--epidermis_mask',
      maskPath,
      '--label_image',
      labelPath,
      '--output_dir',
      outputDir,
      '--config',
      configPath
    ]

    console.log('Executing pipeline: uv', args)

    // Execute pipeline using spawn (streams output without buffering)
    await new Promise<void>((resolve, reject) => {
      const child = spawn('uv', args, {
        stdio: 'ignore' // Discard all stdio to avoid memory usage
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
          reject(new Error(`Pipeline exited with code ${code}`))
        }
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    // Read and parse output files
    const edgePath = join(outputDir, 'mst_edges.txt')
    const seedPath = join(outputDir, 'all_seeds.txt')

    if (!existsSync(edgePath) || !existsSync(seedPath)) {
      throw new Error('Pipeline did not generate expected output files')
    }

    const edges = await parseJSONL(edgePath)
    const seeds = await parseJSONL(seedPath)

    return { edges, seeds }
  } finally {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}
