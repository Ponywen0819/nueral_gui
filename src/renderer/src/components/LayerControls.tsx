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
  FolderOpen,
  Layers,
  FolderTree,
  Cpu,
  Keyboard,
  Save,
  ToggleLeft,
  ToggleRight,
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
  autoSave: boolean
  onToggleAutoSave: () => void
  onSaveManual: (kind: 'epidermis' | 'particle' | 'fiber', name: string, dir: string | null) => void
  onChooseFolder: () => Promise<string | null>
  imagesReady: boolean
  isPipelineRunning: boolean
  pipelineError: string | null
  pipelineParams: PipelineParams
  onPipelineParamsChange: (params: PipelineParams) => void
  stageStatus: Record<StageKey, StageStatus>
  onRunRoi: () => void
  onRunPreprocess: () => void
  onRunReconstruct: () => void
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
  autoSave,
  onToggleAutoSave,
  onSaveManual,
  onChooseFolder,
  imagesReady,
  isPipelineRunning,
  pipelineError,
  pipelineParams,
  onPipelineParamsChange,
  stageStatus,
  onRunRoi,
  onRunPreprocess,
  onRunReconstruct,
  onRunAll
}) => {
  const [paramsModalOpen, setParamsModalOpen] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [saveKind, setSaveKind] = useState<null | 'epidermis' | 'particle' | 'fiber'>(null)
  const [saveName, setSaveName] = useState('')
  const [saveDir, setSaveDir] = useState<string | null>(null)
  const [tab, setTab] = useState<'samples' | 'layers' | 'algorithm'>('samples')

  const canSaveEpidermis = !!layers.mask
  const canSaveParticle = !!layers.annotation
  const canSaveFiber = imagesReady
  const sampleDir = workDir && activeSample ? `${workDir}/${activeSample}` : null
  const openSave = (kind: 'epidermis' | 'particle' | 'fiber'): void => {
    setSaveKind(kind)
    setSaveName(kind === 'fiber' ? 'fibertrace' : kind)
    setSaveDir(null)
  }
  const saveBase = saveName.trim() || (saveKind === 'fiber' ? 'fibertrace' : (saveKind ?? ''))
  const saveTitle =
    saveKind === 'fiber'
      ? 'Save Fiber'
      : saveKind === 'epidermis'
        ? 'Save Epidermis Mask'
        : 'Save Particle Mask'
  const saveFiles =
    saveKind === 'fiber' ? [`${saveBase}_project.json`, `${saveBase}_mask.png`] : [`${saveBase}.png`]
  const chooseSaveDir = async (): Promise<void> => {
    const dir = await onChooseFolder()
    if (dir) setSaveDir(dir)
  }
  const confirmSave = (): void => {
    if (!saveKind) return
    onSaveManual(saveKind, saveBase, saveDir)
    setSaveKind(null)
  }

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
    {saveKind && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => setSaveKind(null)}
      >
        <div
          className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <Save size={18} className="text-blue-400" />
              <h3 className="text-base font-semibold text-slate-100">{saveTitle}</h3>
            </div>
            <button
              onClick={() => setSaveKind(null)}
              aria-label="Close"
              className="text-slate-300 hover:text-slate-100 p-1 rounded hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Name</label>
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmSave()
                }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Folder</label>
              <button
                onClick={chooseSaveDir}
                className="w-full flex items-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors"
              >
                <FolderOpen size={14} className="text-blue-400" />
                Choose Folder…
              </button>
              <p className="text-sm text-slate-500 break-all" title={saveDir ?? sampleDir ?? ''}>
                {saveDir ?? sampleDir ?? '(no folder selected)'}
              </p>
            </div>
            <p className="text-sm text-slate-500 break-all">
              Saves{' '}
              {saveFiles.map((f) => (
                <span key={f} className="text-slate-300">
                  {f}{' '}
                </span>
              ))}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setSaveKind(null)}
                className="px-3 py-1.5 text-sm text-slate-300 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
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
            { id: 'samples', label: 'Files', icon: <FolderTree size={15} /> },
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
          <button
            onClick={onToggleAutoSave}
            className="w-full flex items-center justify-between gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 rounded transition-colors"
            title={
              autoSave
                ? 'Auto-save on: mask edits and project state are written to disk automatically'
                : 'Auto-save off: nothing is written to disk automatically'
            }
          >
            <span className="flex items-center gap-2 text-slate-200">
              <Save size={14} className={autoSave ? 'text-blue-400' : 'text-slate-500'} />
              Auto-save
            </span>
            {autoSave ? (
              <ToggleRight size={20} className="text-blue-400" />
            ) : (
              <ToggleLeft size={20} className="text-slate-500" />
            )}
          </button>

          {/* Manual save — writes to disk on demand, regardless of auto-save. */}
          <div className="space-y-1.5 pt-1">
            <button
              onClick={() => openSave('epidermis')}
              disabled={!canSaveEpidermis}
              className="w-full flex items-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Save size={14} className="text-blue-400" />
              Save Epidermis Mask
            </button>
            <button
              onClick={() => openSave('particle')}
              disabled={!canSaveParticle}
              className="w-full flex items-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Save size={14} className="text-blue-400" />
              Save Particle Mask
            </button>
            <button
              onClick={() => openSave('fiber')}
              disabled={!canSaveFiber}
              className="w-full flex items-center gap-2 text-sm px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-200 rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Save size={14} className="text-blue-400" />
              Save Fiber
            </button>
          </div>
          {workDir && samples.length > 0 && (
            <p className="text-[11px] text-slate-500">
              {samples.length} file{samples.length === 1 ? '' : 's'}
            </p>
          )}

          {!workDir ? (
            <p className="text-xs text-slate-400 italic">
              Select a working folder to list its files.
            </p>
          ) : samples.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No files found in this folder.</p>
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

        {/* ROI Mask Section — always shown; banner until the ROI stage runs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Region of Interest
            </label>
            {layers.roiMask && (
              <button
                onClick={() => toggleLayer('showRoi')}
                className="text-slate-300 hover:text-white"
              >
                {settings.showRoi ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            )}
          </div>
          {layers.roiMask ? (
            <>
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
            </>
          ) : (
            <NoDataBanner />
          )}
        </div>

        {/* Preprocessed Section — Sato-enhanced fiber map; banner until the Preprocess stage runs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Preprocessed Output
            </label>
            {layers.preprocess && (
              <button
                onClick={() => toggleLayer('showPreprocess')}
                className="text-slate-300 hover:text-white"
              >
                {settings.showPreprocess ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            )}
          </div>
          {layers.preprocess ? (
            <>
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
            </>
          ) : (
            <NoDataBanner />
          )}
        </div>

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

        {/* Reconstruction Result Section — always shown; the graph can be drawn
            manually even without running the pipeline. */}
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
        </div>

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
              Select a file with all three images to run the reconstruction pipeline
            </p>
          ) : null}
        </div>
      )}
    </div>
    </>
  )
}

