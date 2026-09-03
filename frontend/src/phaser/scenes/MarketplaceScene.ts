import { SpeechBubble } from '../entities'

/** Top-down orthogonal marketplace scene.
 * Loads Tiled JSON map (orthogonal, 16×16), spawns agent sprites, handles WebSocket events.
 * Phase 1: world + camera. Phase 3: agents + negotiation. Phase 4: payment events.
 */
export class MarketplaceScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MarketplaceScene' })
  }

  preload(): void {
    // Phase 1 will load: tilemapTiledJSON, tileset images, character spritesheets
    // Tiled map exported as orthogonal JSON → frontend/public/assets/maps/marketplace.json
  }

  create(): void {
    const { width, height } = this.scale

    // Placeholder background until Tiled map is imported (Phase 1 Prompt 4)
    this.add.rectangle(width / 2, height / 2, width, height, 0x2d5a27)

    this.add.text(width / 2, height / 2, 'Agentopolis — marketplace loading…', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5)

    // Test speech bubble — verifies SpeechBubble class and NineSlice texture generation
    new SpeechBubble(this, width / 2, height / 2 - 80, '₹290 for 2kg? Deal! 🤝', 'friendly')
    new SpeechBubble(this, width / 2, height / 2 - 140, 'Best price: ₹310', 'firm')
  }

  update(): void {
    // WASD movement + camera follow implemented Phase 1
  }
}
