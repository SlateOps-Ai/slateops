import * as PIXI from 'pixi.js'
import { SpriteFactory } from './sprite-factory'

export type AnimationState =
  | 'idle_seated'
  | 'idle_standing'
  | 'walk'
  | 'sit_down'
  | 'stand_up'
  | 'typing'
  | 'thinking'
  | 'present'
  | 'confused'
  | 'celebrate'
  | 'enter'

// Body colour per state
const STATE_COLOR: Partial<Record<AnimationState, number>> = {
  idle_seated:   0x2c3e6b,
  idle_standing: 0x3d5278,
  walk:          0x3d5278,
  typing:        0x4d7fff,
  thinking:      0x8892b0,
  confused:      0xff6b4d,
  celebrate:     0x4dffa0,
  present:       0xf0c070,
  sit_down:      0x3d5278,
  stand_up:      0x3d5278,
  enter:         0x3d5278,
}

interface WalkTarget {
  x: number
  y: number
  onComplete?: () => void
}

// ── AgentSpriteGroup ──────────────────────────────────────────────────────

export class AgentSpriteGroup {
  readonly container: PIXI.Container
  readonly agentId:   string

  private factory:   SpriteFactory
  private body:      PIXI.AnimatedSprite
  private portrait:  PIXI.Container     // holds the face card
  private nameTag:   PIXI.Text
  private bubble:    PIXI.Container | null = null
  private bubbleText: PIXI.Text | null = null

  private currentState: AnimationState = 'idle_standing'
  private walkTarget: WalkTarget | null = null
  private readonly walkSpeed = 2.8

  constructor(
    agentId:    string,
    name:       string,
    portraitUrl: string,
    factory:    SpriteFactory
  ) {
    this.agentId = agentId
    this.factory = factory
    this.container = new PIXI.Container()

    // Body animated sprite (starts with idle_standing)
    const { textures, speed, loop } = factory.build('idle_standing')
    this.body = new PIXI.AnimatedSprite(textures)
    this.body.animationSpeed = speed
    this.body.loop = loop
    this.body.anchor.set(0.5, 1)   // pivot at feet
    this.body.play()
    this.container.addChild(this.body)

    // Portrait card — the agent's "face"
    this.portrait = this.buildPortrait(portraitUrl)
    this.portrait.y = -this.body.height - 4
    this.container.addChild(this.portrait)

    // Name tag below feet
    this.nameTag = new PIXI.Text({
      text: name,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize:   11,
        fontWeight: '500',
        fill:       0xffffff,
        align:      'center',
        dropShadow: { color: 0x000000, blur: 4, alpha: 0.6, distance: 1 },
      },
    })
    this.nameTag.anchor.set(0.5, 0)
    this.nameTag.y = 4
    this.container.addChild(this.nameTag)
  }

  // ── Portrait card ─────────────────────────────────────────────

  private buildPortrait(url: string): PIXI.Container {
    const card = new PIXI.Container()
    const size = 38

    // Card background
    const bg = new PIXI.Graphics()
    bg.roundRect(-size / 2, -size / 2, size, size, 6)
      .fill({ color: 0x1a2035 })
      .stroke({ color: 0x4d7fff, width: 1.5, alpha: 0.6 })
    card.addChild(bg)

    // Portrait image or initials fallback
    const texture = PIXI.Cache.get(url) as PIXI.Texture | undefined
    if (texture) {
      const img = new PIXI.Sprite(texture)
      img.width  = size - 4
      img.height = size - 4
      img.anchor.set(0.5)
      card.addChild(img)
    } else {
      // Warm circle placeholder
      const circle = new PIXI.Graphics()
      circle.circle(0, 0, size / 2 - 2).fill({ color: 0xf0c070 })
      card.addChild(circle)
    }

    return card
  }

  // ── Position ──────────────────────────────────────────────────

  setPosition(x: number, y: number): void {
    this.container.x = x
    this.container.y = y
  }

  get x() { return this.container.x }
  get y() { return this.container.y }

  // ── Walk (called each frame by scene.app.ticker) ──────────────

  tick(): void {
    if (!this.walkTarget) return
    const { x, y, onComplete } = this.walkTarget
    const dx = x - this.container.x
    const dy = y - this.container.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Mirror horizontally based on direction of travel
    this.container.scale.x = dx < 0 ? -1 : 1

    if (dist <= this.walkSpeed) {
      this.container.x = x
      this.container.y = y
      this.walkTarget   = null
      this.container.scale.x = 1
      this.playAnimation('idle_standing')
      onComplete?.()
    } else {
      this.container.x += (dx / dist) * this.walkSpeed
      this.container.y += (dy / dist) * this.walkSpeed
    }
  }

  // ── Animations ────────────────────────────────────────────────

  playAnimation(state: AnimationState): void {
    if (this.currentState === state) return
    this.currentState = state

    const color = STATE_COLOR[state] ?? 0x3d5278
    const { textures, speed, loop } = this.factory.build(state, color)

    this.body.textures        = textures
    this.body.animationSpeed  = speed
    this.body.loop            = loop
    this.body.gotoAndPlay(0)
  }

  walkTo(x: number, y: number, onComplete?: () => void): void {
    this.walkTarget = { x, y, onComplete }
    this.playAnimation('walk')
  }

  // ── Thought bubble ────────────────────────────────────────────

  showThought(text: string): void {
    if (!this.bubble) {
      this.bubble = new PIXI.Container()
      this.bubble.y = -this.body.height - 52

      const bg = new PIXI.Graphics()
      bg.roundRect(-74, -14, 148, 28, 8)
        .fill({ color: 0x12172b, alpha: 0.92 })
        .stroke({ color: 0x4d7fff, width: 1, alpha: 0.4 })

      // Tail triangle
      bg.moveTo(-6, 14).lineTo(6, 14).lineTo(0, 22).closePath()
        .fill({ color: 0x12172b, alpha: 0.92 })

      this.bubble.addChild(bg)

      this.bubbleText = new PIXI.Text({
        text: '',
        style: {
          fontFamily:    'Inter, system-ui, sans-serif',
          fontSize:      10,
          fill:          0xffffff,
          align:         'center',
          wordWrap:      true,
          wordWrapWidth: 136,
        },
      })
      this.bubbleText.anchor.set(0.5)
      this.bubble.addChild(this.bubbleText)
      this.container.addChild(this.bubble)
    }

    if (this.bubbleText) this.bubbleText.text = text.slice(0, 45)
    this.bubble.visible = true
    this.bubble.alpha   = 0
    this.fadeTo(this.bubble, 1, 10)
  }

  hideThought(): void {
    if (this.bubble) this.fadeTo(this.bubble, 0, 10, () => {
      if (this.bubble) this.bubble.visible = false
    })
  }

  // ── Helpers ───────────────────────────────────────────────────

  private fadeTo(
    target: PIXI.Container,
    goal:   number,
    steps:  number,
    cb?:    () => void
  ): void {
    let frame = 0
    const start = target.alpha
    const tick = () => {
      frame++
      target.alpha = start + (goal - start) * (frame / steps)
      if (frame >= steps) {
        target.alpha = goal
        PIXI.Ticker.shared.remove(tick)
        cb?.()
      }
    }
    PIXI.Ticker.shared.add(tick)
  }

  destroy(): void {
    this.factory.destroy()
    this.container.destroy({ children: true })
  }
}
