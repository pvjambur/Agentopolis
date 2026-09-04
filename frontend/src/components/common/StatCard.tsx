import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'warning' | 'danger' | 'neutral'

const VARIANT_CLASSES: Record<Variant, { icon: string; border: string; badge: string }> = {
  primary:   { icon: 'text-primary',   border: 'panel-block-sel-primary',   badge: 'badge-pixel-primary' },
  secondary: { icon: 'text-secondary', border: 'panel-block-sel-secondary', badge: 'badge-pixel-secondary' },
  warning:   { icon: 'text-warning',   border: 'border-warning',            badge: 'badge-pixel-warning' },
  danger:    { icon: 'text-danger',    border: 'border-danger',             badge: 'badge-pixel-danger' },
  neutral:   { icon: 'text-zinc-400',  border: '',                          badge: '' },
}

interface StatCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  subtext?: string
  loading?: boolean
  variant?: Variant
  className?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  subtext,
  loading = false,
  variant = 'neutral',
  className,
}: StatCardProps) {
  const v = VARIANT_CLASSES[variant]

  return (
    <div className={cn('panel-block p-5 flex flex-col gap-3', v.border, className)}>
      <div className="flex items-center justify-between">
        <span className="font-body text-xs text-zinc-400 uppercase tracking-wider">{title}</span>
        {Icon && <Icon size={16} className={v.icon} />}
      </div>

      {loading ? (
        <div className="h-8 w-24 rounded bg-zinc-700 animate-pulse" />
      ) : (
        <p className={cn('font-pixel text-2xl font-bold', variant !== 'neutral' ? v.icon : 'text-white')}>
          {value}
        </p>
      )}

      {subtext && (
        <p className="font-body text-xs text-zinc-500">{subtext}</p>
      )}
    </div>
  )
}
