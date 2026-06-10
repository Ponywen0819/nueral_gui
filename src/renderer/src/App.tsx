import { useState, useEffect } from 'react'
import { EditorCanvas } from './components/EditorCanvas'
import { LayerControls } from './components/LayerControls'
import {
  GraphData,
  ImageLayers,
  LayerSettings,
  EditMode,
  PipelineParams,
  DEFAULT_PIPELINE_PARAMS
} from './types'
import { MousePointer2, Pencil, RotateCcw, Save, FolderOpen } from 'lucide-react'

const PARAMS_STORAGE_KEY = 'neurotrace:pipeline-params:v1'

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

  // --- Handlers ---
  const handleUpload = (type: keyof ImageLayers, dataURL: string) => {
    if (type === 'original') {
      // Store raw image and let useEffect handle color mapping
      setOriginalImageRaw(dataURL)
    } else {
      setLayers((prev) => ({ ...prev, [type]: dataURL }))
    }
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

  // Project the count/reconstruct payload into our renderer GraphData shape.
  const applyGraphPayload = (payload: {
    seeds: Array<[number, number]>
    edges: Array<{ path: Array<[number, number]>; isEffective: boolean }>
  }): void => {
    const newNodes: Record<string, { id: string; x: number; y: number }> = {}
    const newEdges: Array<{
      id: string
      sourceId: string
      targetId: string
      path?: Array<{ x: number; y: number }>
      isEffective?: boolean
    }> = []

    payload.seeds.forEach(([y, x]) => {
      const id = `node-${x}-${y}`
      if (!newNodes[id]) newNodes[id] = { id, x, y }
    })

    payload.edges.forEach((edgeData, index) => {
      const path = edgeData.path
        .map((point) => ({ x: point[1], y: point[0] }))
        .filter(Boolean) as Array<{ x: number; y: number }>
      if (path.length < 2) return

      const startPoint = path[0]
      const endPoint = path[path.length - 1]
      const sourceId = `node-${startPoint.x}-${startPoint.y}`
      const targetId = `node-${endPoint.x}-${endPoint.y}`
      if (!newNodes[sourceId])
        newNodes[sourceId] = { id: sourceId, x: startPoint.x, y: startPoint.y }
      if (!newNodes[targetId])
        newNodes[targetId] = { id: targetId, x: endPoint.x, y: endPoint.y }

      newEdges.push({
        id: `edge-${index}`,
        sourceId,
        targetId,
        path: path.length > 2 ? path : undefined,
        isEffective: edgeData.isEffective
      })
    })

    setGraph({ nodes: Object.values(newNodes), edges: newEdges })
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
  const runCount = async (
    editedGraph?: ReturnType<typeof serializeGraphForCount>
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
    applyGraphPayload(r.data)
    setValidNerveCount(r.data.validCount)
    setStage('count', 'done')
    return true
  }

  // Standalone Count button — uses whatever the user currently has on screen,
  // including any manual edits.
  const runCountFromCurrentGraph = async () => {
    const editedGraph =
      graph.nodes.length > 0 ? serializeGraphForCount(graph) : undefined
    await runCount(editedGraph)
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

  // Export the current graph as a binary mask PNG: white fiber strokes on a
  // black background, rasterized at the original image's native resolution.
  const handleExportMask = async () => {
    if (graph.edges.length === 0 || !imageDims) return
    const canvas = document.createElement('canvas')
    canvas.width = imageDims.width
    canvas.height = imageDims.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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

    const dataURL = canvas.toDataURL('image/png')
    const base64 = dataURL.split(',')[1]
    const r = await window.api.saveFile({
      defaultName: 'reconstruction_mask.png',
      data: base64,
      encoding: 'base64',
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (!r.success && !r.canceled) {
      setPipelineError(r.error || 'Failed to export mask')
    }
  }

  // Save the entire working session into a single project file: source images,
  // derived layers, layer settings, graph, params and stage status. Images are
  // embedded as data URLs so the file is self-contained.
  const handleSaveState = async () => {
    const state = {
      version: 1 as const,
      originalImageRaw,
      // `original` is re-derived from originalImageRaw + colorMap on load.
      layers: {
        mask: layers.mask,
        annotation: layers.annotation,
        roiMask: layers.roiMask,
        preprocess: layers.preprocess
      },
      layerSettings,
      mode,
      graph,
      pipelineParams,
      stageStatus,
      validNerveCount
    }
    const r = await window.api.saveFile({
      defaultName: 'neurotrace_project.ntproj',
      data: JSON.stringify(state),
      encoding: 'utf8',
      filters: [{ name: 'NeuroTrace Project', extensions: ['ntproj', 'json'] }]
    })
    if (!r.success && !r.canceled) {
      setPipelineError(r.error || 'Failed to save state')
    }
  }

  // Load a project file and restore the full session. layers.original is left
  // for the color-map effect to regenerate from originalImageRaw.
  const handleLoadState = async () => {
    const r = await window.api.openStateFile()
    if (!r.success || !r.data) {
      if (!r.canceled) setPipelineError(r.error || 'Failed to load state')
      return
    }
    try {
      const state = JSON.parse(r.data)
      setPipelineError(null)
      setGraph(state.graph ?? { nodes: [], edges: [] })
      setLayerSettings(state.layerSettings)
      setPipelineParams({ ...DEFAULT_PIPELINE_PARAMS, ...state.pipelineParams })
      setStageStatus(
        state.stageStatus ?? { roi: 'idle', preprocess: 'idle', reconstruct: 'idle', count: 'idle' }
      )
      setValidNerveCount(state.validNerveCount ?? null)
      setMode(state.mode ?? 'view')
      setLayers((prev) => ({
        ...prev,
        mask: state.layers?.mask ?? null,
        annotation: state.layers?.annotation ?? null,
        roiMask: state.layers?.roiMask ?? null,
        preprocess: state.layers?.preprocess ?? null
      }))
      // Set last so the color-map effect regenerates layers.original after the
      // restored originalColorMap setting is in place.
      setOriginalImageRaw(state.originalImageRaw ?? null)
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Invalid project file')
    }
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Controls */}
      <aside className="flex-shrink-0 z-10 shadow-xl">
        <LayerControls
          layers={layers}
          settings={layerSettings}
          onUpload={handleUpload}
          onSettingChange={setLayerSettings}
          hasGraph={graph.nodes.length > 0}
          onExportMask={handleExportMask}
          imagesReady={imagesReady}
          isPipelineRunning={isPipelineRunning}
          pipelineError={pipelineError}
          pipelineParams={pipelineParams}
          onPipelineParamsChange={setPipelineParams}
          stageStatus={stageStatus}
          onRunRoi={runRoi}
          onRunPreprocess={runPreprocess}
          onRunReconstruct={runReconstructAndCount}
          onRunCount={runCountFromCurrentGraph}
          onRunAll={runAll}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Top Toolbar */}
        <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 justify-between shadow-sm z-20">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              NeuroTrace
            </h1>
            <div className="h-6 w-px bg-slate-700 mx-2"></div>

            <div className="flex bg-slate-800 rounded p-1 gap-1">
              <button
                onClick={() => setMode('view')}
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
                onClick={() => setMode('edit')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === 'edit'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Pencil size={16} />
                Edit Graph
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 mr-2">
              Nodes: {graph.nodes.length} | Edges: {graph.edges.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSaveState}
                className="flex items-center gap-1.5 text-xs text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 px-2.5 py-1.5 rounded transition-colors"
                title="Save the entire session to a project file"
              >
                <Save size={14} />
                Save
              </button>
              <button
                onClick={handleLoadState}
                className="flex items-center gap-1.5 text-xs text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 px-2.5 py-1.5 rounded transition-colors"
                title="Load a project file"
              >
                <FolderOpen size={14} />
                Load
              </button>
            </div>
            <div className="h-6 w-px bg-slate-700"></div>
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
          {mode === 'edit' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm pointer-events-none z-30 animate-pulse">
              Edit mode — click to add nodes
            </div>
          )}

          {validNerveCount !== null && (
            <div className="absolute top-4 left-4 z-30 bg-slate-900/80 border border-slate-700 rounded-lg px-4 py-2 shadow-lg backdrop-blur-sm pointer-events-none">
              <div className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">
                Effective Crossings
              </div>
              <div className="text-2xl font-bold text-emerald-400 leading-tight">
                {validNerveCount}
              </div>
            </div>
          )}

          <EditorCanvas
            layers={layers}
            settings={layerSettings}
            mode={mode}
            graph={graph}
            setGraph={setGraph}
          />
        </div>
      </main>
    </div>
  )
}
