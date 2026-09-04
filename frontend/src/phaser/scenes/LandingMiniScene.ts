import Phaser from 'phaser'
import EasyStar from 'easystarjs'
import { spriteMap, type CharacterType } from '@/data/characterSpriteMap'
import { SpeechBubble } from '@/phaser/entities/SpeechBubble'

const TILE = 16
const MAP_W = 40
const MAP_H = 30
const PLAYER_SPEED = 96
const PROX_PX = 56  // pixels in world space before bubble fires

type Dir = 'left' | 'front' | 'back' | 'right'
const DIRS: readonly Dir[] = ['left', 'front', 'back', 'right']

const BG_TILE_IDS = ['tile_0000', 'tile_0008', 'tile_0016', 'tile_0081', 'tile_0260'] as const

const DEFAULT_CHAR: CharacterType = 'char_A_green_top'

// Same shop layout as MarketplaceScene
const SHOP_ZONES = [
  { tx: 4, ty: 4, tw: 6, th: 6, name: 'Verdure Greens',  hint: 'AI agent secured 23% below asking.' },
  { tx: 28, ty: 4, tw: 6, th: 6, name: 'Fresh Fruits Co', hint: '3 negotiations in progress now.' },
  { tx: 4, ty: 18, tw: 6, th: 6, name: 'Daily Grocery',   hint: 'Last deal: ₹847 · closed in 4 rounds.' },
] as const

function gidToKey(gid: number): string {
  return `tile_${String(gid - 1).padStart(4, '0')}`
}

export class LandingMiniScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private lastDir: Dir = 'front'
  private pathfinder!: EasyStar.js
  private collisionGrid: number[][] = []
  private activeBubbles = new Set<string>()

  constructor() {
    super({ key: 'LandingMiniScene' })
  }

  preload(): void {
    this.load.tilemapTiledJSON('marketplace-mini', '/assets/maps/marketplace.json')

    for (const id of BG_TILE_IDS) {
      this.load.image(id, `/assets/tilesets/kenney-rpg-urban/${id}.png`)
    }

    // Load only the default character sprites (no avatar selection in landing context)
    const dirs = spriteMap[DEFAULT_CHAR]
    for (const [dir, frames] of Object.entries(dirs)) {
      for (const [frame, tileId] of Object.entries(frames)) {
        this.load.image(`${DEFAULT_CHAR}_${dir}_${frame}`, `/assets/tilesets/kenney-rpg-urban/${tileId}.png`)
      }
    }
  }

  create(): void {
    const map = this.make.tilemap({ key: 'marketplace-mini' })
    this.bakeLayer(map, 'Ground', 0)
    this.bakeLayer(map, 'Buildings', 5)

    const colGroup = this.buildCollision(map)

    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)

    this.player = this.physics.add.sprite(20 * TILE + 8, 27 * TILE + 8, `${DEFAULT_CHAR}_front_idle`)
    this.player.setScale(2.5)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, colGroup)

    this.buildAnimations()

    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setZoom(2)

    this.input.on(
      'wheel',
      (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        const z = this.cameras.main.zoom - dy * 0.0015
        this.cameras.main.setZoom(Phaser.Math.Clamp(z, 1, 4))
      },
    )

    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>

    this.pathfinder = new EasyStar.js()
    this.pathfinder.setGrid(this.collisionGrid)
    this.pathfinder.setAcceptableTiles([0])
    this.pathfinder.enableDiagonals()
    this.pathfinder.disableCornerCutting()
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

  private buildCollision(map: Phaser.Tilemaps.Tilemap): Phaser.Physics.Arcade.StaticGroup {
    const layerData = map.getLayer('Collision')
    const group = this.physics.add.staticGroup()
    this.collisionGrid = Array.from({ length: MAP_H }, () => Array<number>(MAP_W).fill(0))

    if (!layerData) return group

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
        body.setDisplaySize(TILE, TILE).setAlpha(0).refreshBody()
      }
    }

    return group
  }

  private buildAnimations(): void {
    for (const dir of DIRS) {
      const key = `${DEFAULT_CHAR}_walk_${dir}`
      if (this.anims.exists(key)) continue
      this.anims.create({
        key,
        frames: [
          { key: `${DEFAULT_CHAR}_${dir}_idle` },
          { key: `${DEFAULT_CHAR}_${dir}_walk_a` },
          { key: `${DEFAULT_CHAR}_${dir}_idle` },
          { key: `${DEFAULT_CHAR}_${dir}_walk_b` },
        ],
        frameRate: 6,
        repeat: -1,
      })
    }
  }

  update(): void {
    if (!this.keys) return

    let vx = 0
    let vy = 0
    let dir: Dir | null = null

    if (this.keys['A']?.isDown)      { vx = -PLAYER_SPEED; dir = 'left' }
    else if (this.keys['D']?.isDown) { vx =  PLAYER_SPEED; dir = 'right' }

    if (this.keys['W']?.isDown)      { vy = -PLAYER_SPEED; dir ??= 'back' }
    else if (this.keys['S']?.isDown) { vy =  PLAYER_SPEED; dir ??= 'front' }

    if (vx !== 0 && vy !== 0) {
      const f = 1 / Math.SQRT2
      vx *= f
      vy *= f
    }

    this.player.setVelocity(vx, vy)

    if (dir !== null) {
      this.lastDir = dir
      this.player.anims.play(`${DEFAULT_CHAR}_walk_${dir}`, true)
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop()
      this.player.setTexture(`${DEFAULT_CHAR}_${this.lastDir}_idle`)
    }

    this.pathfinder.calculate()
    this.checkShopProximity()
  }

  private checkShopProximity(): void {
    for (const shop of SHOP_ZONES) {
      const shopCx = (shop.tx + shop.tw / 2) * TILE
      const shopCy = (shop.ty + shop.th / 2) * TILE
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, shopCx, shopCy)

      if (dist < PROX_PX && !this.activeBubbles.has(shop.name)) {
        this.activeBubbles.add(shop.name)
        new SpeechBubble(this, this.player.x, this.player.y - 48, shop.hint, 'friendly')
        this.time.delayedCall(4000, () => this.activeBubbles.delete(shop.name))
      }
    }
  }
}
