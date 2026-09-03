import { type CharacterType, frontIdleUrl } from '@/data/characterSpriteMap'

interface Props {
  characterType: CharacterType
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_PX: Record<NonNullable<Props['size']>, number> = {
  sm: 24,
  md: 32,
  lg: 48,
}

export function AvatarBadge({ characterType, size = 'md', className = '' }: Props) {
  const px = SIZE_PX[size]
  return (
    <img
      src={frontIdleUrl(characterType)}
      alt={characterType}
      width={px}
      height={px}
      style={{ imageRendering: 'pixelated' }}
      className={`inline-block shrink-0 ${className}`}
      draggable={false}
    />
  )
}
