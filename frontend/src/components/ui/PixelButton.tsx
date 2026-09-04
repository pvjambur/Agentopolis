import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, disabled, className, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn('btn-pixel', `btn-pixel-${size}`, `btn-pixel-${variant}`, className)}
        {...rest}
      >
        {loading ? 'Loading…' : children}
      </button>
    )
  }
)
PixelButton.displayName = 'PixelButton'
