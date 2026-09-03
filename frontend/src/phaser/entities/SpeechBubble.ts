const EMOTION_COLORS: Record<string, number> = {
  friendly: 0x4ade80,
  firm: 0xfacc15,
  frustrated: 0xfb923c,
  neutral: 0x60a5fa,
  happy: 0x4ade80,
}

const BUBBLE_W = 160
const BUBBLE_H = 60
const INSET = 12
const TEXTURE_KEY = 'bubble-9slice'

/** Generates the 9-slice bubble texture once per scene if not already cached. */
function ensureBubbleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE_KEY)) return
  const gfx = scene.make.graphics({ x: 0, y: 0, add: false })
  gfx.fillStyle(0xffffff, 1)
  gfx.fillRoundedRect(0, 0, INSET * 4, INSET * 4, INSET)
  gfx.generateTexture(TEXTURE_KEY, INSET * 4, INSET * 4)
  gfx.destroy()
}

export class SpeechBubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.NineSlice
  private label: Phaser.GameObjects.Text

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    emotion: string = 'neutral',
  ) {
    super(scene, x, y)

    ensureBubbleTexture(scene)

    this.bg = scene.add.nineslice(
      0, 0,
      TEXTURE_KEY, undefined,
      BUBBLE_W, BUBBLE_H,
      INSET, INSET, INSET, INSET,
    )
    this.bg.setTint(EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral)

    this.label = scene.add.text(0, 0, text, {
      fontSize: '11px',
      color: '#1a1a1a',
      wordWrap: { width: BUBBLE_W - 20 },
      align: 'center',
    }).setOrigin(0.5)

    this.add([this.bg, this.label])
    scene.add.existing(this)

    scene.tweens.add({
      targets: this,
      alpha: 0,
      delay: 3000,
      duration: 500,
      onComplete: () => this.destroy(),
    })
  }

  updateText(text: string, emotion: string = 'neutral'): void {
    this.label.setText(text)
    this.bg.setTint(EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral)
    this.setAlpha(1)
  }
}