// Small placeholder shown in a layer section before its pipeline stage has run.
const NoDataBanner: React.FC = () => (
  <p className="text-[11px] text-slate-500 italic bg-slate-800/40 border border-slate-700/50 rounded px-2.5 py-1.5">
    No output yet — run the pipeline to generate this layer.
  </p>
)

// ── Stage stepper ──────────────────────────────────────────────────────────

interface StageListProps {
  imagesReady: boolean
  isPipelineRunning: boolean
  stageStatus: Record<StageKey, StageStatus>
  onRunRoi: () => void
  onRunPreprocess: () => void
  onRunReconstruct: () => void
}

// Count is omitted — it runs automatically (chained after Reconstruct and on
// every graph edit), so it isn't a manual step.
const STAGE_DEFS: { key: StageKey; label: string }[] = [
  { key: 'roi', label: 'Region of Interest' },
  { key: 'preprocess', label: 'Preprocess' },
  { key: 'reconstruct', label: 'Reconstruct' }
]

const StageList: React.FC<StageListProps> = ({
  imagesReady,
  isPipelineRunning,
  stageStatus,
  onRunRoi,
  onRunPreprocess,
  onRunReconstruct
}) => {
  const handlers: Partial<Record<StageKey, () => void>> = {
    roi: onRunRoi,
    preprocess: onRunPreprocess,
    reconstruct: onRunReconstruct
  }

  // A stage's prerequisite is the prior stage being done at least once.
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
