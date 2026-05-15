import * as PIXI from 'pixi.js'
import type { AnimationState } from './agent-sprite'

// ── Frame canvas ───────────────────────────────────────────────────────────
const W = 48
const H = 96
const CX = W / 2

// ── Upper-body anatomy (no legs — agents are desk workers) ────────────────
const HEAD_R    = 9
const HEAD_CY   = HEAD_R + 3    // 12 — head centre y from top
const SHLDR_Y   = HEAD_CY + HEAD_R + 7   // 28 — shoulder line
const SHLDR_W   = 26            // shoulder width (wider = more human)
const TORSO_H   = 28            // torso height
const TORSO_BOT = SHLDR_Y + TORSO_H     // 56 — waist (desk hides everything below)
const ARM_W     = 6             // arm stroke width

// ── Pose type (legs removed) ──────────────────────────────────────────────
type Pose = {
  armLAngle: number   // degrees from vertical — negative swings left
  armRAngle: number
  torsoYOff: number   // breathing / bob offset
  lean:      number   // forward lean — shifts arm endpoints forward
}

// ── Pose library ──────────────────────────────────────────────────────────
const POSES: Record<string, Pose> = {
  // Upright / standing (used when agent walks between desks)
  stand_a: { armLAngle:  22, armRAngle:  -22, torsoYOff: 0, lean:  0 },
  stand_b: { armLAngle:  24, armRAngle:  -24, torsoYOff: 1, lean:  0 },

  // Seated, arms resting on desk
  seat_a:  { armLAngle:  62, armRAngle:  -62, torsoYOff: 0, lean:  6 },
  seat_b:  { armLAngle:  64, armRAngle:  -60, torsoYOff: 1, lean:  6 },

  // Walk cycle — arm swing only (no legs shown)
  walk_a:  { armLAngle:  35, armRAngle:  -55, torsoYOff: 0, lean:  5 },
  walk_b:  { armLAngle:  12, armRAngle:  -22, torsoYOff:-1, lean:  3 },
  walk_c:  { armLAngle:  55, armRAngle:  -35, torsoYOff: 0, lean:  5 },
  walk_d:  { armLAngle:  22, armRAngle:  -12, torsoYOff:-1, lean:  3 },

  // Typing — both arms angled forward onto keyboard
  type_a:  { armLAngle:  74, armRAngle:  -74, torsoYOff: 0, lean: 13 },
  type_b:  { armLAngle:  70, armRAngle:  -78, torsoYOff: 0, lean: 12 },

  // Thinking — one hand raised toward chin
  think_a: { armLAngle:  48, armRAngle:  -88, torsoYOff: 0, lean:  8 },
  think_b: { armLAngle:  48, armRAngle:  -84, torsoYOff: 1, lean:  8 },

  // Confused / blocked — arms spread outward
  conf_a:  { armLAngle: -32, armRAngle:   32, torsoYOff: 0, lean: -4 },
  conf_b:  { armLAngle: -28, armRAngle:   28, torsoYOff: 1, lean:  4 },

  // Celebrate — both arms raised
  cel_a:   { armLAngle: -120, armRAngle:  120, torsoYOff:-4, lean:  0 },
  cel_b:   { armLAngle: -110, armRAngle:  110, torsoYOff:-7, lean:  0 },

  // Presenting — one arm extended toward viewer
  pres_a:  { armLAngle:  28, armRAngle: -105, torsoYOff: 0, lean:  8 },
  pres_b:  { armLAngle:  26, armRAngle: -110, torsoYOff: 0, lean:  8 },
}

// ── Sequence map ──────────────────────────────────────────────────────────
const SEQUENCES: Record<AnimationState, string[]> = {
  idle_standing: ['stand_a', 'stand_b'],
  idle_seated:   ['seat_a',  'seat_b'],
  walk:          ['walk_a', 'walk_b', 'walk_c', 'walk_d'],
  sit_down:      ['stand_a', 'seat_a'],
  stand_up:      ['seat_a',  'stand_a'],
  typing:        ['type_a', 'type_b'],
  thinking:      ['think_a', 'think_b'],
  confused:      ['conf_a', 'conf_b'],
  celebrate:     ['cel_a', 'cel_b'],
  present:       ['pres_a', 'pres_b'],
  enter:         ['walk_a', 'walk_b', 'walk_c', 'walk_d'],
}

// ── Helpers ────────────────────────────────────────────────────────────────
function deg2rad(d: number) { return (d * Math.PI) / 180 }

function limbEnd(x: number, y: number, angleDeg: number, len: number) {
  const r = deg2rad(angleDeg)
  return { x: x + Math.sin(r) * len, y: y + Math.cos(r) * len }
}

