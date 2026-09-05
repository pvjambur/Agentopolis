import Phaser from 'phaser'
import EasyStar from 'easystarjs'
import { spriteMap, type CharacterType } from '@/data/characterSpriteMap'
import { SpeechBubble } from '@/phaser/entities/SpeechBubble'

const TILE = 16
const MAP_W = 40
const MAP_H = 30
const PLAYER_SPEED = 96

// Fixed character for the autonomous AI agent sprite (distinct from player)
const AGENT_CHAR: CharacterType = 'char_A_green_top'
// World-pixel home position for the AI agent (bottom-centre of map, near player start)
const AGENT_HOME_X = 18 * TILE + 8
const AGENT_HOME_Y = 27 * TILE + 8

type Dir = 'left' | 'front' | 'back' | 'right'
const DIRS: readonly Dir[] = ['left', 'front', 'back', 'right']

const BG_TILE_IDS = ['tile_0000', 'tile_0008', 'tile_0016', 'tile_0081', 'tile_0260'] as const

const SHOP_ZONES = [
  { tx: 4, ty: 4, tw: 6, th: 6, name: 'Verdure Greens',  domain: 'vegetables' },
  { tx: 28, ty: 4, tw: 6, th: 6, name: 'Fresh Fruits Co', domain: 'fruits' },
  { tx: 4, ty: 18, tw: 6, th: 6, name: 'Daily Grocery',   domain: 'grocery' },
] as const

// World-pixel meeting point just below each shop zone (walkable ground)
const SHOP_MEETING: Record<string, { x: number; y: number }> = {
  'Verdure Greens':  { x: 7  * TILE + 8, y: 11 * TILE + 8 },
  'Fresh Fruits Co': { x: 31 * TILE + 8, y: 11 * TILE + 8 },
  'Daily Grocery':   { x: 7  * TILE + 8, y: 25 * TILE + 8 },
}

function gidToKey(gid: number): string {
  return `tile_${String(gid - 1).padStart(4, '0')}`
}

export interface ShopClickedData {
  name: string
  domain: string
}

// Shape of every WS event forwarded from Simulation.tsx → emitToScene('negotiation-update', …)
interface NegotiationEvent {
  event: string
  shop?: string
  item?: string
  speaker?: 'vendor_agent' | 'consumer_agent'
  message?: string
  emotion?: string
  action?: string
  proposed_price?: number
  outcome?: string
  final_price?: number | null
  round?: number
}

