import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Sword, Users, Zap } from 'lucide-react'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { useCreateMission } from '@/hooks/useMission'
import { usePageTitle } from '@/hooks/usePageTitle'

const EXAMPLE_INSTRUCTIONS = [
  'Buy 2 kg apples and 1 kg oranges. Budget ₹350.',
  'Get fresh vegetables — tomatoes, spinach, and onions. Budget ₹200.',
  'Grocery run: rice (2 kg), lentils (1 kg), and cooking oil. Budget ₹500.',
]

function MissionNewInner() {
  usePageTitle('New Mission')
  const navigate = useNavigate()
  const createMission = useCreateMission()
  // Pre-select swarm mode if linked from Hub's "Swarm Mission" button
  const search = useSearch({ strict: false }) as Record<string, string>
  const [instruction, setInstruction] = useState('')
  const [budget, setBudget] = useState('')
  const [mode, setMode] = useState<'single' | 'swarm'>(search.swarm === '1' ? 'swarm' : 'single')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!instruction.trim()) {
      setError('Shopping instructions are required.')
      return
    }
    try {
      const result = await createMission.mutateAsync({
        instruction_text: instruction.trim(),
        budget: budget ? parseFloat(budget) : undefined,
        mode,
      })
      navigate({
        to: '/consumer/simulation',
        search: { mission_id: result.mission_id },
      })
    } catch {
      setError('Failed to start mission. Is the backend running?')
    }
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[#1A1A1A] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="panel-block p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-7">
            <div className="w-10 h-10 rounded-sm border-2 border-primary bg-primary/10 flex items-center justify-center shrink-0">
              <Sword size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="font-pixel text-lg text-white leading-tight">New Mission</h1>
              <p className="font-body text-xs text-zinc-400 mt-0.5">
                Your agent will negotiate the best prices automatically
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Mode selector */}
            <div>
              <label className="font-pixel text-[11px] text-zinc-300 uppercase tracking-wide block mb-2">
                Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['single', 'swarm'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`panel-block p-3 flex items-center gap-2 transition-colors ${
                      mode === m ? 'border-primary bg-primary/10' : 'hover:border-zinc-600'
                    }`}
                  >
                    {m === 'single' ? <Users size={14} className="text-primary" /> : <Zap size={14} className="text-secondary" />}
                    <div className="text-left">
                      <p className="font-pixel text-[11px] text-white capitalize">{m}</p>
                      <p className="font-body text-[10px] text-zinc-500">
                        {m === 'single' ? 'One agent, all items' : 'Parallel scouts per domain'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Shopping instruction */}
            <div>
              <label className="font-pixel text-[11px] text-zinc-300 uppercase tracking-wide block mb-2">
                Shopping Instructions
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                placeholder="e.g. Buy 2 kg apples and 1 kg oranges. Budget ₹350."
                className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary resize-none"
              />
              {/* Quick examples */}
              <div className="mt-2 flex flex-col gap-1">
                {EXAMPLE_INSTRUCTIONS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setInstruction(ex)}
                    className="text-left font-body text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors truncate"
                  >
                    ↳ {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget override */}
            <div>
              <label className="font-pixel text-[11px] text-zinc-300 uppercase tracking-wide block mb-2">
                Budget (₹) — optional
              </label>
              <p className="font-body text-[11px] text-zinc-500 mb-2">
                Overrides any budget mentioned in the instructions. Leave blank to use the
                amount stated in the text above.
              </p>
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm text-zinc-400">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="350"
                  className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm pl-7 pr-3 py-2 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {error && (
              <p className="font-body text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-sm px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={createMission.isPending || !instruction.trim()}
              className="btn-pixel btn-pixel-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMission.isPending ? 'Dispatching Agent…' : 'Start Mission'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function MissionNewPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <MissionNewInner />
    </ProtectedRoute>
  )
}