// ── Figure drawing — upper body only ──────────────────────────────────────
function drawFigure(g: PIXI.Graphics, pose: Pose, bodyColor: number): void {
  const yOff = pose.torsoYOff * 0.4
  const sy   = SHLDR_Y + yOff
  const bot  = TORSO_BOT + yOff

  // ── Suit jacket body ──────────────────────────────────────────
  g.roundRect(CX - SHLDR_W / 2, sy, SHLDR_W, bot - sy, 6)
    .fill({ color: bodyColor })

  // Jacket lapels
  g.moveTo(CX - SHLDR_W / 2 + 2, sy + 1)
    .lineTo(CX - 1, sy + 10)
    .lineTo(CX - SHLDR_W / 2 + 2, sy + 16)
    .closePath()
    .fill({ color: 0x000000, alpha: 0.20 })
  g.moveTo(CX + SHLDR_W / 2 - 2, sy + 1)
    .lineTo(CX + 1, sy + 10)
    .lineTo(CX + SHLDR_W / 2 - 2, sy + 16)
    .closePath()
    .fill({ color: 0x000000, alpha: 0.20 })

  // Shirt / collar V
  g.moveTo(CX - 5, sy).lineTo(CX, sy + 10).lineTo(CX + 5, sy)
    .fill({ color: 0xffffff, alpha: 0.24 })

  // Suit button row
  for (let i = 0; i < 3; i++) {
    g.circle(CX, sy + 16 + i * 7, 1.2).fill({ color: 0xffffff, alpha: 0.20 })
  }

  // Surface highlight on left shoulder
  g.roundRect(CX - SHLDR_W / 2 + 1, sy + 1, 6, bot - sy - 2, 4)
    .fill({ color: 0xffffff, alpha: 0.06 })

  // ── Shoulder caps ─────────────────────────────────────────────
  g.ellipse(CX - SHLDR_W / 2, sy + 3, 8, 5).fill({ color: bodyColor })
  g.ellipse(CX + SHLDR_W / 2, sy + 3, 8, 5).fill({ color: bodyColor })

  // ── Arms (sleeves) ────────────────────────────────────────────
  const alx  = CX - SHLDR_W / 2 - 1
  const arx  = CX + SHLDR_W / 2 + 1
  const armY = sy + 5

  const leanAdj = pose.lean * 0.4   // lean nudges arm endpoints downward

  const elbL = limbEnd(alx, armY, pose.armLAngle, 16)
  const elbR = limbEnd(arx, armY, pose.armRAngle, 16)
  const hndL = limbEnd(elbL.x, elbL.y + leanAdj, pose.armLAngle * 0.5, 12)
  const hndR = limbEnd(elbR.x, elbR.y + leanAdj, pose.armRAngle * 0.5, 12)

  g.moveTo(alx, armY).lineTo(elbL.x, elbL.y).lineTo(hndL.x, hndL.y)
    .stroke({ color: bodyColor, width: ARM_W, cap: 'round', join: 'round' })
  g.moveTo(arx, armY).lineTo(elbR.x, elbR.y).lineTo(hndR.x, hndR.y)
    .stroke({ color: bodyColor, width: ARM_W, cap: 'round', join: 'round' })

  // Cuff highlights
  g.circle(hndL.x, hndL.y, 4).fill({ color: 0xffffff, alpha: 0.16 })
  g.circle(hndR.x, hndR.y, 4).fill({ color: 0xffffff, alpha: 0.16 })

  // ── Head placeholder (portrait card covers this) ───────────────
  g.circle(CX, HEAD_CY + yOff * 0.3, HEAD_R).fill({ color: bodyColor, alpha: 0.08 })
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface AnimationSet {
  textures: PIXI.Texture[]
  speed:    number
  loop:     boolean
}

export class SpriteFactory {
  private renderer: PIXI.Renderer
  private cache = new Map<string, PIXI.Texture>()

  constructor(renderer: PIXI.Renderer) {
    this.renderer = renderer
  }

  private makeTexture(poseName: string, bodyColor: number): PIXI.Texture {
    const key = `${poseName}:${bodyColor}`
    if (this.cache.has(key)) return this.cache.get(key)!

    const pose = POSES[poseName]
    if (!pose) throw new Error(`Unknown pose: ${poseName}`)

    const g = new PIXI.Graphics()
    drawFigure(g, pose, bodyColor)

    const texture = this.renderer.generateTexture({
      target: g,
      frame:  new PIXI.Rectangle(0, 0, W, H),
    })

    this.cache.set(key, texture)
    g.destroy()
    return texture
  }

  build(state: AnimationState, bodyColor = 0x3d5278): AnimationSet {
    const poseNames = SEQUENCES[state] ?? SEQUENCES.idle_standing
    const textures  = poseNames.map((p) => this.makeTexture(p, bodyColor))

    const speedMap: Partial<Record<AnimationState, number>> = {
      walk:      0.14,
      celebrate: 0.12,
    }
    const loopFalse: AnimationState[] = ['sit_down', 'stand_up', 'enter']

    return {
      textures,
      speed: speedMap[state] ?? 0.06,
      loop:  !loopFalse.includes(state),
    }
  }

  destroy() {
    this.cache.forEach((t) => t.destroy())
    this.cache.clear()
  }
}
