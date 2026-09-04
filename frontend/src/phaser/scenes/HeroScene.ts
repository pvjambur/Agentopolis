import Phaser from 'phaser'
import { spriteMap, type CharacterType } from '@/data/characterSpriteMap'

const TILE = 16
const MAP_W = 40
const MAP_H = 30

const BG_TILE_IDS = ['tile_0000', 'tile_0008', 'tile_0016', 'tile_0081', 'tile_0260'] as const

type Dir = 'left' | 'front' | 'back' | 'right'
const DIRS: readonly Dir[] = ['left', 'front', 'back', 'right']

// Only the 4 chars used by NPCs in this scene
const NPC_CHARS: CharacterType[] = [
  'char_A_green_top',
  'char_B_orange_top',
  'char_C_grey_hair',
  'char_E_purple_top',
]

function gidToKey(gid: number): string {
  return `tile_${String(gid - 1).padStart(4, '0')}`
}

interface NpcDef {
  charType: CharacterType
  x: number
  y: number
  toX?: number
  toY?: number
  duration: number
  startDir: Dir
}

// Patrol paths on walkable tiles in pixel coords
const NPC_DEFS: NpcDef[] = [
  {
    charType: 'char_A_green_top',
    x: 5 * TILE + 8, y: 14 * TILE + 8,
    toX: 35 * TILE + 8,
    duration: 8000,
    startDir: 'right',
  },
  {
    charType: 'char_B_orange_top',
    x: 7 * TILE + 8, y: 10 * TILE + 8,
    toY: 13 * TILE + 8,
    duration: 2600,
    startDir: 'front',
  },
  {
    charType: 'char_E_purple_top',
    x: 31 * TILE + 8, y: 10 * TILE + 8,
    toY: 13 * TILE + 8,
    duration: 2900,
    startDir: 'front',
  },
  {
    charType: 'char_C_grey_hair',
    x: 17 * TILE + 8, y: 27 * TILE + 8,
    toX: 23 * TILE + 8,
    duration: 4200,
    startDir: 'right',
  },
]

export class HeroScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroScene' })
  }

  preload(): void {
    this.load.tilemapTiledJSON('marketplace-hero', '/assets/maps/marketplace.json')

    for (const id of BG_TILE_IDS) {
      this.load.image(id, `/assets/tilesets/kenney-rpg-urban/${id}.png`)
    }

    for (const charType of NPC_CHARS) {
      for (const [dir, frames] of Object.entries(spriteMap[charType])) {
        for (const [frame, tileId] of Object.entries(frames)) {
          const key = `${charType}_${dir}_${frame}`
          if (!this.textures.exists(key)) {
            this.load.image(key, `/assets/tilesets/kenney-rpg-urban/${tileId}.png`)
          }
        }
      }
    }
  }

  create(): void {
    const map = this.make.tilemap({ key: 'marketplace-hero' })
    this.bakeLayer(map, 'Ground', 0)
    this.bakeLayer(map, 'Buildings', 5)

    this.buildAnimations()
    this.spawnNpcs()

    const zoom = 2.0
    this.cameras.main.setZoom(zoom)
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)

    // Center camera on the main path area (y≈14, mid-x)
    const cx = 300
    const cy = 220
    const displayW = this.cameras.main.width / zoom
    const displayH = this.cameras.main.height / zoom
    const scroll = {
      x: cx - displayW / 2,
      y: cy - displayH / 2,
    }
    this.cameras.main.setScroll(scroll.x, scroll.y)

    // Slow ambient drift — tween the scroll object, apply in onUpdate
    this.tweens.add({
      targets: scroll,
      x: scroll.x + 64,
      y: scroll.y + 28,
      duration: 9000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => this.cameras.main.setScroll(scroll.x, scroll.y),
    })
  }

  private bakeLayer(map: Phaser.Tilemaps.Tilemap, layerName: string, depth: number): void {
    const layerData = map.getLayer(layerName)
    if (!layerData) return
    const rt = this.add.renderTexture(0, 0, MAP_W * TILE, MAP_H * TILE)
    rt.setDepth(depth)
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile = layerData.data[y]?.[x]
        if (!tile || tile.index <= 0) continue
        const key = gidToKey(tile.index)
        if (this.textures.exists(key)) rt.draw(key, x * TILE, y * TILE)
      }
    }
  }

  private buildAnimations(): void {
    for (const charType of NPC_CHARS) {
      for (const dir of DIRS) {
        const key = `${charType}_walk_${dir}`
        if (this.anims.exists(key)) continue
        this.anims.create({
          key,
          frames: [
            { key: `${charType}_${dir}_idle` },
            { key: `${charType}_${dir}_walk_a` },
            { key: `${charType}_${dir}_idle` },
            { key: `${charType}_${dir}_walk_b` },
          ],
          frameRate: 6,
          repeat: -1,
        })
      }
    }
  }

  private spawnNpcs(): void {
    for (const def of NPC_DEFS) {
      const npc = this.add.sprite(def.x, def.y, `${def.charType}_${def.startDir}_idle`)
      npc.setDepth(10)
      npc.setScale(2.5)

      const lastPos = { x: def.x, y: def.y }
      const charType = def.charType

      const onUpdate = () => {
        const dx = npc.x - lastPos.x
        const dy = npc.y - lastPos.y
        lastPos.x = npc.x
        lastPos.y = npc.y

        let animDir: Dir | null = null
        if (Math.abs(dx) > 0.15)      animDir = dx > 0 ? 'right' : 'left'
        else if (Math.abs(dy) > 0.15) animDir = dy > 0 ? 'front' : 'back'

        if (animDir) npc.anims.play(`${charType}_walk_${animDir}`, true)
      }

      if (def.toX !== undefined) {
        this.tweens.add({
          targets: npc,
          x: def.toX,
          duration: def.duration,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
          onUpdate,
        })
      } else if (def.toY !== undefined) {
        this.tweens.add({
          targets: npc,
          y: def.toY,
          duration: def.duration,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
          onUpdate,
        })
      }
    }
  }
}
