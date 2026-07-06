import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  Edge,
  GraphData,
  ImageLayers,
  LayerSettings,
  Node,
  Point,
  ViewTransform,
  EditMode
} from '../types'
import { v4 as uuidv4 } from 'uuid'

interface EditorCanvasProps {
  layers: ImageLayers
  settings: LayerSettings
  mode: EditMode
  graph: GraphData
  setGraph: React.Dispatch<React.SetStateAction<GraphData>>
  // Called with a new mask data URL as the user paints in a mask-edit mode
  // (particle → annotation layer, epidermis → mask layer).
  onPaintMask?: (dataURL: string) => void
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  layers,
  settings,
  mode,
  graph,
  setGraph,
  onPaintMask
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Editing is only allowed when in edit mode AND the Reconstruction Result
  // layer is visible — you can't edit a graph you can't see.
  const canEdit = mode === 'edit' && settings.showGraph
  // Mask painting: particle edits the annotation layer, epidermis the mask layer.
  // Both share the exact same brush/erase interaction, differing only in which
  // image layer they read/write.
  const isPaint = mode === 'particle' || mode === 'epidermis'
  const paintSrc = mode === 'epidermis' ? layers.mask : layers.annotation

  // View State
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null)

  // Particle-mask painting state
  const [paintTool, setPaintTool] = useState<'brush' | 'erase'>('brush')
  const [brushSize, setBrushSize] = useState(5) // diameter in image pixels
  const [particleMenu, setParticleMenu] = useState<{ x: number; y: number } | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null) // offscreen source of truth
  const maskTargetRef = useRef<EditMode | null>(null) // which mode's layer the offscreen canvas holds
  const originalDimsRef = useRef<{ w: number; h: number } | null>(null)
  const isPaintingRef = useRef(false)
  const lastPaintRef = useRef<Point | null>(null)
  const exportScheduledRef = useRef(false)

  // Auto fit-to-view whenever the primary (original) image changes.
  // Decodes the data URL off-DOM to read its natural size, then centers it
  // inside the container with a small margin.
  useEffect(() => {
    const src = layers.original
    if (!src) return
    if (!containerRef.current) return
    const probe = new Image()
    let cancelled = false
    probe.onload = () => {
      if (cancelled || !containerRef.current) return
      originalDimsRef.current = { w: probe.naturalWidth, h: probe.naturalHeight }
      const { width: cw, height: ch } = containerRef.current.getBoundingClientRect()
      if (cw === 0 || ch === 0) return
      const padding = 24
      const scale = Math.min(
        (cw - padding * 2) / probe.naturalWidth,
        (ch - padding * 2) / probe.naturalHeight
      )
      setTransform({
        x: (cw - probe.naturalWidth * scale) / 2,
        y: (ch - probe.naturalHeight * scale) / 2,
        scale
      })
    }
    probe.src = src
    return () => {
      cancelled = true
    }
  }, [layers.original])

  // Load the active mask into an offscreen canvas when it changes externally
  // (sample load, pipeline output, or switching between particle/epidermis).
  // While painting that layer the offscreen canvas is the source of truth, so we
  // must NOT reload it from our own per-frame emissions — that races with rapid
  // strokes and drops in-progress segments. The guard keys on the paint target,
  // so a genuine mode switch still forces a reload from the new layer.
  useEffect(() => {
    const src = paintSrc
    if (!src) {
      maskCanvasRef.current = null
      maskTargetRef.current = null
      return
    }
    if (isPaint && maskCanvasRef.current && maskTargetRef.current === mode) return
    const img = new Image()
    let cancelled = false
    img.onload = () => {
      if (cancelled) return
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000' // opaque black background so export stays binary
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0)
      maskCanvasRef.current = c
      maskTargetRef.current = isPaint ? mode : null
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [paintSrc, isPaint, mode])

  // Edit State
  const [activeChainStartNodeId, setActiveChainStartNodeId] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<Point | null>(null) // In Image Coordinates
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    edgeId?: string
    nodeId?: string
  } | null>(null)

  // Helper: Screen to Image Coordinates
  const toImageCoords = useCallback(
    (screenX: number, screenY: number): Point => {
      if (!containerRef.current) return { x: 0, y: 0 }
      const rect = containerRef.current.getBoundingClientRect()
      return {
        x: (screenX - rect.left - transform.x) / transform.scale,
        y: (screenY - rect.top - transform.y) / transform.scale
      }
    },
    [transform]
  )

  // Helper: Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomIntensity = 0.001
    const newScale = Math.min(Math.max(0.1, transform.scale * (1 - e.deltaY * zoomIntensity)), 10)

    // Zoom towards mouse pointer
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const scaleRatio = newScale / transform.scale
      const newX = mouseX - (mouseX - transform.x) * scaleRatio
      const newY = mouseY - (mouseY - transform.y) * scaleRatio

      setTransform({ x: newX, y: newY, scale: newScale })
    }
  }

  // Helper: Cleanup Isolated Nodes
  const cleanupIsolatedNodes = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
    const connectedNodeIds = new Set<string>()
    currentEdges.forEach((e) => {
      connectedNodeIds.add(e.sourceId)
      connectedNodeIds.add(e.targetId)
    })

    // Filter nodes that are used in at least one edge, OR is the currently active node (to prevent deleting the one we are drawing from)
    // Note: In strict graph cleaning, we remove isolates. But if user just clicked a node to make it active, we shouldn't delete it if they delete an edge elsewhere.
    // However, the deleteEdge function is atomic.
    return currentNodes.filter((n) => connectedNodeIds.has(n.id))
  }, [])

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setGraph((prev) => {
        const newEdges = prev.edges.filter((e) => e.id !== edgeId)
        const newNodes = cleanupIsolatedNodes(prev.nodes, newEdges)

        // If the active node was deleted as a result of cleanup, reset active chain
        // This is a bit complex because we need to know if the active node is still in newNodes.
        // We'll handle resetting activeChainStartNodeId inside the component render logic if needed,
        // or just let it be null if the ID doesn't exist anymore.

        return { nodes: newNodes, edges: newEdges }
      })
      setSelectedEdgeId(null)
      setContextMenu(null)
    },
    [cleanupIsolatedNodes, setGraph]
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      setGraph((prev) => {
        // Remove all edges connected to this node
        const newEdges = prev.edges.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId)
        // Remove the node itself
        const newNodes = prev.nodes.filter((n) => n.id !== nodeId)

        return { nodes: newNodes, edges: newEdges }
      })

      // Reset active chain if we deleted the active node
      if (activeChainStartNodeId === nodeId) {
        setActiveChainStartNodeId(null)
      }

      setSelectedNodeId(null)
      setContextMenu(null)
    },
    [activeChainStartNodeId, setGraph]
  )

  // Keydown handlers (Esc, Del)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveChainStartNodeId(null)
        setSelectedEdgeId(null)
        setSelectedNodeId(null)
        setContextMenu(null)
      }
      if (canEdit && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedNodeId) {
          deleteNode(selectedNodeId)
        } else if (selectedEdgeId) {
          deleteEdge(selectedEdgeId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canEdit, selectedNodeId, selectedEdgeId, deleteNode, deleteEdge])

  // ── Particle-mask painting ────────────────────────────────────────────────
  // A blank mask is created lazily (sized to the original image) if none exists.
  const ensureMaskCanvas = (): HTMLCanvasElement | null => {
    if (maskCanvasRef.current) return maskCanvasRef.current
    const dims = originalDimsRef.current
    if (!dims) return null
    const c = document.createElement('canvas')
    c.width = dims.w
    c.height = dims.h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    maskCanvasRef.current = c
    maskTargetRef.current = mode // blank canvas is authoritative for the current paint target
    return c
  }

  // ponytail: re-encode the PNG once per animation frame while painting; fine up
  // to a few megapixels — switch to a live overlay canvas if it ever lags.
  const scheduleMaskExport = (): void => {
    if (exportScheduledRef.current) return
    exportScheduledRef.current = true
    requestAnimationFrame(() => {
      exportScheduledRef.current = false
      const c = maskCanvasRef.current
      if (!c) return
      onPaintMask?.(c.toDataURL('image/png'))
    })
  }

  // Paint (white) or erase (black) a round stroke from `from` to `to` in image
  // pixels. `from` null = a single dab (click).
  const paintStroke = (from: Point | null, to: Point): void => {
    const c = ensureMaskCanvas()
    const ctx = c?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = paintTool === 'brush' ? '#fff' : '#000'
    ctx.strokeStyle = ctx.fillStyle as string
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (from) {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    scheduleMaskExport()
  }

  // Interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      // Right Click
      if (isPaint) {
        setParticleMenu({ x: e.clientX, y: e.clientY }) // open tool/size menu
        return
      }
      if (canEdit) {
        setActiveChainStartNodeId(null) // Stop chain
      }
      return
    }

    // Pan: middle click, modifier drag, or (outside a paint mode) whenever graph
    // editing is off. Left-click stays free to paint in a mask-edit mode.
    if (e.button === 1 || e.shiftKey || e.ctrlKey || (!isPaint && !canEdit)) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    // Mask-edit modes: Left Click paints with the current tool.
    if (isPaint) {
      setParticleMenu(null)
      const p = toImageCoords(e.clientX, e.clientY)
      isPaintingRef.current = true
      lastPaintRef.current = p
      paintStroke(null, p)
      return
    }

    // Edit Mode: Left Click
    // Note: Edge clicks and Node clicks stop propagation, so if we reach here, we clicked "empty space" or images
    {
      const coords = toImageCoords(e.clientX, e.clientY)

      // Deselect edge and node if clicking background
      setSelectedEdgeId(null)
      setSelectedNodeId(null)
      setContextMenu(null)

      // Create Node
      const newNode: Node = {
        id: uuidv4(),
        x: coords.x,
        y: coords.y
      }

      setGraph((prev) => {
        const newNodes = [...prev.nodes, newNode]
        const newEdges = [...prev.edges]

        if (activeChainStartNodeId) {
          // Check if start node still exists
          const startNodeExists = prev.nodes.find((n) => n.id === activeChainStartNodeId)
          if (startNodeExists) {
            const newEdge: Edge = {
              id: uuidv4(),
              sourceId: activeChainStartNodeId,
              targetId: newNode.id
            }
            newEdges.push(newEdge)
          }
        }
        return { nodes: newNodes, edges: newEdges }
      })

      // Continue chain
      setActiveChainStartNodeId(newNode.id)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    // Panning
    if (isPanning && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x
      const dy = e.clientY - lastPanPoint.y
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    // Mask-edit modes: track the brush and paint while the button is held.
    if (isPaint) {
      const p = toImageCoords(e.clientX, e.clientY)
      setMousePos(p)
      if (isPaintingRef.current) {
        paintStroke(lastPaintRef.current, p)
        lastPaintRef.current = p
      }
      return
    }

    // Tracking mouse for ghost line
    if (canEdit) {
      setMousePos(toImageCoords(e.clientX, e.clientY))
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
    setLastPanPoint(null)
    if (isPaintingRef.current) {
      isPaintingRef.current = false
      lastPaintRef.current = null
      scheduleMaskExport() // commit the final stroke
    }
  }

  const handleEdgeClick = (e: React.MouseEvent, edgeId: string) => {
    // Only intercept Left Click for selection to avoid conflict with pan/context menu
    if (e.button !== 0) return

    if (!canEdit) return
    e.stopPropagation()
    setSelectedEdgeId(edgeId)
  }

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    // Only intercept Left Click
    if (e.button !== 0) return
    if (!canEdit) return // Let the event bubble to the container so pan still works

    e.stopPropagation() // Prevent creating a new node on top of this one

    {
      // 1. If we have an active chain, connect to this existing node
      if (activeChainStartNodeId && activeChainStartNodeId !== nodeId) {
        setGraph((prev) => {
          // Prevent duplicate edges
          const exists = prev.edges.some(
            (edge) =>
              (edge.sourceId === activeChainStartNodeId && edge.targetId === nodeId) ||
              (edge.sourceId === nodeId && edge.targetId === activeChainStartNodeId)
          )

          if (exists) return prev

          const newEdge: Edge = {
            id: uuidv4(),
            sourceId: activeChainStartNodeId,
            targetId: nodeId
          }
          return {
            ...prev,
            edges: [...prev.edges, newEdge]
          }
        })
      }

      // 2. Set this node as the active start point for the next segment
      setActiveChainStartNodeId(nodeId)

      // Also clear selections to avoid confusion
      setSelectedEdgeId(null)
      setSelectedNodeId(null)
    }
  }

  const handleNodeContextMenu = (e: React.MouseEvent, nodeId: string) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedNodeId(nodeId)
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId })
  }

  const handleEdgeContextMenu = (e: React.MouseEvent, edgeId: string) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedEdgeId(edgeId)
    setContextMenu({ x: e.clientX, y: e.clientY, edgeId })
  }

  const getActiveStartNode = () => {
    if (!activeChainStartNodeId) return null
    return graph.nodes.find((n) => n.id === activeChainStartNodeId)
  }

  const activeNode = getActiveStartNode()

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-slate-950 select-none cursor-${isPanning ? 'grab' : canEdit || isPaint ? 'crosshair' : 'grab'}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        id="canvas-layer"
        className="absolute origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
        }}
      >
        {/* Placeholder for size to ensure we have a coordinate system if no images */}
        <div className="absolute top-0 left-0 w-[2000px] h-[2000px] pointer-events-none opacity-0" />

        {/* 1. Original Image - Z-index 0 */}
        {settings.showOriginal && layers.original && (
          <img
            src={layers.original}
            alt="Original"
            className="absolute top-0 left-0 pointer-events-none select-none max-w-none z-0"
            style={{ opacity: settings.originalOpacity, imageRendering: 'pixelated' }}
            draggable={false}
          />
        )}

        {/* 2. Mask Image - Z-index 10 */}
        {/* Binary mask is tinted by recoloring a div whose alpha is taken from
            the source's luminance — white pixels become opaque in the chosen
            color, black pixels become transparent. */}
        {settings.showMask && layers.mask && (
          <div
            className="absolute top-0 left-0 pointer-events-none select-none z-10"
            style={{
              opacity: settings.maskOpacity,
              backgroundColor: settings.maskColor,
              maskImage: `url(${layers.mask})`,
              maskMode: 'luminance',
              maskRepeat: 'no-repeat'
            }}
          >
            <img
              src={layers.mask}
              alt=""
              className="block max-w-none select-none invisible"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          </div>
        )}

        {/* 2b. ROI Mask Image - Z-index 15 (between mask and annotation) */}
        {settings.showRoi && layers.roiMask && (
          <div
            className="absolute top-0 left-0 pointer-events-none select-none z-[15]"
            style={{
              opacity: settings.roiOpacity,
              backgroundColor: settings.roiColor,
              maskImage: `url(${layers.roiMask})`,
              maskMode: 'luminance',
              maskRepeat: 'no-repeat'
            }}
          >
            <img
              src={layers.roiMask}
              alt=""
              className="block max-w-none select-none invisible"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          </div>
        )}

        {/* 2c. Preprocessed fiber map - Z-index 17 (between ROI and annotation).
            Grayscale Sato-enhanced image; tinted-mask trick paints fiber-bright
            pixels in the chosen colour. */}
        {settings.showPreprocess && layers.preprocess && (
          <div
            className="absolute top-0 left-0 pointer-events-none select-none z-[17]"
            style={{
              opacity: settings.preprocessOpacity,
              backgroundColor: settings.preprocessColor,
              maskImage: `url(${layers.preprocess})`,
              maskMode: 'luminance',
              maskRepeat: 'no-repeat'
            }}
          >
            <img
              src={layers.preprocess}
              alt=""
              className="block max-w-none select-none invisible"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          </div>
        )}

        {/* 3. Annotation Image - Z-index 20 */}
        {settings.showAnnotation && layers.annotation && (
          <div
            className="absolute top-0 left-0 pointer-events-none select-none z-20"
            style={{
              opacity: settings.annotationOpacity,
              backgroundColor: settings.annotationColor,
              maskImage: `url(${layers.annotation})`,
              maskMode: 'luminance',
              maskRepeat: 'no-repeat'
            }}
          >
            <img
              src={layers.annotation}
              alt=""
              className="block max-w-none select-none invisible"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          </div>
        )}

        {/* 4. Graph Layer (SVG) - Z-index 30 */}
        {settings.showGraph && (
        <svg className="absolute top-0 left-0 overflow-visible w-[1px] h-[1px] z-30 pointer-events-none">
          {/* Edges */}
          {graph.edges.map((edge) => {
            const start = graph.nodes.find((n) => n.id === edge.sourceId)
            const end = graph.nodes.find((n) => n.id === edge.targetId)
            if (!start || !end) return null

            const isSelected = selectedEdgeId === edge.id

            // Use path if available, otherwise draw straight line
            const pathData =
              edge.path && edge.path.length > 0
                ? `M ${edge.path.map((p) => `${p.x},${p.y}`).join(' L ')}`
                : `M ${start.x},${start.y} L ${end.x},${end.y}`

            return (
              <g key={edge.id} className="pointer-events-auto">
                {/* Invisible thick path for easier clicking */}
                <path
                  d={pathData}
                  stroke="transparent"
                  strokeWidth={12 / transform.scale}
                  fill="none"
                  className="cursor-pointer"
                  onMouseDown={(e) => handleEdgeClick(e, edge.id)}
                  onContextMenu={(e) => handleEdgeContextMenu(e, edge.id)}
                />
                {/* Visible Path */}
                <path
                  d={pathData}
                  stroke={
                    isSelected
                      ? '#FCD34D' // Selected: yellow
                      : edge.isEffective
                        ? '#34D399' // Effective crossing segment: green (matches viz_crossing.py)
                        : '#3B82F6' // Default: blue
                  }
                  strokeWidth={isSelected ? 3 / transform.scale : 2 / transform.scale}
                  fill="none"
                  className="pointer-events-none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const isActive = activeChainStartNodeId === node.id
            const isSelected = selectedNodeId === node.id
            return (
              <g key={node.id} className="pointer-events-auto">
                {/* Hit Area - Larger invisible circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={10 / transform.scale}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseDown={(e) => handleNodeClick(e, node.id)}
                  onContextMenu={(e) => handleNodeContextMenu(e, node.id)}
                />
                {/* Visual Node */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isActive ? 5 / transform.scale : 4 / transform.scale}
                  fill={isSelected ? '#EF4444' : isActive ? '#FCD34D' : '#60A5FA'} // Red if selected, Yellow if active chain start, Blue otherwise
                  stroke="white"
                  strokeWidth={isSelected ? 2 / transform.scale : 1.5 / transform.scale}
                  className="pointer-events-none"
                />
              </g>
            )
          })}

          {/* Ghost Line (Active Creation) */}
          {mode === 'edit' && activeNode && mousePos && (
            <line
              x1={activeNode.x}
              y1={activeNode.y}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke="#93C5FD"
              strokeWidth={1.5 / transform.scale}
              strokeDasharray={`${4 / transform.scale},${3 / transform.scale}`}
              className="pointer-events-none opacity-80"
            />
          )}
        </svg>
        )}

        {/* Brush cursor ring (mask-edit modes) */}
        {isPaint && mousePos && (
          <svg className="absolute top-0 left-0 overflow-visible w-[1px] h-[1px] z-40 pointer-events-none">
            <circle
              cx={mousePos.x}
              cy={mousePos.y}
              r={brushSize / 2}
              fill="none"
              stroke="#000"
              strokeWidth={2.5 / transform.scale}
              opacity={0.5}
            />
            <circle
              cx={mousePos.x}
              cy={mousePos.y}
              r={brushSize / 2}
              fill="none"
              stroke={paintTool === 'brush' ? '#34D399' : '#F87171'}
              strokeWidth={1.5 / transform.scale}
            />
          </svg>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-slate-800 border border-slate-600 shadow-xl rounded z-50 py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.edgeId && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
              onClick={() => deleteEdge(contextMenu.edgeId!)}
            >
              <span>Delete Edge</span>
              <span className="text-xs text-slate-400 ml-auto">Del</span>
            </button>
          )}
          {contextMenu.nodeId && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
              onClick={() => deleteNode(contextMenu.nodeId!)}
            >
              <span>Delete Node</span>
              <span className="text-xs text-slate-400 ml-auto">Del</span>
            </button>
          )}
        </div>
      )}

      {/* Particle tool menu (right-click in particle mode) */}
      {particleMenu && (
        <div
          className="fixed bg-slate-800 border border-slate-600 shadow-xl rounded z-50 p-3 w-52"
          style={{ top: particleMenu.y, left: particleMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Particle Tool
          </div>
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setPaintTool('brush')}
              className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                paintTool === 'brush'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Brush
            </button>
            <button
              onClick={() => setPaintTool('erase')}
              className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                paintTool === 'erase'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Erase
            </button>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Diameter</span>
            <span>{brushSize} px</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full accent-emerald-400 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}
    </div>
  )
}
