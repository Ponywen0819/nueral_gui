import React, { useEffect } from 'react'
import { X, Sliders, RotateCcw } from 'lucide-react'
import { PipelineParams, DEFAULT_PIPELINE_PARAMS } from '../types'

interface PipelineParamsModalProps {
  open: boolean
  onClose: () => void
  params: PipelineParams
  onChange: (next: PipelineParams) => void
}

type FieldKey = Exclude<keyof PipelineParams, 'connectivity'>

interface FieldSpec {
  key: FieldKey
  label: string
  hint: string
  step: number
  min?: number
  max?: number
  integer?: boolean
}

const PREPROCESSING_FIELDS: FieldSpec[] = [
  {
    key: 'offset_px',
    label: 'Epidermis Offset (px)',
    hint: 'Vertical dilation applied to the epidermis mask.',
    step: 1,
    min: 0,
    integer: true
  },
  {
    key: 'bg_kernel_size',
    label: 'Background Kernel',
    hint: 'Morphological opening kernel for background removal.',
    step: 2,
    min: 0,
    integer: true
  },
  {
    key: 'clahe_clip',
    label: 'CLAHE Clip Limit',
    hint: 'Higher = more contrast enhancement.',
    step: 0.5,
    min: 0
  },
  {
    key: 'clahe_grid_size',
    label: 'CLAHE Grid Size',
    hint: 'Side length of the square tile grid. Larger tiles preserve more global contrast.',
    step: 1,
    min: 1,
    integer: true
  },
  {
    key: 'sato_sigmas_start',
    label: 'Sato σ Start',
    hint: 'Smallest fiber width to detect.',
    step: 1,
    min: 1,
    integer: true
  },
  {
    key: 'sato_sigmas_stop',
    label: 'Sato σ Stop',
    hint: 'Stop bound (exclusive). Larger = wider fibers.',
    step: 1,
    min: 2,
    integer: true
  }
]

const PATHFINDING_FIELDS: FieldSpec[] = [
  {
    key: 'prune_threshold',
    label: 'Prune Threshold',
    hint: 'Drop component connections with cost above this.',
    step: 0.5,
    min: 0
  }
]

const POSTPROCESSING_FIELDS: FieldSpec[] = [
  {
    key: 'min_tree_components',
    label: 'Min Tree Components',
    hint: 'Subtrees must cover ≥ this many annotation components.',
    step: 1,
    min: 1,
    integer: true
  },
  {
    key: 'stub_length_threshold',
    label: 'Stub Length',
    hint: 'Skeleton stubs shorter than this are pruned.',
    step: 1,
    min: 1,
    integer: true
  }
]

export const PipelineParamsModal: React.FC<PipelineParamsModalProps> = ({
  open,
  onClose,
  params,
  onChange
}) => {
  // Close on ESC.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const setField = (key: FieldKey, value: number) => {
    onChange({ ...params, [key]: value })
  }

  const setConnectivity = (value: 4 | 8) => {
    onChange({ ...params, connectivity: value })
  }

  const renderField = (spec: FieldSpec) => {
    const value = params[spec.key]
    const parse = spec.integer ? parseInt : parseFloat
    return (
      <div key={spec.key} className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span title={spec.hint}>{spec.label}</span>
          <span>{value}</span>
        </div>
        <input
          type="number"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          onChange={(e) => {
            const parsed = parse(e.target.value)
            if (Number.isFinite(parsed)) setField(spec.key, parsed)
          }}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-lg">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-indigo-400" />
            <h3 className="text-base font-semibold text-slate-100">Pipeline Parameters</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChange(DEFAULT_PIPELINE_PARAMS)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded px-2.5 py-1 transition-colors"
            >
              <RotateCcw size={12} />
              Reset
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {/* Preprocessing */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Preprocessing
              </h4>
              {PREPROCESSING_FIELDS.map(renderField)}
            </section>

            {/* Right column: Pathfinding + Postprocessing */}
            <div className="space-y-5">
              <section className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Pathfinding
                </h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span title="Neighbour count for multi-source Dijkstra.">Connectivity</span>
                    <span>{params.connectivity}</span>
                  </div>
                  <select
                    value={params.connectivity}
                    onChange={(e) => setConnectivity(parseInt(e.target.value) as 4 | 8)}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={4}>4-connected</option>
                    <option value={8}>8-connected</option>
                  </select>
                </div>
                {PATHFINDING_FIELDS.map(renderField)}
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Postprocessing
                </h4>
                {POSTPROCESSING_FIELDS.map(renderField)}
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-800/50 rounded-b-lg flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
