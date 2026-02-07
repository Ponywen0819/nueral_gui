import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { PipelineConfig as PipelineConfigType } from '../types'

interface PipelineConfigProps {
  onConfigChange?: (config: PipelineConfigType) => void
}

export const PipelineConfig: React.FC<PipelineConfigProps> = ({ onConfigChange }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [config, setConfig] = useState<PipelineConfigType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.api.getPipelineConfig()
      if (result.success && result.data) {
        setConfig(result.data as PipelineConfigType)
        onConfigChange?.(result.data as PipelineConfigType)
      } else {
        setError(result.error || 'Failed to load config')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const updateConfig = async (newConfig: PipelineConfigType) => {
    try {
      const result = await window.api.updatePipelineConfig(newConfig)
      if (result.success) {
        setConfig(newConfig)
        onConfigChange?.(newConfig)
      } else {
        setError(result.error || 'Failed to update config')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // Preprocessing parameter handlers
  const handlePreprocessingChange = (key: keyof PipelineConfigType['preprocessing'], value: number | [number, number]) => {
    if (!config) return
    const newConfig = {
      ...config,
      preprocessing: {
        ...config.preprocessing,
        [key]: value
      }
    }
    updateConfig(newConfig)
  }

  // Reconstruction parameter handlers
  const handleReconstructionChange = (key: keyof PipelineConfigType['reconstruction'], value: number) => {
    if (!config) return
    const newConfig = {
      ...config,
      reconstruction: {
        ...config.reconstruction,
        [key]: value
      }
    }
    updateConfig(newConfig)
  }

  if (isLoading) {
    return (
      <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-400 border border-slate-700">
        Loading configuration...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
        <strong className="block mb-1">Error:</strong>
        {error}
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-3 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 bg-slate-800 hover:bg-slate-750 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-indigo-400" />
          <span className="text-sm font-semibold text-slate-300">Pipeline Configuration</span>
        </div>
        {isExpanded ? (
          <ChevronDown size={18} className="text-slate-400" />
        ) : (
          <ChevronRight size={18} className="text-slate-400" />
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-slate-900/50 max-h-[60vh] overflow-y-auto">
          {/* Reconstruction Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Reconstruction
            </h4>

            {/* Segment Length */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Segment Length (pixels)</span>
                <span>{config.reconstruction.segment_length}</span>
              </div>
              <input
                type="number"
                min="1"
                step="0.1"
                value={config.reconstruction.segment_length}
                onChange={(e) => handleReconstructionChange('segment_length', parseFloat(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Search Radius */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Search Radius (pixels)</span>
                <span>{config.reconstruction.search_radius}</span>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={config.reconstruction.search_radius}
                onChange={(e) => handleReconstructionChange('search_radius', parseFloat(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Path Finding Bbox Padding */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Pathfinding BBox Padding</span>
                <span>{config.reconstruction.path_finding_bbox_padding}</span>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={config.reconstruction.path_finding_bbox_padding}
                onChange={(e) => handleReconstructionChange('path_finding_bbox_padding', parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Preprocessing Section */}
          <div className="space-y-3 pt-3 border-t border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Preprocessing
            </h4>

            {/* Dermis Offset */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Dermis Offset (pixels)</span>
                <span>{config.preprocessing.dermis_offset_px}</span>
              </div>
              <input
                type="number"
                min="0"
                step="1"
                value={config.preprocessing.dermis_offset_px}
                onChange={(e) => handlePreprocessingChange('dermis_offset_px', parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Rolling Ball Radius */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Rolling Ball Radius</span>
                <span>{config.preprocessing.rolling_ball_radius}</span>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={config.preprocessing.rolling_ball_radius}
                onChange={(e) => handlePreprocessingChange('rolling_ball_radius', parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Sato Weight */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Sato Filter Weight</span>
                <span>{config.preprocessing.sato_weight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.preprocessing.sato_weight}
                onChange={(e) => handlePreprocessingChange('sato_weight', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Morphology Kernel Size */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Morphology Kernel Size</span>
                <span>{config.preprocessing.morphology_kernel_size}</span>
              </div>
              <input
                type="number"
                min="1"
                step="2"
                value={config.preprocessing.morphology_kernel_size}
                onChange={(e) => handlePreprocessingChange('morphology_kernel_size', parseInt(e.target.value) || 3)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
