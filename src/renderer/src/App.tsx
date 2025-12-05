import { useState, useEffect } from 'react'
import { EditorCanvas } from './components/EditorCanvas'
import { LayerControls } from './components/LayerControls'
import { GraphData, ImageLayers, LayerSettings, EditMode, PipelineConfig } from './types'
import { MousePointer2, Pencil, RotateCcw } from 'lucide-react'

export default function App() {
  // --- State ---
  const [layers, setLayers] = useState<ImageLayers>({
    original: null,
    mask: null,
    annotation: null
  })

  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    showOriginal: true,
    originalOpacity: 1.0,
    originalColorMap: 'green',
    showMask: true,
    maskOpacity: 0.5,
    showAnnotation: true,
    annotationOpacity: 0.5
  })

  // Store original uploaded image separately for color map transformations
  const [originalImageRaw, setOriginalImageRaw] = useState<string | null>(null)

  const [mode, setMode] = useState<EditMode>('view')

  // Graph Data
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })

  // Pipeline state
  const [isPipelineRunning, setIsPipelineRunning] = useState(false)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | null>(null)

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
    if (confirm('Are you sure you want to clear all nodes and edges?')) {
      setGraph({ nodes: [], edges: [] })
    }
  }

  const handleRunPipeline = async () => {
    // Validate that all required images are uploaded
    if (!originalImageRaw || !layers.mask || !layers.annotation) {
      setPipelineError(
        'Please upload all three images (Original, Mask, Annotation) before running the pipeline.'
      )
      return
    }

    setIsPipelineRunning(true)
    setPipelineError(null)

    try {
      const result = await window.api.runPipeline({
        originalImage: originalImageRaw,
        maskImage: layers.mask,
        labelImage: layers.annotation
      })

      if (result.success && result.data) {
        console.log('Pipeline completed successfully:', result.data)

        // Transform pipeline results into graph format
        const newNodes: Record<string, { id: string; x: number; y: number }> = {}
        const newEdges: Array<{
          id: string
          sourceId: string
          targetId: string
          path?: Array<{ x: number; y: number }>
        }> = []

        // Process seeds to create nodes
        result.data.seeds.forEach((seed: any) => {
          if (Array.isArray(seed) && seed.length >= 2) {
            const [y, x] = seed
            const nodeId = `node-${x}-${y}`
            if (!newNodes[nodeId]) {
              newNodes[nodeId] = { id: nodeId, x, y }
            }
          }
        })

        // Process edges with paths
        result.data.edges.forEach((edgeData: any, index: number) => {
          if (Array.isArray(edgeData) && edgeData.length >= 2) {
            const path = edgeData
              .map((point: any) => {
                if (Array.isArray(point) && point.length >= 2) {
                  return { x: point[1], y: point[0] }
                }
                return null
              })
              .filter(Boolean) as Array<{ x: number; y: number }>

            if (path.length >= 2) {
              // First and last points of the path become nodes
              const startPoint = path[0]
              const endPoint = path[path.length - 1]

              const sourceId = `node-${startPoint.x}-${startPoint.y}`
              const targetId = `node-${endPoint.x}-${endPoint.y}`

              // Ensure nodes exist
              if (!newNodes[sourceId]) {
                newNodes[sourceId] = { id: sourceId, x: startPoint.x, y: startPoint.y }
              }
              if (!newNodes[targetId]) {
                newNodes[targetId] = { id: targetId, x: endPoint.x, y: endPoint.y }
              }

              // Create edge with full path
              newEdges.push({
                id: `edge-${index}`,
                sourceId,
                targetId,
                path: path.length > 2 ? path : undefined // Only include path if curved
              })
            }
          }
        })

        // Update graph state
        setGraph({
          nodes: Object.values(newNodes),
          edges: newEdges
        })

        console.log(
          `Pipeline completed! Nodes: ${Object.keys(newNodes).length}, Edges: ${newEdges.length}`
        )
      } else {
        setPipelineError(result.error || 'Pipeline execution failed')
      }
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : 'Unknown error occurred')
    } finally {
      setIsPipelineRunning(false)
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
          onRunPipeline={handleRunPipeline}
          isPipelineRunning={isPipelineRunning}
          pipelineError={pipelineError}
          onPipelineConfigChange={setPipelineConfig}
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
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <MousePointer2 size={16} />
                View & Pan
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === 'edit'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Pencil size={16} />
                Edit Graph
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 mr-2">
              Nodes: {graph.nodes.length} | Edges: {graph.edges.length}
            </div>
            <button
              onClick={handleClearGraph}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/30 p-2 rounded transition"
              title="Clear All"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </header>

        {/* Canvas Area */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden">
          {mode === 'edit' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm pointer-events-none z-30 animate-pulse">
              Editing Mode Active - Click to Add Nodes
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
