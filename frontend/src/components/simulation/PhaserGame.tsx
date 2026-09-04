import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { MarketplaceScene, type ShopClickedData } from '@/phaser/scenes/MarketplaceScene'
import { type CharacterType } from '@/data/characterSpriteMap'

export type { ShopClickedData }

interface PhaserGameProps {
  avatarConfig?: { character_type?: CharacterType }
  onShopClicked?: (shop: ShopClickedData) => void
}

export function PhaserGame({ avatarConfig, onShopClicked }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  // Ref so the event handler always sees the latest prop without re-mounting the game
  const onShopClickedRef = useRef(onShopClicked)

  useEffect(() => {
    onShopClickedRef.current = onShopClicked
  }, [onShopClicked])

  useEffect(() => {
    // StrictMode double-invoke guard — game creates exactly once
    if (gameRef.current || !containerRef.current) return

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#2d5a27',
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      // Start with no scenes; add MarketplaceScene with avatarConfig data below
      scene: [],
    }

    gameRef.current = new Phaser.Game(config)

    // Add + start scene with avatar data so init() receives it before preload()
    gameRef.current.scene.add('MarketplaceScene', MarketplaceScene, true, {
      avatarConfig: avatarConfig ?? {},
    })

    // Wire the shop-clicked event bridge once the scene is active
    gameRef.current.events.once('ready', () => {
      const scene = gameRef.current?.scene.getScene('MarketplaceScene')
      if (!scene) return
      scene.events.on('shop-clicked', (data: ShopClickedData) => {
        onShopClickedRef.current?.(data)
      })
    })

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty: game mounts once; avatarConfig prop is forwarded via the scene's init data

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
