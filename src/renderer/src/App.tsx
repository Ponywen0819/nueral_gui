import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { EditorCanvas } from './components/EditorCanvas'
import { LayerControls } from './components/LayerControls'
import {
  GraphData,
  Node,
  Edge,
  ImageLayers,
  LayerSettings,
  EditMode,
  PipelineParams,
  DEFAULT_PIPELINE_PARAMS,
  SampleFiles
} from './types'
import { MousePointer2, Pencil, RotateCcw, Paintbrush, Brush, Loader2, Save } from 'lucide-react'

const PARAMS_STORAGE_KEY = 'neurotrace:pipeline-params:v1'
const WORKDIR_STORAGE_KEY = 'neurotrace:workdir:v1'
const AUTOSAVE_STORAGE_KEY = 'neurotrace:autosave:v1'
// Per-sample project file + companion fiber mask, auto-saved into each
// sample's own folder.
const PROJECT_FILE = 'fibertrace_project.json'
const PROJECT_MASK_FILE = 'fibertrace_mask.png'

function loadStoredParams(): PipelineParams {
  try {
    const raw = window.localStorage.getItem(PARAMS_STORAGE_KEY)
    if (!raw) return DEFAULT_PIPELINE_PARAMS
    const parsed = JSON.parse(raw)
    // Fill missing keys from defaults so newer fields don't crash old saves.
    return { ...DEFAULT_PIPELINE_PARAMS, ...parsed }
  } catch {
    return DEFAULT_PIPELINE_PARAMS
  }
}

type CountPayload = {
  seeds: Array<[number, number]>
  edges: Array<{ path: Array<[number, number]>; isEffective: boolean }>
}

// Project a pipeline count/reconstruct payload into GraphData, REUSING ids from
// `prev` for any node/edge at the same pixel position. This keeps the canvas's
// current selection and active chain valid across a re-count instead of
// regenerating every id. Positions are matched with trunc to mirror Python's
// int() rounding in electron_worker.import_graph.
// ponytail: two sub-pixel-close nodes truncating to the same pixel collide
// (last wins) and parallel edges reuse one id each — fine for this graph shape.
function projectGraphPayload(prev: GraphData, payload: CountPayload): GraphData {
  const posKey = (x: number, y: number): string => `${Math.trunc(x)},${Math.trunc(y)}`
  const prevIdByPos = new Map(prev.nodes.map((n) => [posKey(n.x, n.y), n.id]))
  const prevEdgeIdByPair = new Map(
    prev.edges.map((e) => [[e.sourceId, e.targetId].sort().join('|'), e.id] as const)
  )

  const nodes: Record<string, Node> = {}
  const idAt = new Map<string, string>() // position key -> id used in this build
  const nodeIdFor = (x: number, y: number): string => {
    const key = posKey(x, y)
    const seen = idAt.get(key)
    if (seen) return seen
    const id = prevIdByPos.get(key) ?? `node-${x}-${y}`
    idAt.set(key, id)
    nodes[id] = { id, x, y }
    return id
  }

  payload.seeds.forEach(([y, x]) => nodeIdFor(x, y))

  const edges: Edge[] = []
  payload.edges.forEach((edgeData, index) => {
    const path = edgeData.path.map((p) => ({ x: p[1], y: p[0] }))
    if (path.length < 2) return
    const sourceId = nodeIdFor(path[0].x, path[0].y)
    const targetId = nodeIdFor(path[path.length - 1].x, path[path.length - 1].y)
    const pairKey = [sourceId, targetId].sort().join('|')
    const reused = prevEdgeIdByPair.get(pairKey)
    if (reused) prevEdgeIdByPair.delete(pairKey) // each prior edge id reused at most once
    edges.push({
      id: reused ?? `edge-${index}`,
      sourceId,
      targetId,
      path: path.length > 2 ? path : undefined,
      isEffective: edgeData.isEffective
    })
  })

  return { nodes: Object.values(nodes), edges }
}