export class MarketplaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private characterType: CharacterType = 'char_A_green_top'
  private lastDir: Dir = 'front'
  private pathfinder!: EasyStar.js
  private collisionGrid: number[][] = []

  // AI agent sprite — spawned on first negotiation_started event
  private agentSprite: Phaser.Physics.Arcade.Sprite | null = null
  private agentLastDir: Dir = 'front'
  private agentWalkTween: Phaser.Tweens.Tween | null = null
  private currentShopName: string | null = null
  private birdsEyeActive = false

  constructor() {
    super({ key: 'MarketplaceScene' })
  }

  init(data: { avatarConfig?: { character_type?: CharacterType } }): void {
    const ct = data?.avatarConfig?.character_type
    this.characterType = ct != null && ct in spriteMap ? ct : 'char_A_green_top'
    this.lastDir = 'front'
    this.collisionGrid = []
    this.agentSprite = null
    this.agentWalkTween = null
    this.currentShopName = null
    this.birdsEyeActive = false
  }

  preload(): void {
    this.load.tilemapTiledJSON('marketplace', '/assets/maps/marketplace.json')

    for (const id of BG_TILE_IDS) {
      this.load.image(id, `/assets/tilesets/kenney-rpg-urban/${id}.png`)
    }

    for (const [charType, dirs] of Object.entries(spriteMap)) {
      for (const [dir, frames] of Object.entries(dirs)) {
        for (const [frame, tileId] of Object.entries(frames)) {
          this.load.image(`${charType}_${dir}_${frame}`, `/assets/tilesets/kenney-rpg-urban/${tileId}.png`)
        }
      }
    }
  }

  create(data: { avatarConfig?: { character_type?: CharacterType } }): void {
    const ct = data?.avatarConfig?.character_type
    if (ct != null && ct in spriteMap) this.characterType = ct

    const map = this.make.tilemap({ key: 'marketplace' })

    this.bakeLayer(map, 'Ground', 0)
    this.bakeLayer(map, 'Buildings', 5)

    const colGroup = this.buildCollision(map)

    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)

    const initTexture = `${this.characterType}_front_idle`
    this.player = this.physics.add.sprite(20 * TILE + 8, 27 * TILE + 8, initTexture)
    this.player.setScale(2.5)
    this.player.setDepth(10)
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, colGroup)

    this.buildAllAnimations()

    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setZoom(this.followZoom())

    this.input.on(
      'wheel',
      (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        // Manual wheel zoom never goes below the "cover" zoom, so scrolling out
        // can never reveal void beyond the map edges. The Bird's-Eye button is a
        // separate deliberate framed state that can go below this floor.
        const z = this.cameras.main.zoom - dy * 0.0015
        const coverZoom = this.coverZoom()
        this.cameras.main.setZoom(Phaser.Math.Clamp(z, coverZoom, 4))
        // Scrolling exits bird's-eye framing and resumes following the player.
        if (this.birdsEyeActive) this.followPlayer()
      },
    )

    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>

    this.setupPathfinder()
    this.setupShopZones()

    // Bridge from React: Simulation.tsx calls phaserRef.emitToScene('negotiation-update', wsEvent)
    this.events.on('negotiation-update', (evt: NegotiationEvent) => {
      this.handleNegotiationEvent(evt)
    })

    // Camera control bridge from the React HUD buttons
    this.events.on('camera-birds-eye', () => this.snapToBirdsEye())
    this.events.on('camera-follow-player', () => this.followPlayer())
  }

  // ----- camera modes (bird's-eye / follow) -----

  /** Zoom at which the map exactly covers the viewport (no void visible). */
  private coverZoom(): number {
    const cam = this.cameras.main
    return Math.max(cam.width / (MAP_W * TILE), cam.height / (MAP_H * TILE))
  }

  /** Normal follow-cam zoom — never below coverZoom so play never shows void. */
  private followZoom(): number {
    return Math.max(2, this.coverZoom())
  }

  /** Smoothly frame the entire 40×30 map, centered, releasing follow-cam. */
  snapToBirdsEye(): void {
    const cam = this.cameras.main
    const mapW = MAP_W * TILE
    const mapH = MAP_H * TILE
    // 0.9 padding so the map doesn't touch the viewport edges.
    const targetZoom = Math.min(cam.width / mapW, cam.height / mapH) * 0.9

    this.birdsEyeActive = true
    cam.stopFollow()
    this.tweens.add({
      targets: cam,
      zoom: targetZoom,
      duration: 600,
      ease: 'Cubic.easeInOut',
    })
    cam.pan(mapW / 2, mapH / 2, 600, 'Cubic.easeInOut')
    this.events.emit('camera-mode-changed', 'birds-eye')
  }

  /** Smoothly return to normal follow-cam (not an instant cut). */
  followPlayer(): void {
    const cam = this.cameras.main
    this.birdsEyeActive = false
    this.tweens.add({
      targets: cam,
      zoom: this.followZoom(),
      duration: 600,
      ease: 'Cubic.easeInOut',
      onComplete: () => cam.startFollow(this.player, true, 0.08, 0.08),
    })
    // Pan toward the player during the zoom so re-acquiring follow isn't a jump.
    cam.pan(this.player.x, this.player.y, 600, 'Cubic.easeInOut')
    this.events.emit('camera-mode-changed', 'follow')
  }

  // ----- negotiation event handling -----

  private handleNegotiationEvent(evt: NegotiationEvent): void {
    switch (evt.event) {
      case 'negotiation_started':
        this.currentShopName = evt.shop ?? null
        this.ensureAgentSprite()
        if (evt.shop && SHOP_MEETING[evt.shop]) {
          this.walkAgentTo(SHOP_MEETING[evt.shop].x, SHOP_MEETING[evt.shop].y)
        }
        break

      case 'negotiation_round':
        this.ensureAgentSprite()
        if (!evt.message) break
        if (evt.speaker === 'vendor_agent' && this.currentShopName) {
          // Vendor speaks from the shop zone
          const meet = SHOP_MEETING[this.currentShopName]
          const bx = meet ? meet.x : this.agentSprite?.x ?? MAP_W * TILE / 2
          const by = meet ? meet.y - 40 : (this.agentSprite?.y ?? 200) - 40
          this.showBubble(bx, by, evt.message, evt.emotion ?? 'neutral')
        } else if (evt.speaker === 'consumer_agent' && this.agentSprite) {
          this.showBubble(
            this.agentSprite.x,
            this.agentSprite.y - 40,
            evt.message,
            evt.emotion ?? 'neutral',
          )
        }
        break

      case 'negotiation_complete':
        if (evt.outcome === 'deal' && evt.final_price != null && this.agentSprite) {
          this.showBubble(
            this.agentSprite.x,
            this.agentSprite.y - 40,
            `Deal! ₹${evt.final_price}`,
            'happy',
          )
        } else if (evt.outcome === 'walked_away' || evt.outcome === 'no_deal') {
          if (this.agentSprite) {
            this.showBubble(
              this.agentSprite.x,
              this.agentSprite.y - 40,
              'No deal here…',
              'frustrated',
            )
          }
        }
        break

      case 'mission_complete':
        // Walk agent back to home position after all items are done
        this.time.delayedCall(1500, () => {
          this.walkAgentTo(AGENT_HOME_X, AGENT_HOME_Y, () => {
            this.agentSprite?.setTexture(`${AGENT_CHAR}_front_idle`)
          })
        })
        break
    }
  }

  // ----- agent sprite -----

  private ensureAgentSprite(): void {
    if (this.agentSprite) return

    this.agentSprite = this.physics.add.sprite(
      AGENT_HOME_X,
      AGENT_HOME_Y,
      `${AGENT_CHAR}_front_idle`,
    )
    this.agentSprite.setScale(2.5)
    this.agentSprite.setDepth(11)
    // Slight blue tint to visually distinguish the AI agent from the player
    this.agentSprite.setTint(0xaaddff)
  }

  private walkAgentTo(targetX: number, targetY: number, onArrival?: () => void): void {
    if (!this.agentSprite) return

    // Cancel any in-progress walk
    if (this.agentWalkTween) {
      this.agentWalkTween.stop()
      this.agentWalkTween = null
    }

    const dx = targetX - this.agentSprite.x
    const dy = targetY - this.agentSprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 4) {
      onArrival?.()
      return
    }

    // Determine walk direction from dominant axis
    const dir: Dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'front' : 'back')

    this.agentLastDir = dir
    this.agentSprite.anims.play(`${AGENT_CHAR}_walk_${dir}`, true)

    // ms-per-pixel walk speed ≈ PLAYER_SPEED tiles/sec
    const duration = (dist / PLAYER_SPEED) * 1000

    this.agentWalkTween = this.tweens.add({
      targets: this.agentSprite,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Linear',
      onComplete: () => {
        this.agentWalkTween = null
        this.agentSprite?.anims.stop()
        this.agentSprite?.setTexture(`${AGENT_CHAR}_${dir}_idle`)
        onArrival?.()
      },
    })
  }

  // ----- speech bubble -----

  private showBubble(x: number, y: number, text: string, emotion: string): void {
    const bubble = new SpeechBubble(this, x, y, text, emotion)
    bubble.setDepth(50)
  }

  // ----- private helpers (unchanged from Phase 1) -----

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

    this.pathfinder.calculate()
  }
}
