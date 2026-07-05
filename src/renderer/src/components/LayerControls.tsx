import React, { useState } from 'react'
import { LayerSettings, ImageLayers, ColorMapMode, PipelineParams, SampleFiles } from '../types'
import {
  Eye,
  EyeOff,
  Play,
  Loader2,
  Sliders,
  Check,
  Circle,
  AlertCircle,
  ImageDown,
  FolderOpen,
  Layers,
  FolderTree,
  Cpu,
  Keyboard,
  X
} from 'lucide-react'
import { PipelineParamsModal } from './PipelineParamsModal'

type StageKey = 'roi' | 'preprocess' | 'reconstruct' | 'count'
type StageStatus = 'idle' | 'running' | 'done' | 'error'

interface LayerControlsProps {
  layers: ImageLayers
  settings: LayerSettings
  onSettingChange: (newSettings: LayerSettings) => void
  workDir: string | null
  samples: SampleFiles[]
  activeSample: string | null
  onSelectWorkDir: () => void
  onSelectSample: (sample: SampleFiles) => void
  hasGraph: boolean
  onExportMask: () => void
  imagesReady: boolean
  isPipelineRunning: boolean
  pipelineError: string | null
  pipelineParams: PipelineParams
  onPipelineParamsChange: (params: PipelineParams) => void
  stageStatus: Record<StageKey, StageStatus>
  onRunRoi: () => void
  onRunPreprocess: () => void
  onRunReconstruct: () => void
  onRunCount: () => void
  onRunAll: () => void
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  layers,
  settings,
  onSettingChange,
  workDir,
  samples,
  activeSample,
  onSelectWorkDir,
  onSelectSample,
  hasGraph,
  onExportMask,
  imagesReady,
  isPipelineRunning,
  pipelineError,
  pipelineParams,
  onPipelineParamsChange,
  stageStatus,
  onRunRoi,
  onRunPreprocess,
  onRunReconstruct,
  onRunCount,
  onRunAll
}) => {
  const [paramsModalOpen, setParamsModalOpen] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [tab, setTab] = useState<'samples' | 'layers' | 'algorithm'>('samples')

  const toggleLayer = (key: keyof LayerSettings) => {
    onSettingChange({ ...settings, [key]: !settings[key as keyof LayerSettings] })
  }

  const updateOpacity = (
    key:
      | 'originalOpacity'
      | 'annotationOpacity'
      | 'maskOpacity'
      | 'roiOpacity'
      | 'preprocessOpacity',
    value: number
  ) => {
    onSettingChange({ ...settings, [key]: value })
  }

  const updateColorMap = (colorMap: ColorMapMode) => {
    onSettingChange({ ...settings, originalColorMap: colorMap })
  }

  const updateColor = (
    key: 'maskColor' | 'annotationColor' | 'roiColor' | 'preprocessColor',
    value: string
  ) => {
    onSettingChange({ ...settings, [key]: value })
  }

  return (
    <>
    <PipelineParamsModal
      open={paramsModalOpen}
      onClose={() => setParamsModalOpen(false)}
      params={pipelineParams}
      onChange={onPipelineParamsChange}
    />
    {helpModalOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => setHelpModalOpen(false)}
      >
        <div
          className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <Keyboard size={18} className="text-indigo-400" />
              <h3 className="text-base font-semibold text-slate-100">Controls &amp; Shortcuts</h3>
            </div>
            <button
              onClick={() => setHelpModalOpen(false)}
              aria-label="Close"
              className="text-slate-300 hover:text-slate-100 p-1 rounded hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-5 text-sm text-slate-300">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Left-click (edit mode):</strong> Add node / extend chain
              </li>
              <li>
                <strong>Right-click / Esc (edit mode):</strong> End current chain
              </li>
              <li>
                <strong>Left-click edge:</strong> Select edge
              </li>
              <li>
                <strong>Del key:</strong> Delete selected edge
              </li>
              <li>
                <strong>Right-click edge:</strong> Open delete menu
              </li>
              <li>
                <strong>Mouse wheel:</strong> Zoom
              </li>
              <li>
                <strong>Drag (view mode):</strong> Pan
              </li>
              <li>
                <strong>Space + drag (edit mode):</strong> Pan
              </li>
            </ul>
          </div>
        </div>
      </div>
    )}
    <div className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col h-full text-slate-200">
      {/* Tab switcher (replaces the "Layers & Data" title) */}
      <div className="flex border-b border-slate-700 bg-slate-800">
        {(
          [
            { id: 'samples', label: 'Samples', icon: <FolderTree size={15} /> },
            { id: 'layers', label: 'Layers', icon: <Layers size={15} /> },
            { id: 'algorithm', label: 'Algorithm', icon: <Cpu size={15} /> }
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'text-white border-b-2 border-blue-500 bg-slate-900'
                : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Samples tab */}
      {tab === 'samples' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <button
            onClick={onSelectWorkDir}
            className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors"
          >
            <FolderOpen size={14} className="text-blue-400" />
            {workDir ? 'Change Working Folder' : 'Select Working Folder'}
          </button>
          {workDir && (
            <p className="text-[11px] text-slate-500 break-all" title={workDir}>
              {workDir}
            </p>
          )}
          {workDir && samples.length > 0 && (
            <p className="text-[11px] text-slate-500">
              {samples.length} sample{samples.length === 1 ? '' : 's'}
            </p>
          )}

          {!workDir ? (
            <p className="text-xs text-slate-400 italic">
              Select a working folder to list its samples.
            </p>
          ) : samples.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No samples found in this folder.</p>
          ) : (
            <div className="space-y-1">
              {samples.map((s) => {
                const active = s.name === activeSample
                const incomplete = !s.epidermis || !s.particle
                return (
                  <button
                    key={s.name}
                    onClick={() => onSelectSample(s)}
                    className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded border text-sm transition-colors ${
                      active
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    {incomplete && (
                      <AlertCircle
                        size={13}
                        className="shrink-0 text-amber-400"
                        aria-label="Missing epidermis or particle file"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Layers tab */}
      {tab === 'layers' && (
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Original Image Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Original Image
            </label>
            <button
              onClick={() => toggleLayer('showOriginal')}
              className="text-slate-300 hover:text-white"
            >
              {settings.showOriginal ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <div className="space-y-3">
              {/* Color Map Mode Selector */}
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Display Mode</label>
                <select
                  value={settings.originalColorMap}
                  onChange={(e) => updateColorMap(e.target.value as ColorMapMode)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="red">Red Channel</option>
                  <option value="green">Green Channel</option>
                  <option value="blue">Blue Channel</option>
                  <option value="green-viridis">Green Channel (Viridis)</option>
                </select>
              </div>

              {/* Opacity Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
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
        </div>

        {/* Mask Image Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Epidermis Mask
            </label>
            <button
              onClick={() => toggleLayer('showMask')}
              className="text-slate-300 hover:text-white"
            >
              {settings.showMask ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
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
              <input
                type="color"
                value={settings.maskColor}
                onChange={(e) => updateColor('maskColor', e.target.value)}
                className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-800"
                title={settings.maskColor}
              />
            </div>
        </div>

        {/* ROI Mask Section — appears after the ROI stage has produced an output */}
        {layers.roiMask && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Region of Interest
              </label>
              <button
                onClick={() => toggleLayer('showRoi')}
                className="text-slate-300 hover:text-white"
              >
                {settings.showRoi ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Computed from the epidermis mask plus the offset
            </p>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Opacity</span>
                    <span>{Math.round(settings.roiOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.roiOpacity}
                    onChange={(e) => updateOpacity('roiOpacity', parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <input
                  type="color"
                  value={settings.roiColor}
                  onChange={(e) => updateColor('roiColor', e.target.value)}
                  className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-800"
                  title={settings.roiColor}
                />
              </div>
          </div>
        )}

        {/* Preprocessed Section — Sato-enhanced fiber map, appears after the Preprocess stage */}
        {layers.preprocess && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Preprocessed Output
              </label>
              <button
                onClick={() => toggleLayer('showPreprocess')}
                className="text-slate-300 hover:text-white"
              >
                {settings.showPreprocess ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Sato-enhanced fiber response
            </p>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Opacity</span>
                    <span>{Math.round(settings.preprocessOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.preprocessOpacity}
                    onChange={(e) =>
                      updateOpacity('preprocessOpacity', parseFloat(e.target.value))
                    }
                    className="w-full accent-pink-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <input
                  type="color"
                  value={settings.preprocessColor}
                  onChange={(e) => updateColor('preprocessColor', e.target.value)}
                  className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-800"
                  title={settings.preprocessColor}
                />
              </div>
          </div>
        )}

        {/* Annotation Image Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Particle Mask
            </label>
            <button
              onClick={() => toggleLayer('showAnnotation')}
              className="text-slate-300 hover:text-white"
            >
              {settings.showAnnotation ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
          <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
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
              <input
                type="color"
                value={settings.annotationColor}
                onChange={(e) => updateColor('annotationColor', e.target.value)}
                className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-800"
                title={settings.annotationColor}
              />
            </div>
        </div>

        {/* Reconstruction Result Section — graph overlay, appears once a graph exists */}
        {hasGraph && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Reconstruction Result
              </label>
              <button
                onClick={() => toggleLayer('showGraph')}
                className="text-slate-300 hover:text-white"
              >
                {settings.showGraph ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Reconstructed nodes and edges overlay
            </p>
            <button
              onClick={onExportMask}
              className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors"
              title="Export the result as a binary mask PNG"
            >
              <ImageDown size={14} className="text-emerald-400" />
              Export Mask
            </button>
          </div>
        )}

        <button
          onClick={() => setHelpModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 mt-2 text-xs px-3 py-2 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-300 rounded transition-colors"
        >
          <Keyboard size={14} />
          Keyboard Shortcuts
        </button>
      </div>
      )}

      {/* Algorithm tab */}
      {tab === 'algorithm' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Reconstruction Pipeline
          </label>

          <button
            onClick={() => setParamsModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors"
          >
            <Sliders size={14} className="text-indigo-400" />
            Parameters
          </button>

          <StageList
            imagesReady={imagesReady}
            isPipelineRunning={isPipelineRunning}
            stageStatus={stageStatus}
            onRunRoi={onRunRoi}
            onRunPreprocess={onRunPreprocess}
            onRunReconstruct={onRunReconstruct}
            onRunCount={onRunCount}
          />

          <button
            onClick={onRunAll}
            disabled={!imagesReady || isPipelineRunning}
            className={`w-full px-4 py-3 rounded font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              !imagesReady || isPipelineRunning
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {isPipelineRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Play size={16} />
                Run All
              </>
            )}
          </button>

          {pipelineError && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">
              <strong className="block mb-1">Error:</strong>
              {pipelineError}
            </div>
          )}

          {!imagesReady ? (
            <p className="text-xs text-slate-400 italic">
              Select a sample with all three images to run the reconstruction pipeline
            </p>
          ) : null}
        </div>
      )}
    </div>
    </>
  )
}

// ── Stage stepper ──────────────────────────────────────────────────────────

interface StageListProps {
  imagesReady: boolean
  isPipelineRunning: boolean
  stageStatus: Record<StageKey, StageStatus>
  onRunRoi: () => void
  onRunPreprocess: () => void
  onRunReconstruct: () => void
  onRunCount: () => void
}

const STAGE_DEFS: { key: StageKey; label: string }[] = [
  { key: 'roi', label: 'Region of Interest' },
  { key: 'preprocess', label: 'Preprocess' },
  { key: 'reconstruct', label: 'Reconstruct' },
  { key: 'count', label: 'Count' }
]

const StageList: React.FC<StageListProps> = ({
  imagesReady,
  isPipelineRunning,
  stageStatus,
  onRunRoi,
  onRunPreprocess,
  onRunReconstruct,
  onRunCount
}) => {
  const handlers: Record<StageKey, () => void> = {
    roi: onRunRoi,
    preprocess: onRunPreprocess,
    reconstruct: onRunReconstruct,
    count: onRunCount
  }

  // A stage's prerequisite is the prior stage being done at least once.
  // Count is special: once the prior reconstruct has happened we let the
  // user re-run it freely after graph edits.
  const prerequisitesMet = (idx: number): boolean => {
    if (idx === 0) return true
    const prev = STAGE_DEFS[idx - 1].key
    return stageStatus[prev] === 'done'
  }

  return (
    <div className="space-y-1.5">
      {STAGE_DEFS.map((stage, idx) => {
        const status = stageStatus[stage.key]
        const enabled = imagesReady && !isPipelineRunning && prerequisitesMet(idx)
        return (
          <button
            key={stage.key}
            onClick={handlers[stage.key]}
            disabled={!enabled}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded border text-sm transition-colors ${
              enabled
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 hover:border-slate-500 text-slate-100 cursor-pointer'
                : 'bg-slate-800/40 border-slate-700 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span className="w-5 h-5 inline-flex items-center justify-center text-slate-400 font-mono text-[11px]">
              {idx + 1}
            </span>
            <span className="flex-1 text-left">{stage.label}</span>
            <StageStatusIcon status={status} />
          </button>
        )
      })}
    </div>
  )
}

const StageStatusIcon: React.FC<{ status: StageStatus }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="animate-spin text-indigo-400" />
    case 'done':
      return <Check size={14} className="text-emerald-400" />
    case 'error':
      return <AlertCircle size={14} className="text-red-400" />
    default:
      return <Circle size={14} className="text-slate-500" />
  }
}
