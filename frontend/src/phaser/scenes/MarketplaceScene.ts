import Phaser from 'phaser'
import EasyStar from 'easystarjs'
import { spriteMap, type CharacterType } from '@/data/characterSpriteMap'
import { SpeechBubble } from '@/phaser/entities/SpeechBubble'

const TILE = 16
const MAP_W = 40
const MAP_H = 30
const PLAYER_SPEED = 96

// The default agent character (main consumer scout)
const AGENT_CHAR: CharacterType = 'char_A_green_top'
const AGENT_HOME_X = 18 * TILE + 8
const AGENT_HOME_Y = 27 * TILE + 8

// Scout characters per domain — visually distinct from main agent
const SCOUT_CHARS: Record<string, CharacterType> = {
  vegetables:  'char_B_blue_top',
  fruits:      'char_C_red_top',
  grocery:     'char_A_green_top',  // fallback; tint differentiates
  pharma:      'char_B_blue_top',
  electronics: 'char_C_red_top',
  furniture:   'char_A_green_top',
  bakery:      'char_B_blue_top',
}

// Domain tints (ARGB hex ints) so scouts are colour-coded even if same char
const SCOUT_TINTS: Record<string, number> = {
  vegetables:  0x90ee90,
  fruits:      0xff9090,
  grocery:     0xffd700,
  pharma:      0xadd8e6,
  electronics: 0xda70d6,
  furniture:   0xffa07a,
  bakery:      0xdeb887,
}

// Queue slot offset per waiting position (agents line up to the left, 28px apart)
const QUEUE_OFFSET_X = -28

type Dir = 'left' | 'front' | 'back' | 'right'
const DIRS: readonly Dir[] = ['left', 'front', 'back', 'right']

const BG_TILE_IDS = ['tile_0000', 'tile_0008', 'tile_0016', 'tile_0081', 'tile_0260'] as const

const SHOP_ZONES = [
  { tx: 4,  ty: 4,  tw: 6, th: 6, name: 'Verdure Greens',  domain: 'vegetables' },
  { tx: 28, ty: 4,  tw: 6, th: 6, name: 'Fresh Fruits Co', domain: 'fruits'     },
  { tx: 4,  ty: 18, tw: 6, th: 6, name: 'Daily Grocery',   domain: 'grocery'    },
] as const

const SHOP_MEETING: Record<string, { x: number; y: number }> = {
  'Verdure Greens':  { x: 7  * TILE + 8, y: 11 * TILE + 8 },
  'Fresh Fruits Co': { x: 31 * TILE + 8, y: 11 * TILE + 8 },
  'Daily Grocery':   { x: 7  * TILE + 8, y: 25 * TILE + 8 },
}

type AgentState = 'idle' | 'walking' | 'queued' | 'negotiating' | 'deal' | 'walked_away' | 'carrying'

const STATE_ICON: Record<AgentState, string> = {
  idle:        '',
  walking:     '🔍',
  queued:      '⏳',
  negotiating: '💬',
  deal:        '✅',
  walked_away: '❌',
  carrying:    '🧺',
}

interface AgentData {
  sprite: Phaser.Physics.Arcade.Sprite
  statusText: Phaser.GameObjects.Text
  agentId: string
  agentType: 'consumer' | 'scout'
  domain?: string
  charType: CharacterType
  state: AgentState
  currentShop: string | null
  basket: { item: string; shop: string; price: number }[]
  lastDir: Dir
  walkTween: Phaser.Tweens.Tween | null
}

function gidToKey(gid: number): string {
  return `tile_${String(gid - 1).padStart(4, '0')}`
}

export interface ShopClickedData {
  name: string
  domain: string
}

export interface AgentClickedData {
  agentId: string
  agentType: 'consumer' | 'scout'
  domain?: string
  state: AgentState
  currentShop: string | null
  basket: { item: string; shop: string; price: number }[]
}

interface NegotiationEvent {
  event: string
  agent_id?: string
  domain?: string
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
  amount?: number
}

