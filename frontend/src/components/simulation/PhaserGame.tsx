import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import Phaser from 'phaser'
import { MarketplaceScene, type ShopClickedData } from '@/phaser/scenes/MarketplaceScene'
import { type CharacterType } from '@/data/characterSpriteMap'

export type { ShopClickedData }

export interface PhaserGameHandle {
  /** Emit an event directly into the MarketplaceScene event bus. */
  emitToScene: (event: string, data?: unknown) => void
  /** Smoothly frame the whole map, releasing follow-cam. */
  birdsEye: () => void
  /** Smoothly return to normal follow-cam. */
  followPlayer: () => void
}

interface PhaserGameProps {
  avatarConfig?: { character_type?: CharacterType }
  onShopClicked?: (shop: ShopClickedData) => void
}

export const PhaserGame = forwardRef<PhaserGameHandle, PhaserGameProps>(
  ({ avatarConfig, onShopClicked }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const gameRef = useRef<Phaser.Game | null>(null)
    const onShopClickedRef = useRef(onShopClicked)

    useEffect(() => {
      onShopClickedRef.current = onShopClicked
    }, [onShopClicked])

    useImperativeHandle(ref, () => {
      const emit = (event: string, data?: unknown) => {
        const scene = gameRef.current?.scene.getScene('MarketplaceScene')
        if (scene) scene.events.emit(event, data)
      }
      return {
        emitToScene: emit,
        birdsEye: () => emit('camera-birds-eye'),
        followPlayer: () => emit('camera-follow-player'),
      }
    })

    useEffect(() => {
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
        scene: [],
      }

      gameRef.current = new Phaser.Game(config)

      gameRef.current.scene.add('MarketplaceScene', MarketplaceScene, true, {
        avatarConfig: avatarConfig ?? {},
      })

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
    }, [])

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  },
)

PhaserGame.displayName = 'PhaserGame'
