import Phaser from 'phaser'
import { MarketplaceScene } from './scenes/MarketplaceScene'

/** Phaser game config — top-down orthogonal marketplace simulation.
 * Tilemap orientation: orthogonal (Kenney RPG Urban Pack, 16×16).
 * Isometric rendering is NOT used — orientation comes from the Tiled JSON export.
 */
export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#2d5a27',
  scene: [MarketplaceScene],
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  parent: 'phaser-root',
}
