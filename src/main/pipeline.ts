import type { PipelineImages, PipelineParams, EditedGraph, ReconstructResult, CountResult } from './type'
import { app } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { dataURLToBuffer } from './utils'
import { is } from '@electron-toolkit/utils'
import {
  PythonWorker,
  StageOrchestrator,
  SEGMENT_LENGTH,
  type StageParams
} from 'annotation-grow-linker'

// ── PythonWorker lifecycle ──────────────────────────────────────────────────
// One worker per app process. Spawned lazily on first call, closed on quit.

let worker: PythonWorker | null = null

function ienfRepoRoot(): string {
  return is.dev
    ? join(process.cwd(), 'submodules/ienf_q')
    : join(process.resourcesPath, 'ienf_q')
}

export function getPythonWorker(): PythonWorker {
  if (worker) return worker
  worker = new PythonWorker({ cwd: ienfRepoRoot() })
  return worker
}

export async function closePythonWorker(): Promise<void> {
  if (!worker) return
  const w = worker
  worker = null
  await w.close()
}

function toStageParams(p: PipelineParams): StageParams {
  return {
    offset_px: p.offset_px,
    // UI exposes radius; cv2 wants the full kernel side length (always odd).
    bg_kernel_size: 2 * p.bg_kernel_radius + 1,
    clahe_clip: p.clahe_clip,
    clahe_grid: [p.clahe_grid_size, p.clahe_grid_size],
    sato_sigmas_start: p.sato_sigmas_start,
    sato_sigmas_stop: p.sato_sigmas_stop,
    // Fixed at 8-connected — not exposed to the UI.
    connectivity: 8,
    prune_threshold: p.prune_threshold,
    min_tree_components: p.min_tree_components,
    stub_length_threshold: p.stub_length_threshold
  }
}

// ── Extracted graph shape ───────────────────────────────────────────────────
interface ExtractedNode {
  y: number
  x: number
  attrs: Record<string, unknown>
}
interface ExtractedEdge {
  u: [number, number]
  v: [number, number]
  path: Array<[number, number]>
  attrs: Record<string, unknown>
}
interface ExtractedGraph {
  nodes: ExtractedNode[]
  edges: ExtractedEdge[]
}

interface LoadSampleResult {
  green: string
  mask: string
  annotation: string
  shape: number[]
}

// ── Session state ───────────────────────────────────────────────────────────
// One active session at a time. A session is created on the first stage call
// after images change; cached intermediate work survives across stage calls
// thanks to StageOrchestrator's memoisation.

interface Session {
  imageDir: string
  sample: { green: string; mask: string; annotation: string }
  orchestrator: StageOrchestrator
  /** Latest reconstructedGraph handle (for use by the count stage). */
  reconstructedHandle: string | null
  /** Cheap signature derived from image data URLs to detect new uploads. */
  imagesSig: string
}

let session: Session | null = null

function imagesSig(input: PipelineImages): string {
  // Cheap "same upload?" check. Full hash would be safer but expensive on
  // multi-MB data URLs and the false-positive collision is unlikely here.
  return [
    input.originalImage.length,
    input.maskImage.length,
    input.labelImage.length
  ].join('-')
}

async function disposeSession(): Promise<void> {
  if (!session) return
  const { imageDir } = session
  session = null
  if (existsSync(imageDir)) {
    await rm(imageDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function ensureSession(images: PipelineImages): Promise<Session> {
  const sig = imagesSig(images)
  if (session && session.imagesSig === sig) return session

  await disposeSession()

  const imageId = 'temp-' + Date.now()
  const imageDir = join(app.getPath('temp'), 'neurotrace-data', imageId)
  await mkdir(imageDir, { recursive: true })

  const imagePath = join(imageDir, 'image.png')
  const maskPath = join(imageDir, 'mask.png')
  const annotationPath = join(imageDir, 'annotation.png')

  await Promise.all([
    writeFile(imagePath, dataURLToBuffer(images.originalImage)),
    writeFile(maskPath, dataURLToBuffer(images.maskImage)),
    writeFile(annotationPath, dataURLToBuffer(images.labelImage))
  ])

  const w = getPythonWorker()
  await w.ready()

  const sample = await w.call<LoadSampleResult>('load_sample', {
    image_path: imagePath,
    mask_path: maskPath,
    annotation_path: annotationPath
  })

  const orchestrator = new StageOrchestrator(w, {
    green: sample.green,
    mask: sample.mask,
    annotation: sample.annotation
  })

  session = {
    imageDir,
    sample: { green: sample.green, mask: sample.mask, annotation: sample.annotation },
    orchestrator,
    reconstructedHandle: null,
    imagesSig: sig
  }
  return session
}

// ── Stage runners ───────────────────────────────────────────────────────────

export async function pipelineRoi(
  images: PipelineImages,
  params: PipelineParams
): Promise<{ roiMaskDataURL: string }> {
  const sess = await ensureSession(images)
  const handle = await sess.orchestrator.roiMask(toStageParams(params))
  const w = getPythonWorker()
  const roiMaskDataURL = await w.call<string>('render_handle_png', { handle })
  return { roiMaskDataURL }
}

export async function pipelinePreprocess(
  images: PipelineImages,
  params: PipelineParams
): Promise<{ preprocessDataURL: string }> {
  const sess = await ensureSession(images)
  const stageParams = toStageParams(params)
  // We want both the visual roi_image (Sato-enhanced fiber map) for display
  // and cost_map ready for downstream stages. costMap depends on roiImage so
  // the orchestrator dedupes.
  const roiImageHandle = await sess.orchestrator.roiImage(stageParams)
  await sess.orchestrator.costMap(stageParams)
  const w = getPythonWorker()
  const preprocessDataURL = await w.call<string>('render_handle_png', {
    handle: roiImageHandle
  })
  return { preprocessDataURL }
}

export async function pipelineReconstruct(
  images: PipelineImages,
  params: PipelineParams
): Promise<ReconstructResult> {
  const sess = await ensureSession(images)
  const handle = await sess.orchestrator.reconstructedGraph(toStageParams(params))
  sess.reconstructedHandle = handle

  const w = getPythonWorker()
  const graph = await w.call<ExtractedGraph>('extract_graph', { handle })

  return {
    seeds: graph.nodes.map((n) => [n.y, n.x]),
    // The reconstructed graph has no effective tagging yet — that comes from
    // the count stage. Default to false so the renderer paints the default
    // colour until counting runs.
    edges: graph.edges.map((e) => ({ path: e.path, isEffective: false }))
  }
}

export async function pipelineCount(
  images: PipelineImages,
  params: PipelineParams,
  editedGraph?: EditedGraph
): Promise<CountResult> {
  const sess = await ensureSession(images)
  const w = getPythonWorker()

  let graphHandle: string
  if (editedGraph) {
    graphHandle = await w.call<string>('import_graph', {
      nodes: editedGraph.nodes,
      edges: editedGraph.edges
    })
  } else {
    if (!sess.reconstructedHandle) {
      throw new Error('No reconstructed graph available. Run reconstruction first.')
    }
    graphHandle = sess.reconstructedHandle
  }

  const result = await sess.orchestrator.count(graphHandle, toStageParams(params))
  const labeled = await w.call<ExtractedGraph>('extract_graph', {
    handle: result.labeled_graph
  })

  return {
    validCount: result.pred_count,
    seeds: labeled.nodes.map((n) => [n.y, n.x]),
    edges: labeled.edges.map((e) => ({
      path: e.path,
      isEffective: e.attrs?.is_effective_segment === true
    }))
  }
}
