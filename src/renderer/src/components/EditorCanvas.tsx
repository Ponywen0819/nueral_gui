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
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  layers,
  settings,
  mode,
  graph,
  setGraph
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // View State
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null)

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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          deleteNode(selectedNodeId)
        } else if (selectedEdgeId) {
          deleteEdge(selectedEdgeId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, deleteNode, deleteEdge])

  // Interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      // Right Click
      if (mode === 'edit') {
        setActiveChainStartNodeId(null) // Stop chain
      }
      return
    }

    // Middle click or Space+Click or View Mode -> Pan
    if (e.button === 1 || mode === 'view' || e.shiftKey || e.ctrlKey) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    // Edit Mode: Left Click
    // Note: Edge clicks and Node clicks stop propagation, so if we reach here, we clicked "empty space" or images
    if (mode === 'edit') {
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

    // Tracking mouse for ghost line
    if (mode === 'edit') {
      setMousePos(toImageCoords(e.clientX, e.clientY))
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
    setLastPanPoint(null)
  }

  const handleEdgeClick = (e: React.MouseEvent, edgeId: string) => {
    // Only intercept Left Click for selection to avoid conflict with pan/context menu
    if (e.button !== 0) return

    e.stopPropagation()
    if (mode === 'edit') {
      setSelectedEdgeId(edgeId)
    }
  }

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    // Only intercept Left Click
    if (e.button !== 0) return

    e.stopPropagation() // Prevent creating a new node on top of this one

    if (mode === 'edit') {
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
    e.preventDefault()
    e.stopPropagation()
    if (mode === 'edit') {
      setSelectedNodeId(nodeId)
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId })
    }
  }

  const handleEdgeContextMenu = (e: React.MouseEvent, edgeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (mode === 'edit') {
      setSelectedEdgeId(edgeId)
      setContextMenu({ x: e.clientX, y: e.clientY, edgeId })
    }
  }

  const getActiveStartNode = () => {
    if (!activeChainStartNodeId) return null
    return graph.nodes.find((n) => n.id === activeChainStartNodeId)
  }

  const activeNode = getActiveStartNode()

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-slate-950 select-none cursor-${mode === 'view' || isPanning ? 'grab' : 'crosshair'}`}
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
        {settings.showMask && layers.mask && (
          <img
            src={layers.mask}
            alt="Mask"
            className="absolute top-0 left-0 pointer-events-none select-none max-w-none z-10"
            style={{
              opacity: settings.maskOpacity,
              mixBlendMode: 'screen',
              imageRendering: 'pixelated'
            }}
            draggable={false}
          />
        )}

        {/* 3. Annotation Image - Z-index 20 */}
        {settings.showAnnotation && layers.annotation && (
          <img
            src={layers.annotation}
            alt="Annotation"
            className="absolute top-0 left-0 pointer-events-none select-none max-w-none z-20"
            style={{
              opacity: settings.annotationOpacity,
              mixBlendMode: 'screen',
              imageRendering: 'pixelated'
            }}
            draggable={false}
          />
        )}

        {/* 4. Graph Layer (SVG) - Z-index 30 */}
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
                  stroke={isSelected ? '#FCD34D' : '#3B82F6'} // Yellow if selected, Blue otherwise
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
              <span className="text-xs text-slate-500 ml-auto">Del</span>
            </button>
          )}
          {contextMenu.nodeId && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
              onClick={() => deleteNode(contextMenu.nodeId!)}
            >
              <span>Delete Node</span>
              <span className="text-xs text-slate-500 ml-auto">Del</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