export class MarketplaceScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private characterType: CharacterType = 'char_A_green_top'
  private lastDir: Dir = 'front'
  private pathfinder!: EasyStar.js
  private collisionGrid: number[][] = []
  private birdsEyeActive = false

  // Multi-agent management
  private agents: Map<string, AgentData> = new Map()
  // Per-shop ordered queue: [0] = currently negotiating, [1..] = waiting
  private shopQueues: Map<string, string[]> = new Map()

  constructor() {
    super({ key: 'MarketplaceScene' })
  }

  init(data: { avatarConfig?: { character_type?: CharacterType } }): void {
    const ct = data?.avatarConfig?.character_type
    this.characterType = ct != null && ct in spriteMap ? ct : 'char_A_green_top'
    this.lastDir = 'front'
    this.collisionGrid = []
    this.agents = new Map()
    this.shopQueues = new Map()
    this.birdsEyeActive = false
  }

  preload(): void {
    this.load.tilemapTiledJSON('marketplace', '/assets/maps/marketplace.json')
    for (const id of BG_TILE_IDS) {
      this.load.image(id, `/assets/tilesets/kenney-rpg-urban/${id}.png`)
    }
    for (const [charType, dirs] of Object.entries(spriteMap)) {
      for (const [dir, frames] of Object.entries(dirs)) {
        for (const [, tileId] of Object.entries(frames)) {
          this.load.image(`${charType}_${dir}_${(Object.entries(frames).find(([, v]) => v === tileId)?.[0])}`, `/assets/tilesets/kenney-rpg-urban/${tileId}.png`)
        }
      }
    }
    // Re-register correctly keyed
    for (const [charType, dirs] of Object.entries(spriteMap)) {
      for (const [dir, frames] of Object.entries(dirs)) {
        for (const [frameName, tileId] of Object.entries(frames)) {
          this.load.image(`${charType}_${dir}_${frameName}`, `/assets/tilesets/kenney-rpg-urban/${tileId}.png`)
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
        const z = this.cameras.main.zoom - dy * 0.0015
        const coverZoom = this.coverZoom()
        this.cameras.main.setZoom(Phaser.Math.Clamp(z, coverZoom, 4))
        if (this.birdsEyeActive) this.followPlayer()
      },
    )

    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.setupPathfinder()
    this.setupShopZones()

    this.events.on('negotiation-update', (evt: NegotiationEvent) => {
      this.handleNegotiationEvent(evt)
    })
    this.events.on('camera-birds-eye', () => this.snapToBirdsEye())
    this.events.on('camera-follow-player', () => this.followPlayer())
  }

  // ── Camera ────────────────────────────────────────────────────────────────────

  private coverZoom(): number {
    const cam = this.cameras.main
    return Math.max(cam.width / (MAP_W * TILE), cam.height / (MAP_H * TILE))
  }

  private followZoom(): number {
    return Math.max(2, this.coverZoom())
  }

  snapToBirdsEye(): void {
    const cam = this.cameras.main
    const mapW = MAP_W * TILE
    const mapH = MAP_H * TILE
    const targetZoom = Math.min(cam.width / mapW, cam.height / mapH) * 0.9
    this.birdsEyeActive = true
    cam.stopFollow()
    this.tweens.add({ targets: cam, zoom: targetZoom, duration: 600, ease: 'Cubic.easeInOut' })
    cam.pan(mapW / 2, mapH / 2, 600, 'Cubic.easeInOut')
    this.events.emit('camera-mode-changed', 'birds-eye')
  }

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
    cam.pan(this.player.x, this.player.y, 600, 'Cubic.easeInOut')
    this.events.emit('camera-mode-changed', 'follow')
  }

  // ── Agent management ──────────────────────────────────────────────────────────

  /** Creates or returns the agent sprite for the given agentId. */
  private ensureAgent(agentId: string, agentType: 'consumer' | 'scout', domain?: string): AgentData {
    if (this.agents.has(agentId)) return this.agents.get(agentId)!

    const charType: CharacterType = agentType === 'scout' && domain
      ? (SCOUT_CHARS[domain] ?? AGENT_CHAR)
      : AGENT_CHAR

    const sprite = this.physics.add.sprite(AGENT_HOME_X, AGENT_HOME_Y, `${charType}_front_idle`)
    sprite.setScale(2.5)
    sprite.setDepth(11)
    if (agentType === 'scout' && domain) {
      sprite.setTint(SCOUT_TINTS[domain] ?? 0xccccff)
    } else {
      sprite.setTint(0xaaddff)
    }
    sprite.setInteractive({ cursor: 'pointer' })

    const statusText = this.add.text(sprite.x, sprite.y - 36, '', {
      fontSize: '14px',
      resolution: 2,
    }).setOrigin(0.5, 1).setDepth(60)

    const data: AgentData = {
      sprite,
      statusText,
      agentId,
      agentType,
      domain,
      charType,
      state: 'idle',
      currentShop: null,
      basket: [],
      lastDir: 'front',
      walkTween: null,
    }

    sprite.on('pointerdown', () => {
      this.events.emit('agent-clicked', {
        agentId: data.agentId,
        agentType: data.agentType,
        domain: data.domain,
        state: data.state,
        currentShop: data.currentShop,
        basket: [...data.basket],
      } satisfies AgentClickedData)
    })

    this.agents.set(agentId, data)
    return data
  }

  /** Updates the floating status icon above an agent. */
  private setAgentState(agentId: string, state: AgentState): void {
    const data = this.agents.get(agentId)
    if (!data) return
    data.state = state
    const icon = STATE_ICON[state]
    data.statusText.setText(icon)
  }

  /** Walks an agent sprite to a world-pixel coordinate. */
  private walkAgent(
    agentId: string,
    targetX: number,
    targetY: number,
    onArrival?: () => void,
  ): void {
    const data = this.agents.get(agentId)
    if (!data) return

    data.walkTween?.stop()
    data.walkTween = null

    const dx = targetX - data.sprite.x
    const dy = targetY - data.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 4) {
      onArrival?.()
      return
    }

    const dir: Dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'front' : 'back')

    data.lastDir = dir
    data.sprite.anims.play(`${data.charType}_walk_${dir}`, true)
    const duration = (dist / PLAYER_SPEED) * 1000

    data.walkTween = this.tweens.add({
      targets: data.sprite,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Linear',
      onComplete: () => {
        data.walkTween = null
        data.sprite.anims.stop()
        data.sprite.setTexture(`${data.charType}_${dir}_idle`)
        onArrival?.()
      },
    })
  }

  // ── Shop queue ────────────────────────────────────────────────────────────────

  /** Returns the world-pixel position for a given slot in a shop's queue.
   *  Slot 0 = at the meeting point (actively negotiating).
   *  Slot 1+ = lined up to the left, 28px apart.
   */
  private queuePosition(shopName: string, slot: number): { x: number; y: number } {
    const meet = SHOP_MEETING[shopName]
    if (!meet) return { x: AGENT_HOME_X, y: AGENT_HOME_Y }
    return { x: meet.x + QUEUE_OFFSET_X * slot, y: meet.y }
  }

  /** Routes an agent to the correct queue slot for a shop.
   *  If the shop is free the agent walks to slot 0 and gets negotiating state.
   *  If occupied the agent walks to the back of the queue with queued state.
   */
  private enqueueAtShop(agentId: string, shopName: string): void {
    const data = this.agents.get(agentId)
    if (!data) return

    if (!this.shopQueues.has(shopName)) this.shopQueues.set(shopName, [])
    const queue = this.shopQueues.get(shopName)!

    if (!queue.includes(agentId)) queue.push(agentId)
    const slot = queue.indexOf(agentId)
    data.currentShop = shopName

    const pos = this.queuePosition(shopName, slot)
    const nextState: AgentState = slot === 0 ? 'negotiating' : 'queued'
    this.setAgentState(agentId, 'walking')

    this.walkAgent(agentId, pos.x, pos.y, () => {
      this.setAgentState(agentId, nextState)
    })
  }

  /** Called when negotiation_complete — removes agent from queue[0] and
   *  walks the next waiting agent to slot 0.
   */
  private dequeueFromShop(shopName: string): void {
    const queue = this.shopQueues.get(shopName)
    if (!queue || queue.length === 0) return

    queue.shift() // remove the agent that just finished

    // Shift remaining agents forward one slot each
    queue.forEach((nextAgentId, newSlot) => {
      const pos = this.queuePosition(shopName, newSlot)
      const nextState: AgentState = newSlot === 0 ? 'negotiating' : 'queued'
      this.walkAgent(nextAgentId, pos.x, pos.y, () => {
        this.setAgentState(nextAgentId, nextState)
      })
    })
  }

  // ── Negotiation event handler ─────────────────────────────────────────────────

  private handleNegotiationEvent(evt: NegotiationEvent): void {
    const agentId = evt.agent_id ?? 'consumer'
    const agentType: 'consumer' | 'scout' = agentId.startsWith('scout_') ? 'scout' : 'consumer'
    const domain = agentId.startsWith('scout_') ? agentId.replace('scout_', '') : undefined

    switch (evt.event) {
      case 'scout_started': {
        // Pre-create scout sprite when the swarm dispatches this domain
        const scoutId = `scout_${evt.domain ?? ''}`
        this.ensureAgent(scoutId, 'scout', evt.domain)
        this.setAgentState(scoutId, 'walking')
        break
      }

      case 'negotiation_started': {
        this.ensureAgent(agentId, agentType, domain)
        if (evt.shop) this.enqueueAtShop(agentId, evt.shop)
        break
      }

      case 'negotiation_round': {
        this.ensureAgent(agentId, agentType, domain)
        if (!evt.message) break

        const data = this.agents.get(agentId)
        if (evt.speaker === 'consumer_agent' && data) {
          this.showBubble(data.sprite.x, data.sprite.y - 40, evt.message, evt.emotion ?? 'neutral')
        } else if (evt.speaker === 'vendor_agent' && evt.shop) {
          const meet = SHOP_MEETING[evt.shop]
          if (meet) this.showBubble(meet.x, meet.y - 40, evt.message, evt.emotion ?? 'neutral')
        }
        break
      }

      case 'negotiation_complete': {
        const data = this.agents.get(agentId)
        if (evt.outcome === 'deal' && evt.final_price != null) {
          if (data) {
            this.showBubble(data.sprite.x, data.sprite.y - 40, `Deal! ₹${evt.final_price}`, 'happy')
            // Record basket entry
            if (data.currentShop) {
              data.basket.push({ item: 'item', shop: data.currentShop, price: Number(evt.final_price) })
            }
          }
          this.setAgentState(agentId, 'deal')
          // Brief pause, then show carrying state
          this.time.delayedCall(1500, () => this.setAgentState(agentId, 'carrying'))
        } else {
          this.setAgentState(agentId, 'walked_away')
          if (data) this.showBubble(data.sprite.x, data.sprite.y - 40, 'No deal…', 'frustrated')
          this.time.delayedCall(2000, () => this.setAgentState(agentId, 'idle'))
        }

        // Dequeue from shop
        if (data?.currentShop) {
          this.dequeueFromShop(data.currentShop)
          data.currentShop = null
        }
        break
      }

      case 'scout_complete': {
        const scoutId = `scout_${evt.domain ?? ''}`
        this.setAgentState(scoutId, 'idle')
        // Walk scout home
        this.time.delayedCall(1000, () => {
          const scoutDomain = evt.domain
          const scoutCharType = scoutDomain ? (SCOUT_CHARS[scoutDomain] ?? AGENT_CHAR) : AGENT_CHAR
          this.walkAgent(scoutId, AGENT_HOME_X, AGENT_HOME_Y, () => {
            const sd = this.agents.get(scoutId)
            if (sd) sd.sprite.setTexture(`${scoutCharType}_front_idle`)
            this.setAgentState(scoutId, 'idle')
          })
        })
        break
      }

      case 'mission_complete': {
        // Walk all agents home
        this.time.delayedCall(1500, () => {
          for (const [aid, agData] of this.agents) {
            this.walkAgent(aid, AGENT_HOME_X, AGENT_HOME_Y, () => {
              agData.sprite.setTexture(`${agData.charType}_front_idle`)
              this.setAgentState(aid, 'idle')
            })
          }
        })
        break
      }
    }
  }

  // ── Speech bubble ─────────────────────────────────────────────────────────────

  private showBubble(x: number, y: number, text: string, emotion: string): void {
    const bubble = new SpeechBubble(this, x, y, text, emotion)
    bubble.setDepth(50)
  }

  // ── Private map helpers ───────────────────────────────────────────────────────

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

  // ── Update loop ───────────────────────────────────────────────────────────────

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

    // Keep status icons floating above each agent sprite (tracks tween position)
    for (const [, data] of this.agents) {
      data.statusText.setPosition(data.sprite.x, data.sprite.y - 36)
    }

    this.pathfinder.calculate()
  }
}
