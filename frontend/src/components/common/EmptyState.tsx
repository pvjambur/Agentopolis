import { type LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

interface Action {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: Action
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const variant = action?.variant ?? 'primary'

  return (
    <div className="panel-block flex flex-col items-center justify-center gap-5 py-14 px-8 text-center">
      <div className="w-16 h-16 rounded-md border-2 border-accent flex items-center justify-center bg-accent/10">
        <Icon size={32} className="text-accent" />
      </div>

      <div className="space-y-2 max-w-xs">
        <h3 className="font-pixel text-lg font-bold text-white">{title}</h3>
        <p className="font-body text-sm text-zinc-400 leading-relaxed">{description}</p>
      </div>

      {action && (
        action.href ? (
          <Link to={action.href} className={`btn-pixel btn-pixel-md btn-pixel-${variant}`}>
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className={`btn-pixel btn-pixel-md btn-pixel-${variant}`}>
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
