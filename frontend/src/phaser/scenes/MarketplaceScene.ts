import Phaser from 'phaser'
import EasyStar from 'easystarjs'
import { spriteMap, type CharacterType } from '@/data/characterSpriteMap'

const TILE = 16
const MAP_W = 40
const MAP_H = 30
const PLAYER_SPEED = 96

type Dir = 'left' | 'front' | 'back' | 'right'
const DIRS: readonly Dir[] = ['left', 'front', 'back', 'right']

const BG_TILE_IDS = ['tile_0000', 'tile_0008', 'tile_0016', 'tile_0081', 'tile_0260'] as const

// Shops: tile-space position and metadata
const SHOP_ZONES = [
  { tx: 4, ty: 4, tw: 6, th: 6, name: 'Verdure Greens',  domain: 'vegetables' },
  { tx: 28, ty: 4, tw: 6, th: 6, name: 'Fresh Fruits Co', domain: 'fruits' },
  { tx: 4, ty: 18, tw: 6, th: 6, name: 'Daily Grocery',   domain: 'grocery' },
] as const

// GID (1-based, from Tiled JSON) → texture key loaded in preload()
function gidToKey(gid: number): string {
  return `tile_${String(gid - 1).padStart(4, '0')}`
}

export interface ShopClickedData {
  name: string
  domain: string
}

export class MarketplaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private characterType: CharacterType = 'char_A_green_top'
  private lastDir: Dir = 'front'
  private pathfinder!: EasyStar.js
  private collisionGrid: number[][] = []

  constructor() {
    super({ key: 'MarketplaceScene' })
  }

  init(data: { avatarConfig?: { character_type?: CharacterType } }): void {
    const ct = data?.avatarConfig?.character_type
    this.characterType = ct != null && ct in spriteMap ? ct : 'char_A_green_top'
    this.lastDir = 'front'
    this.collisionGrid = []
  }

  preload(): void {
    this.load.tilemapTiledJSON('marketplace', '/assets/maps/marketplace.json')

    // Background tiles — only the 5 tiles actually placed on the map
    for (const id of BG_TILE_IDS) {
      this.load.image(id, `/assets/tilesets/kenney-rpg-urban/${id}.png`)
    }

    // Character sprites: 6 chars × 4 dirs × 3 frames = 72 individual 16×16 PNGs
    for (const [charType, dirs] of Object.entries(spriteMap)) {
      for (const [dir, frames] of Object.entries(dirs)) {
        for (const [frame, tileId] of Object.entries(frames)) {
          this.load.image(`${charType}_${dir}_${frame}`, `/assets/tilesets/kenney-rpg-urban/${tileId}.png`)
        }
      }
    }
  }

  create(data: { avatarConfig?: { character_type?: CharacterType } }): void {
    // Re-apply from data in case init() wasn't called (scene restart edge case)
    const ct = data?.avatarConfig?.character_type
    if (ct != null && ct in spriteMap) this.characterType = ct

    const map = this.make.tilemap({ key: 'marketplace' })

    // Bake ground and buildings visually into RenderTextures — avoids needing a spritesheet
    this.bakeLayer(map, 'Ground', 0)
    this.bakeLayer(map, 'Buildings', 5)

    // Build collision static group from the Collision layer + fill collisionGrid for easystarjs
    const colGroup = this.buildCollision(map)

    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)

    // Player
    const initTexture = `${this.characterType}_front_idle`
    this.player = this.physics.add.sprite(20 * TILE + 8, 27 * TILE + 8, initTexture)
    this.player.setScale(2.5)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, colGroup)

    this.buildAllAnimations()

    // Camera
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setZoom(2)

    // Pinch-to-zoom via scroll wheel
    this.input.on(
      'wheel',
      (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        const z = this.cameras.main.zoom - dy * 0.0015
        this.cameras.main.setZoom(Phaser.Math.Clamp(z, 1, 4))
      },
    )

    // WASD movement keys
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>

    // Easystar pathfinding grid — ready for Phase 3 agent movement
    this.setupPathfinder()

    // Shop clickable zones
    this.setupShopZones()
  }

  // ----- private helpers -----

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
        if (this.textures.exists(key)) {
          rt.draw(key, x * TILE, y * TILE)
        }
      }
    }
  }

  private buildCollision(map: Phaser.Tilemaps.Tilemap): Phaser.Physics.Arcade.StaticGroup {
    const layerData = map.getLayer('Collision')
    const group = this.physics.add.staticGroup()

    this.collisionGrid = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(0))

    if (!layerData) return group

    // Create a minimal reusable texture for invisible physics bodies
    if (!this.textures.exists('__pixel')) {
      const gfx = this.make.graphics({ add: false })
      gfx.fillStyle(0xffffff, 1)
      gfx.fillRect(0, 0, 1, 1)
      gfx.generateTexture('__pixel', 1, 1)
      gfx.destroy()
    }

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile = layerData.data[y]?.[x]
        if (!tile || tile.index <= 0) continue

        this.collisionGrid[y][x] = 1

        const body = group.create(
          x * TILE + TILE / 2,
          y * TILE + TILE / 2,
          '__pixel',
        ) as Phaser.Physics.Arcade.Image
        body.setDisplaySize(TILE, TILE)
        body.setAlpha(0)
        body.refreshBody()
      }
    }

    return group
  }

  private setupPathfinder(): void {
    this.pathfinder = new EasyStar.js()
    this.pathfinder.setGrid(this.collisionGrid)
    this.pathfinder.setAcceptableTiles([0])
    this.pathfinder.enableDiagonals()
    this.pathfinder.disableCornerCutting()
  }

  private buildAllAnimations(): void {
    for (const [charType] of Object.entries(spriteMap)) {
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

  private setupShopZones(): void {
    for (const shop of SHOP_ZONES) {
      const px = shop.tx * TILE + (shop.tw * TILE) / 2
      const py = shop.ty * TILE + (shop.th * TILE) / 2
      const zone = this.add.zone(px, py, shop.tw * TILE, shop.th * TILE)
      zone.setDepth(20)
      zone.setInteractive({ cursor: 'pointer' })
      zone.on('pointerdown', () => {
        this.events.emit('shop-clicked', { name: shop.name, domain: shop.domain } satisfies ShopClickedData)
      })
    }
  }

  // ----- game loop -----

  update(): void {
    if (!this.keys) return

    let vx = 0
    let vy = 0
    let dir: Dir | null = null

    if (this.keys['A']?.isDown)      { vx = -PLAYER_SPEED; dir = 'left' }
    else if (this.keys['D']?.isDown) { vx =  PLAYER_SPEED; dir = 'right' }

    if (this.keys['W']?.isDown)      { vy = -PLAYER_SPEED; dir ??= 'back' }
    else if (this.keys['S']?.isDown) { vy =  PLAYER_SPEED; dir ??= 'front' }

    // Normalise diagonal velocity
    if (vx !== 0 && vy !== 0) {
      const f = 1 / Math.SQRT2
      vx *= f
      vy *= f
    }

    this.player.setVelocity(vx, vy)

    if (dir !== null) {
      this.lastDir = dir
      this.player.anims.play(`${this.characterType}_walk_${dir}`, true)
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop()
      this.player.setTexture(`${this.characterType}_${this.lastDir}_idle`)
    }

    // Tick easystarjs (required to process async pathfinding callbacks)
    this.pathfinder.calculate()
  }
}
