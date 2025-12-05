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

  const handleConnectivityChange = (value: number) => {
    if (!config) return
    const newConfig = {
      ...config,
      connected_components: {
        ...config.connected_components,
        connectivity: value
      }
    }
    updateConfig(newConfig)
  }

  const handleMinAreaChange = (value: number) => {
    if (!config) return
    const newConfig = {
      ...config,
      connected_components: {
        ...config.connected_components,
        min_area: value
      }
    }
    updateConfig(newConfig)
  }

  const handleSegmentLengthChange = (value: number) => {
    if (!config) return
    const newConfig = {
      ...config,
      seed_extraction: {
        base_segment_length: value
      }
    }
    updateConfig(newConfig)
  }

  const handleMaxDistanceChange = (value: number) => {
    if (!config) return
    const newConfig = {
      ...config,
      component_pairing: {
        ...config.component_pairing,
        max_distance_threshold: value
      }
    }
    updateConfig(newConfig)
  }

  const handleMaxCostChange = (value: number) => {
    if (!config) return
    const newConfig = {
      ...config,
      component_pairing: {
        ...config.component_pairing,
        max_cost_threshold: value
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
        <div className="p-4 space-y-4 bg-slate-900/50">
          {/* Connected Components Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Connected Components
            </h4>

            {/* Connectivity */}
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Connectivity</label>
              <select
                value={config.connected_components.connectivity}
                onChange={(e) => handleConnectivityChange(parseInt(e.target.value))}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={4}>4-Connected</option>
                <option value={8}>8-Connected</option>
              </select>
            </div>

            {/* Min Area */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Minimum Area (pixels)</span>
                <span>{config.connected_components.min_area}</span>
              </div>
              <input
                type="number"
                min="0"
                step="1"
                value={config.connected_components.min_area}
                onChange={(e) => handleMinAreaChange(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Seed Extraction Section */}
          <div className="space-y-3 pt-3 border-t border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Seed Extraction
            </h4>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Base Segment Length (pixels)</span>
                <span>{config.seed_extraction.base_segment_length}</span>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={config.seed_extraction.base_segment_length}
                onChange={(e) => handleSegmentLengthChange(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Component Pairing Section */}
          <div className="space-y-3 pt-3 border-t border-slate-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Component Pairing
            </h4>

            {/* Max Distance */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Max Distance Threshold (pixels)</span>
                <span>{config.component_pairing.max_distance_threshold}</span>
              </div>
              <input
                type="number"
                min="1"
                step="1"
                value={config.component_pairing.max_distance_threshold}
                onChange={(e) => handleMaxDistanceChange(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Max Cost */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Max Cost Threshold</span>
                <span>{config.component_pairing.max_cost_threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1"
                step="0.01"
                value={config.component_pairing.max_cost_threshold}
                onChange={(e) => handleMaxCostChange(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
