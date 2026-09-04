import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'dark' | 'light'
  selected?: boolean
  selectedVariant?: 'primary' | 'secondary'
}

export function Panel({
  variant = 'dark',
  selected,
  selectedVariant = 'primary',
  children,
  className,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        variant === 'dark' ? 'panel-block' : 'panel-block-light',
        selected && `panel-block-sel-${selectedVariant}`,
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
