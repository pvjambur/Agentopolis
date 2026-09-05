import { AlertTriangle } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Failed to load data. Check your connection and try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="panel-block flex flex-col items-center justify-center gap-5 py-14 px-8 text-center">
      <div className="w-16 h-16 rounded-md border-2 border-red-800 flex items-center justify-center bg-red-900/20">
        <AlertTriangle size={28} className="text-red-400" />
      </div>
      <div className="space-y-2 max-w-xs">
        <h3 className="font-pixel text-base font-bold text-white">{title}</h3>
        <p className="font-body text-sm text-zinc-400 leading-relaxed">{description}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-pixel btn-pixel-md btn-pixel-neutral">
          Try again
        </button>
      )}
    </div>
  )
}
