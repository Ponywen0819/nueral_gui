import React from 'react'
import { LayerSettings, ImageLayers, ColorMapMode, PipelineConfig } from '../types'
import { Eye, EyeOff, Upload, Settings2, Play, Loader2 } from 'lucide-react'
import { PipelineConfig as PipelineConfigComponent } from './PipelineConfig'

interface LayerControlsProps {
  layers: ImageLayers
  settings: LayerSettings
  onUpload: (type: keyof ImageLayers, dataURL: string) => void
  onSettingChange: (newSettings: LayerSettings) => void
  onRunPipeline: () => void
  isPipelineRunning: boolean
  pipelineError: string | null
  onPipelineConfigChange?: (config: PipelineConfig) => void
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  settings,
  onUpload,
  onSettingChange,
  onRunPipeline,
  isPipelineRunning,
  pipelineError,
  onPipelineConfigChange
}) => {
  const handleOpenDialog = async (type: keyof ImageLayers) => {
    try {
      const result = await window.api.openImageDialog()
      if (result.success && result.data) {
        onUpload(type, result.data)
      } else if (result.error) {
        console.error('Failed to load image:', result.error)
        alert(`Failed to load image: ${result.error}`)
      }
    } catch (error) {
      console.error('Error opening image dialog:', error)
      alert('Error opening image dialog')
    }
  }

  const toggleLayer = (key: keyof LayerSettings) => {
    onSettingChange({ ...settings, [key]: !settings[key as keyof LayerSettings] })
  }

  const updateOpacity = (
    key: 'originalOpacity' | 'annotationOpacity' | 'maskOpacity',
    value: number
  ) => {
    onSettingChange({ ...settings, [key]: value })
  }

  const updateColorMap = (colorMap: ColorMapMode) => {
    onSettingChange({ ...settings, originalColorMap: colorMap })
  }

  return (
    <div className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col h-full text-slate-200">
      <div className="p-4 border-b border-slate-700 bg-slate-800">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-400" />
          Layers & Data
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Original Image Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Original
            </label>
            <button
              onClick={() => toggleLayer('showOriginal')}
              className="text-slate-400 hover:text-white"
            >
              {settings.showOriginal ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenDialog('original')}
              className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 transition px-3 py-2 rounded border border-slate-600 flex items-center gap-2 text-sm truncate"
            >
              <Upload size={14} />
              {layers.original ? 'Change Original' : 'Upload Original'}
            </button>
          </div>
          {settings.showOriginal && (
            <div className="space-y-3">
              {/* Color Map Mode Selector */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Display Mode</label>
                <select
                  value={settings.originalColorMap}
                  onChange={(e) => updateColorMap(e.target.value as ColorMapMode)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="red">Red Channel</option>
                  <option value="green">Green Channel</option>
                  <option value="blue">Blue Channel</option>
                  <option value="green-viridis">Green Viridis</option>
                </select>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Opacity</span>
                  <span>{Math.round(settings.originalOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.originalOpacity}
                  onChange={(e) => updateOpacity('originalOpacity', parseFloat(e.target.value))}
                  className="w-full accent-blue-400 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Mask Image Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Mask
            </label>
            <button
              onClick={() => toggleLayer('showMask')}
              className="text-slate-400 hover:text-white"
            >
              {settings.showMask ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenDialog('mask')}
              className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 transition px-3 py-2 rounded border border-slate-600 flex items-center gap-2 text-sm truncate"
            >
              <Upload size={14} />
              {layers.mask ? 'Change Mask' : 'Upload Mask'}
            </button>
          </div>
          {settings.showMask && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Opacity</span>
                <span>{Math.round(settings.maskOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.maskOpacity}
                onChange={(e) => updateOpacity('maskOpacity', parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Annotation Image Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Annotation
            </label>
            <button
              onClick={() => toggleLayer('showAnnotation')}
              className="text-slate-400 hover:text-white"
            >
              {settings.showAnnotation ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenDialog('annotation')}
              className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 transition px-3 py-2 rounded border border-slate-600 flex items-center gap-2 text-sm truncate"
            >
              <Upload size={14} />
              {layers.annotation ? 'Change Annotation' : 'Upload Annotation'}
            </button>
          </div>
          {settings.showAnnotation && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Opacity</span>
                <span>{Math.round(settings.annotationOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.annotationOpacity}
                onChange={(e) => updateOpacity('annotationOpacity', parseFloat(e.target.value))}
                className="w-full accent-green-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Pipeline Execution Section */}
        <div className="space-y-3 pt-6 border-t border-slate-700">
          <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Neural Pipeline
          </label>

          <button
            onClick={onRunPipeline}
            disabled={!layers.original || !layers.mask || !layers.annotation || isPipelineRunning}
            className={`w-full px-4 py-3 rounded font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              !layers.original || !layers.mask || !layers.annotation || isPipelineRunning
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {isPipelineRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Pipeline
              </>
            )}
          </button>

          {pipelineError && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
              <strong className="block mb-1">Error:</strong>
              {pipelineError}
            </div>
          )}

          {!layers.original || !layers.mask || !layers.annotation ? (
            <p className="text-xs text-slate-500 italic">
              Upload all three images to enable pipeline
            </p>
          ) : null}

          {/* Pipeline Configuration */}
          <PipelineConfigComponent onConfigChange={onPipelineConfigChange} />
        </div>

        <div className="mt-6 p-4 bg-slate-800/50 rounded text-xs text-slate-400 space-y-2 border border-slate-700">
          <p className="font-semibold text-slate-300">Instructions:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <strong>L-Click (Edit Mode):</strong> Add Node / Continue Chain
            </li>
            <li>
              <strong>R-Click / Esc (Edit Mode):</strong> Stop Chain
            </li>
            <li>
              <strong>L-Click on Edge:</strong> Select Edge
            </li>
            <li>
              <strong>Del Key:</strong> Delete Selected Edge
            </li>
            <li>
              <strong>R-Click on Edge:</strong> Delete Menu
            </li>
            <li>
              <strong>Mouse Wheel:</strong> Zoom
            </li>
            <li>
              <strong>Drag (View Mode):</strong> Pan
            </li>
            <li>
              <strong>Space + Drag (Edit Mode):</strong> Pan
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