export default function App() {
  // --- State ---
  const [layers, setLayers] = useState<ImageLayers>({
    original: null,
    mask: null,
    annotation: null,
    roiMask: null,
    preprocess: null
  })

  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    showOriginal: true,
    originalOpacity: 1.0,
    originalColorMap: 'green',
    showMask: true,
    maskOpacity: 0.5,
    maskColor: '#ffffff',
    showAnnotation: true,
    annotationOpacity: 0.5,
    annotationColor: '#ffff00',
    showRoi: true,
    roiOpacity: 0.35,
    roiColor: '#22d3ee',
    showPreprocess: true,
    preprocessOpacity: 0.6,
    preprocessColor: '#f472b6',
    showGraph: true
  })

  // Store original uploaded image separately for color map transformations
  const [originalImageRaw, setOriginalImageRaw] = useState<string | null>(null)

  // Working folder + the samples it contains. The active sample drives which
  // three images are loaded. workDir is remembered across launches.
  const [workDir, setWorkDir] = useState<string | null>(
    () => window.localStorage.getItem(WORKDIR_STORAGE_KEY)
  )
  const [samples, setSamples] = useState<SampleFiles[]>([])
  const [activeSample, setActiveSample] = useState<string | null>(null)
  // Suppresses auto-save while a sample is being loaded (so loading a sample
  // doesn't overwrite its own file with transient/empty state).
  const savingBlocked = useRef(false)
  // Master switch: when off, nothing is written to disk automatically
  // (mask overwrites and the per-sample project file). Remembered across launches.
  const [autoSave, setAutoSave] = useState<boolean>(
    () => window.localStorage.getItem(AUTOSAVE_STORAGE_KEY) !== 'off'
  )
  const toggleAutoSave = (): void => {
    setAutoSave((v) => {
      const next = !v
      window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, next ? 'on' : 'off')
      return next
    })
  }

  const [mode, setMode] = useState<EditMode>('view')

  // Graph Data
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })

  // Pipeline state — split into 4 stages.
  type StageKey = 'roi' | 'preprocess' | 'reconstruct' | 'count'
  type StageStatus = 'idle' | 'running' | 'done' | 'error'
  const [stageStatus, setStageStatus] = useState<Record<StageKey, StageStatus>>({
    roi: 'idle',
    preprocess: 'idle',
    reconstruct: 'idle',
    count: 'idle'
  })
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [pipelineParams, setPipelineParams] = useState<PipelineParams>(() => loadStoredParams())
  // Number of valid nerve crossings from the most recent count.
  const [validNerveCount, setValidNerveCount] = useState<number | null>(null)
  // Native pixel dimensions of the loaded original image — used to rasterize
  // the exported mask at full resolution.
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null)
  const isPipelineRunning = Object.values(stageStatus).some((s) => s === 'running')

  const setStage = (k: StageKey, s: StageStatus) =>
    setStageStatus((prev) => ({ ...prev, [k]: s }))

  // Persist params changes to localStorage so they survive app reload.
  useEffect(() => {
    try {
      window.localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(pipelineParams))
    } catch {
      // Quota / disabled storage — ignore; state still works in-memory.
    }
  }, [pipelineParams])

  // Apply color map when originalColorMap or originalImageRaw changes
  useEffect(() => {
    if (!originalImageRaw) return

    const applyColorMapping = async () => {
      try {
        const result = await window.api.applyColorMap(
          originalImageRaw,
          layerSettings.originalColorMap
        )

        if (result.success && result.data) {
          setLayers((prev) => ({ ...prev, original: result.data! }))
        } else {
          console.error('Failed to apply color map:', result.error)
        }
      } catch (error) {
        console.error('Error applying color map:', error)
      }
    }

    applyColorMapping()
  }, [originalImageRaw, layerSettings.originalColorMap])

  // Probe the original image for its native dimensions whenever it changes.
  useEffect(() => {
    if (!originalImageRaw) {
      setImageDims(null)
      return
    }
    const probe = new Image()
    let cancelled = false
    probe.onload = () => {
      if (!cancelled) setImageDims({ width: probe.naturalWidth, height: probe.naturalHeight })
    }
    probe.src = originalImageRaw
    return () => {
      cancelled = true
    }
  }, [originalImageRaw])

  // List samples whenever the working folder changes (including on startup
  // from the remembered folder).
  useEffect(() => {
    if (!workDir) {
      setSamples([])
      return
    }
    let cancelled = false
    window.api.listSamples(workDir).then((r) => {
      if (cancelled) return
      if (r.success && r.samples) setSamples(r.samples)
      else {
        setSamples([])
        setPipelineError(r.error || 'Failed to read working folder')
      }
    })
    return () => {
      cancelled = true
    }
  }, [workDir])

  // Snapshot of the editable per-sample state. Source images are excluded
  // (they live in the sample folder); derived masks are included so the visual
  // result is restored without re-running the pipeline.
  const buildSampleState = () => ({
    version: 2 as const,
    layerSettings,
    mode,
    graph,
    pipelineParams,
    stageStatus,
    validNerveCount,
    derived: { roiMask: layers.roiMask, preprocess: layers.preprocess }
  })

  // Auto-save the active sample's state into its folder whenever it changes
  // (debounced so slider drags don't hammer the disk).
  useEffect(() => {
    if (!workDir || !activeSample || savingBlocked.current || !autoSave) return
    const data = JSON.stringify(buildSampleState())
    const t = setTimeout(() => {
      window.api.writeSampleFile({ dir: workDir, name: activeSample, file: PROJECT_FILE, data })
      const maskURL = buildGraphMaskDataURL()
      if (maskURL) {
        window.api.saveMask({
          filePath: `${workDir}/${activeSample}/${PROJECT_MASK_FILE}`,
          dataURL: maskURL
        })
      }
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workDir,
    activeSample,
    autoSave,
    layerSettings,
    mode,
    graph,
    pipelineParams,
    stageStatus,
    validNerveCount,
    layers.roiMask,
    layers.preprocess
  ])

  // --- Handlers ---
  const handleSelectWorkDir = async () => {
    const r = await window.api.selectWorkDir()
    if (!r.success || !r.dir) return
    setWorkDir(r.dir)
    window.localStorage.setItem(WORKDIR_STORAGE_KEY, r.dir)
    setActiveSample(null)
  }

  // Load a sample's three images, restoring its saved project if one exists.
  const handleSelectSample = async (sample: SampleFiles) => {
    if (sample.name === activeSample) return
    // Flush any pending edits for the outgoing sample before switching away.
    if (workDir && activeSample && autoSave) {
      window.api.writeSampleFile({
        dir: workDir,
        name: activeSample,
        file: PROJECT_FILE,
        data: JSON.stringify(buildSampleState())
      })
    }

    savingBlocked.current = true
    setActiveSample(sample.name)
    setPipelineError(null)

    // Load a previously auto-saved project for this sample, if any.
    let saved: Partial<ReturnType<typeof buildSampleState>> | null = null
    if (workDir) {
      const r = await window.api.readSampleFile({
        dir: workDir,
        name: sample.name,
        file: PROJECT_FILE
      })
      if (r.success && r.data) {
        try {
          saved = JSON.parse(r.data)
        } catch {
          saved = null
        }
      }
    }

    const load = async (p: string | null): Promise<string | null> => {
      if (!p) return null
      const r = await window.api.loadImage(p)
      return r.success ? r.data ?? null : null
    }
    const [img, epi, par] = await Promise.all([
      load(sample.image),
      load(sample.epidermis),
      load(sample.particle)
    ])

    if (saved) {
      setLayerSettings(saved.layerSettings ?? layerSettings)
      setMode(saved.mode ?? 'view')
      setGraph(saved.graph ?? { nodes: [], edges: [] })
      setPipelineParams({ ...DEFAULT_PIPELINE_PARAMS, ...saved.pipelineParams })
      setStageStatus(
        saved.stageStatus ?? { roi: 'idle', preprocess: 'idle', reconstruct: 'idle', count: 'idle' }
      )
      setValidNerveCount(saved.validNerveCount ?? null)
      setLayers({
        original: null,
        mask: epi,
        annotation: par,
        roiMask: saved.derived?.roiMask ?? null,
        preprocess: saved.derived?.preprocess ?? null
      })
    } else {
      setGraph({ nodes: [], edges: [] })
      setValidNerveCount(null)
      setStageStatus({ roi: 'idle', preprocess: 'idle', reconstruct: 'idle', count: 'idle' })
      setLayers({ original: null, mask: epi, annotation: par, roiMask: null, preprocess: null })
    }
    // Set last so the color-map effect regenerates layers.original using the
    // (possibly restored) originalColorMap setting.
    setOriginalImageRaw(img)
    savingBlocked.current = false
  }

  const handleClearGraph = () => {
    if (confirm('Clear all nodes and edges?')) {
      setGraph({ nodes: [], edges: [] })
    }
  }

  const imagesReady = !!(originalImageRaw && layers.mask && layers.annotation)

  // Build the args common to every stage call.
  const buildStageArgs = (): {
    images: { originalImage: string; maskImage: string; labelImage: string }
    params: PipelineParams
  } | null => {
    if (!originalImageRaw || !layers.mask || !layers.annotation) return null
    return {
      images: {
        originalImage: originalImageRaw,
        maskImage: layers.mask,
        labelImage: layers.annotation
      },
      params: pipelineParams
    }
  }

  // Project the count/reconstruct payload into our renderer GraphData shape,
  // reusing ids from the current graph so selection / active chain survive.
  const applyGraphPayload = (payload: CountPayload): void => {
    setGraph((prev) => projectGraphPayload(prev, payload))
  }

  // Serialize the renderer GraphData back to the EditedGraph wire format
  // expected by `pipeline:count`. Used when the user has tweaked the graph
  // between Reconstruct and Count.
  const serializeGraphForCount = (g: GraphData): {
    nodes: Array<{ y: number; x: number }>
    edges: Array<{ u: [number, number]; v: [number, number]; path?: Array<[number, number]> }>
  } => {
    const nodes = g.nodes.map((n) => ({ y: n.y, x: n.x }))
    const nodeIndex = new Map(g.nodes.map((n) => [n.id, n]))
    const edges = g.edges
      .map((e) => {
        const u = nodeIndex.get(e.sourceId)
        const v = nodeIndex.get(e.targetId)
        if (!u || !v) return null
        const path = e.path
          ? (e.path.map((p) => [p.y, p.x] as [number, number]))
          : ([[u.y, u.x], [v.y, v.x]] as Array<[number, number]>)
        return {
          u: [u.y, u.x] as [number, number],
          v: [v.y, v.x] as [number, number],
          path
        }
      })
      .filter(Boolean) as Array<{
        u: [number, number]
        v: [number, number]
        path: Array<[number, number]>
      }>
    return { nodes, edges }
  }

  const runRoi = async (): Promise<boolean> => {
    const args = buildStageArgs()
    if (!args) {
      setPipelineError('Please upload all three images first')
      return false
    }
    setPipelineError(null)
    setStage('roi', 'running')
    const r = await window.api.pipelineRoi(args)
    if (!r.success || !r.data) {
      setPipelineError(r.error || 'Region of interest computation failed')
      setStage('roi', 'error')
      return false
    }
    setLayers((prev) => ({ ...prev, roiMask: r.data!.roiMaskDataURL }))
    setStage('roi', 'done')
    return true
  }

  const runPreprocess = async (): Promise<boolean> => {
    const args = buildStageArgs()
    if (!args) return false
    setPipelineError(null)
    setStage('preprocess', 'running')
    const r = await window.api.pipelinePreprocess(args)
    if (!r.success || !r.data) {
      setPipelineError(r.error || 'Preprocessing failed')
      setStage('preprocess', 'error')
      return false
    }
    setLayers((prev) => ({ ...prev, preprocess: r.data!.preprocessDataURL }))
    setStage('preprocess', 'done')
    return true
  }

  const runReconstruct = async (): Promise<boolean> => {
    const args = buildStageArgs()
    if (!args) return false
    setPipelineError(null)
    setStage('reconstruct', 'running')
    setValidNerveCount(null)
    const r = await window.api.pipelineReconstruct(args)
    if (!r.success || !r.data) {
      setPipelineError(r.error || 'Reconstruction failed')
      setStage('reconstruct', 'error')
      return false
    }
    applyGraphPayload(r.data)
    setStage('reconstruct', 'done')
    return true
  }

  // `editedGraph` undefined → main uses the session's freshly reconstructed
  // graph handle. Pass a serialized graph only when counting against the
  // user's current edits (the standalone Count button does this).
  // `canApply` lets the auto-count loop drop a stale result: if the graph was
  // edited while this count was in flight, applying it would clobber the newer
  // edit, so we skip and let the trailing run produce a fresh result.
  const runCount = async (
    editedGraph?: ReturnType<typeof serializeGraphForCount>,
    canApply?: () => boolean
  ): Promise<boolean> => {
    const args = buildStageArgs()
    if (!args) return false
    setPipelineError(null)
    setStage('count', 'running')
    const r = await window.api.pipelineCount({ ...args, editedGraph })
    if (!r.success || !r.data) {
      setPipelineError(r.error || 'Counting failed')
      setStage('count', 'error')
      return false
    }
    if (!canApply || canApply()) {
      applyGraphPayload(r.data)
      setValidNerveCount(r.data.validCount)
    }
    setStage('count', 'done')
    return true
  }

  // ── Auto-count ──────────────────────────────────────────────────────────
  // Recount automatically whenever the user edits the graph. Coalesced
  // single-flight keyed on an edit version: edits bump `graphVersion`; the
  // drain loop keeps counting until it has processed the latest version, so a
  // burst of edits during an in-flight count collapses to one trailing run
  // that uses the newest graph.
  const graphRef = useRef(graph)
  graphRef.current = graph
  const graphVersion = useRef(0)
  const countedVersion = useRef(0)
  const countBusy = useRef(false)
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const drainCount = async (): Promise<void> => {
    if (countBusy.current) return // a drain is running; its loop will see the new version
    countBusy.current = true
    try {
      while (countedVersion.current !== graphVersion.current) {
        const v = graphVersion.current
        countedVersion.current = v
        const g = graphRef.current
        if (g.nodes.length === 0) {
          setValidNerveCount(null) // nothing to count
          continue
        }
        await runCount(serializeGraphForCount(g), () => graphVersion.current === v)
      }
    } finally {
      countBusy.current = false
    }
  }

  // ponytail: 250ms debounce so drawing a chain fires one count, not one per node.
  const scheduleCount = (): void => {
    if (countTimer.current) clearTimeout(countTimer.current)
    countTimer.current = setTimeout(() => void drainCount(), 250)
  }

  // Passed to the canvas so user edits trigger auto-count. Programmatic graph
  // updates (reconstruct/count results) call setGraph directly and so never loop.
  const handleGraphEdit: Dispatch<SetStateAction<GraphData>> = (update) => {
    setGraph(update)
    graphVersion.current += 1
    scheduleCount()
  }

  // Layer visibility snapshot to restore when leaving a mask-edit mode.
  const prevVisibilityRef = useRef<Partial<LayerSettings> | null>(null)
  const isPaintMode = (m: EditMode): boolean => m === 'particle' || m === 'epidermis'

  // Switch modes. Entering a mask-edit mode isolates Original + the edited layer
  // (particle → Particle Mask, epidermis → Epidermis Mask), snapshotting the
  // rest; leaving for a non-paint mode restores what was visible before.
  const changeMode = (next: EditMode): void => {
    if (next === mode) return
    if (isPaintMode(next)) {
      // Snapshot only when coming from a non-paint mode, so particle↔epidermis
      // switches don't overwrite the snapshot with isolated values.
      if (!isPaintMode(mode)) {
        prevVisibilityRef.current = {
          showOriginal: layerSettings.showOriginal,
          showAnnotation: layerSettings.showAnnotation,
          showMask: layerSettings.showMask,
          showRoi: layerSettings.showRoi,
          showPreprocess: layerSettings.showPreprocess,
          showGraph: layerSettings.showGraph
        }
      }
      const editsMask = next === 'epidermis'
      setLayerSettings((s) => ({
        ...s,
        showOriginal: true,
        showMask: editsMask,
        showAnnotation: !editsMask,
        showRoi: false,
        showPreprocess: false,
        showGraph: false
      }))
    } else if (isPaintMode(mode) && prevVisibilityRef.current) {
      const restore = prevVisibilityRef.current
      prevVisibilityRef.current = null
      setLayerSettings((s) => ({ ...s, ...restore }))
    }
    setMode(next)
  }

  // Mask painting: update the on-screen layer, and debounce-overwrite the
  // sample's source file so edits persist. The target follows the active mode
  // (particle → annotation/particle file, epidermis → mask/epidermis file).
  // Runs only on actual paints (never on sample load, which doesn't call this).
  const maskSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handlePaintMask = (url: string): void => {
    const editsEpidermis = mode === 'epidermis'
    setLayers((p) => (editsEpidermis ? { ...p, mask: url } : { ...p, annotation: url }))
    if (!autoSave) return // on-screen paint kept; disk overwrite suppressed
    const sample = samples.find((s) => s.name === activeSample)
    const filePath = editsEpidermis ? sample?.epidermis : sample?.particle
    if (!filePath) return // no source file to overwrite
    if (maskSaveTimer.current) clearTimeout(maskSaveTimer.current)
    maskSaveTimer.current = setTimeout(() => {
      window.api.saveMask({ filePath, dataURL: url })
    }, 800)
  }

  // Chained: reconstruct overwrites the graph; the auto-triggered count runs
  // against that fresh reconstruction (main uses its cached handle) — never
  // against stale React state.
  const runReconstructAndCount = async () => {
    if (await runReconstruct()) await runCount()
  }

  const runAll = async () => {
    if ((await runRoi()) && (await runPreprocess()) && (await runReconstruct())) {
      await runCount()
    }
  }

  // Rasterize the current graph into a binary mask PNG (white fiber strokes on
  // black) at the original image's native resolution. Returns a data URL, or
  // null when there's no image to size against.
  const buildGraphMaskDataURL = (): string | null => {
    if (!imageDims) return null
    const canvas = document.createElement('canvas')
    canvas.width = imageDims.width
    canvas.height = imageDims.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
    graph.edges.forEach((edge) => {
      const pts =
        edge.path && edge.path.length > 1
          ? edge.path
          : (() => {
              const a = nodeById.get(edge.sourceId)
              const b = nodeById.get(edge.targetId)
              return a && b ? [a, b] : null
            })()
      if (!pts) return
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    })

    return canvas.toDataURL('image/png')
  }

  // Open a native folder picker; returns the chosen path (or null if canceled).
  const chooseFolder = async (): Promise<string | null> => {
    const r = await window.api.selectWorkDir()
    return r.success && r.dir ? r.dir : null
  }

  // Manual save (name + folder from the modal). epidermis/particle write the
  // on-screen mask as <name>.png; fiber writes <name>_project.json plus the
  // rasterized reconstruction mask as <name>_mask.png. dir null → sample folder.
  const handleManualSave = async (
    kind: 'epidermis' | 'particle' | 'fiber',
    name: string,
    dir: string | null
  ): Promise<void> => {
    // ponytail: forward-slash join; Node fs accepts mixed separators on Windows too.
    const targetDir = dir ?? (workDir && activeSample ? `${workDir}/${activeSample}` : null)
    if (!targetDir) return
    if (kind === 'fiber') {
      // ponytail: empty name segment → writeSampleFile writes straight into targetDir.
      await window.api.writeSampleFile({
        dir: targetDir,
        name: '',
        file: `${name}_project.json`,
        data: JSON.stringify(buildSampleState())
      })
      const maskURL = buildGraphMaskDataURL()
      if (maskURL) {
        await window.api.saveMask({ filePath: `${targetDir}/${name}_mask.png`, dataURL: maskURL })
      }
      return
    }
    const url = kind === 'epidermis' ? layers.mask : layers.annotation
    if (!url) return
    await window.api.saveMask({ filePath: `${targetDir}/${name}.png`, dataURL: url })
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Controls */}
      <aside className="flex-shrink-0 z-10 shadow-xl">
        <LayerControls
          layers={layers}
          settings={layerSettings}
          onSettingChange={setLayerSettings}
          workDir={workDir}
          samples={samples}
          activeSample={activeSample}
          onSelectWorkDir={handleSelectWorkDir}
          onSelectSample={handleSelectSample}
          autoSave={autoSave}
          onToggleAutoSave={toggleAutoSave}
          onSaveManual={handleManualSave}
          onChooseFolder={chooseFolder}
          imagesReady={imagesReady}
          isPipelineRunning={isPipelineRunning}
          pipelineError={pipelineError}
          pipelineParams={pipelineParams}
          onPipelineParamsChange={setPipelineParams}
          stageStatus={stageStatus}
          onRunRoi={runRoi}
          onRunPreprocess={runPreprocess}
          onRunReconstruct={runReconstructAndCount}
          onRunAll={runAll}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Top Toolbar */}
        <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 justify-between shadow-sm z-20">
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-800 rounded p-1 gap-1">
              <button
                onClick={() => changeMode('view')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === 'view'
                    ? 'bg-slate-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <MousePointer2 size={16} />
                View / Pan
              </button>
              <button
                onClick={() => changeMode('edit')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === 'edit'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Pencil size={16} />
                Fiber Edit
              </button>
              <button
                onClick={() => changeMode('particle')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === 'particle'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Paintbrush size={16} />
                Particle Edit
              </button>
              <button
                onClick={() => changeMode('epidermis')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === 'epidermis'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Brush size={16} />
                Epidermis Edit
              </button>
            </div>

            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Effective Crossings
              </span>
              <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                {validNerveCount ?? '-'}
                {stageStatus.count === 'running' && (
                  <Loader2 size={14} className="animate-spin text-emerald-400/80" />
                )}
              </span>
            </div>

            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Image Size
              </span>
              <span className="text-sm font-mono text-slate-300">
                {imageDims ? `${imageDims.width} × ${imageDims.height} px` : '-'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 text-sm font-medium ${
                autoSave ? 'text-emerald-400' : 'text-slate-500'
              }`}
              title="Auto-save can be toggled in the Files tab"
            >
              <Save size={15} />
              {autoSave ? 'Auto-save On' : 'Auto-save Off'}
            </div>
            <div className="text-sm font-medium text-slate-300">
              Nodes: {graph.nodes.length} | Edges: {graph.edges.length}
            </div>
            <button
              onClick={handleClearGraph}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/30 p-2 rounded transition"
              title="Clear all"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </header>

        {/* Canvas Area */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden">
          {mode === 'edit' &&
            (layerSettings.showGraph ? (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm pointer-events-none z-30 animate-pulse">
                Fiber edit — click to add nodes
              </div>
            ) : (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-600/90 text-white text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm pointer-events-none z-30">
                Show the Reconstruction Result layer to edit
              </div>
            ))}

          {mode === 'particle' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600/90 text-white text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm pointer-events-none z-30">
              Particle edit — left-click to paint · right-click for brush / erase / size
            </div>
          )}

          {mode === 'epidermis' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-cyan-600/90 text-white text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm pointer-events-none z-30">
              Epidermis edit — left-click to paint · right-click for brush / erase / size
            </div>
          )}

          <EditorCanvas
            layers={layers}
            settings={layerSettings}
            mode={mode}
            graph={graph}
            setGraph={handleGraphEdit}
            onPaintMask={handlePaintMask}
          />
        </div>
      </main>
    </div>
  )
}
