import * as PIXI from 'pixi.js'
import type { AnimationState } from './agent-sprite'

// ── Canvas size for each frame ─────────────────────────────────────────────
const W = 48   // frame width
const H = 96   // frame height

// ── Anatomy constants (all coords relative to frame origin) ───────────────
const CX        = W / 2        // horizontal centre
const HEAD_R    = 9            // head radius (portrait overlays this)
const HEAD_CY   = HEAD_R + 2   // head centre y
const NECK_TOP  = HEAD_CY + HEAD_R
const TORSO_TOP = NECK_TOP + 4
const TORSO_H   = 28
const TORSO_W   = 18
const HIP_Y     = TORSO_TOP + TORSO_H
const LIMB_W    = 5            // stroke width for arms & legs

type Pose = {
  armLAngle: number   // degrees from vertical, negative = left, positive = right
  armRAngle: number
  legLAngle: number
  legRAngle: number
  torsoYOff: number   // breathing / squat offset
  lean: number        // forward lean of torso in degrees
}

// ── Pose library ──────────────────────────────────────────────────────────

const POSES: Record<string, Pose> = {
  // Standing, arms relaxed at sides
  stand_a: { armLAngle: -20, armRAngle:  20, legLAngle: -6, legRAngle:  6, torsoYOff: 0, lean:  0 },
  stand_b: { armLAngle: -22, armRAngle:  22, legLAngle: -6, legRAngle:  6, torsoYOff: 1, lean:  0 },

  // Seated, arms on desk
  seat_a:  { armLAngle:  50, armRAngle: -50, legLAngle: 80, legRAngle: -80, torsoYOff: 8, lean:  5 },
  seat_b:  { armLAngle:  52, armRAngle: -48, legLAngle: 80, legRAngle: -80, torsoYOff: 9, lean:  5 },

  // Walk cycle (4 frames)
  walk_a:  { armLAngle: -35, armRAngle:  55, legLAngle: -40, legRAngle: 40, torsoYOff: 0, lean:  4 },
  walk_b:  { armLAngle: -10, armRAngle:  20, legLAngle: -10, legRAngle: 10, torsoYOff:-1, lean:  3 },
  walk_c:  { armLAngle:  55, armRAngle: -35, legLAngle:  40, legRAngle:-40, torsoYOff: 0, lean:  4 },
  walk_d:  { armLAngle:  20, armRAngle: -10, legLAngle:  10, legRAngle:-10, torsoYOff:-1, lean:  3 },

  // Typing
  type_a:  { armLAngle:  65, armRAngle: -65, legLAngle: 82, legRAngle: -82, torsoYOff: 8, lean: 12 },
  type_b:  { armLAngle:  60, armRAngle: -70, legLAngle: 82, legRAngle: -82, torsoYOff: 8, lean: 11 },

  // Thinking (one hand to chin)
  think_a: { armLAngle:  30, armRAngle: -80, legLAngle: 80, legRAngle: -80, torsoYOff: 8, lean:  8 },
  think_b: { armLAngle:  30, armRAngle: -76, legLAngle: 80, legRAngle: -80, torsoYOff: 9, lean:  8 },

  // Confused / blocked
  conf_a:  { armLAngle: -55, armRAngle:  55, legLAngle: 82, legRAngle: -82, torsoYOff: 8, lean: -3 },
  conf_b:  { armLAngle: -50, armRAngle:  50, legLAngle: 82, legRAngle: -82, torsoYOff: 9, lean:  3 },

  // Celebrate
  cel_a:   { armLAngle: -140, armRAngle:  140, legLAngle: -14, legRAngle: 14, torsoYOff:-3, lean:  0 },
  cel_b:   { armLAngle: -130, armRAngle:  130, legLAngle: -18, legRAngle: 18, torsoYOff:-6, lean:  0 },

  // Presenting (one arm forward/extended)
  pres_a:  { armLAngle: -20, armRAngle: -110, legLAngle: -10, legRAngle: 10, torsoYOff: 0, lean:  8 },
  pres_b:  { armLAngle: -18, armRAngle: -115, legLAngle: -12, legRAngle: 12, torsoYOff: 0, lean:  8 },
}

// ── Frame sequences per state ─────────────────────────────────────────────

const SEQUENCES: Record<AnimationState, string[]> = {
  idle_standing: ['stand_a', 'stand_b'],
  idle_seated:   ['seat_a',  'seat_b'],
  walk:          ['walk_a', 'walk_b', 'walk_c', 'walk_d'],
  sit_down:      ['stand_a', 'seat_a'],
  stand_up:      ['seat_a', 'stand_a'],
  typing:        ['type_a', 'type_b'],
  thinking:      ['think_a', 'think_b'],
  confused:      ['conf_a', 'conf_b'],
  celebrate:     ['cel_a', 'cel_b'],
  present:       ['pres_a', 'pres_b'],
  enter:         ['walk_a', 'walk_b', 'walk_c', 'walk_d'],
}

// ── Drawing helpers ────────────────────────────────────────────────────────

function deg2rad(d: number) { return (d * Math.PI) / 180 }

function limbEnd(fromX: number, fromY: number, angleDeg: number, length: number) {
  const r = deg2rad(angleDeg)
  return { x: fromX + Math.sin(r) * length, y: fromY + Math.cos(r) * length }
}

function drawPose(g: PIXI.Graphics, pose: Pose, bodyColor: number): void {
  const ty = TORSO_TOP + pose.torsoYOff
  const hy = ty + TORSO_H
  const leanRad = deg2rad(pose.lean)

  // ── Legs ──────────────────────────────────────────────────────
  const hipL = { x: CX - TORSO_W / 4, y: hy }
  const hipR = { x: CX + TORSO_W / 4, y: hy }
  const kL = limbEnd(hipL.x, hipL.y, pose.legLAngle, 20)
  const kR = limbEnd(hipR.x, hipR.y, pose.legRAngle, 20)
  const fL = limbEnd(kL.x, kL.y, pose.legLAngle * 0.4, 14)
  const fR = limbEnd(kR.x, kR.y, pose.legRAngle * 0.4, 14)

  g.moveTo(hipL.x, hipL.y).lineTo(kL.x, kL.y).lineTo(fL.x, fL.y)
    .stroke({ color: bodyColor, width: LIMB_W, cap: 'round', join: 'round' })
  g.moveTo(hipR.x, hipR.y).lineTo(kR.x, kR.y).lineTo(fR.x, fR.y)
    .stroke({ color: bodyColor, width: LIMB_W, cap: 'round', join: 'round' })

  // ── Torso (leaned) ────────────────────────────────────────────
  const torsoTopX = CX + Math.sin(leanRad) * TORSO_H * 0.5
  const torsoTopY = ty - Math.cos(leanRad) * TORSO_H * 0.5 + TORSO_H * 0.5

  g.roundRect(
    CX - TORSO_W / 2,
    ty,
    TORSO_W,
    TORSO_H,
    4
  ).fill({ color: bodyColor })

  // ── Shoulders (attachment points) ─────────────────────────────
  const shoulderY = ty + 4
  const shoulderLx = CX - TORSO_W / 2
  const shoulderRx = CX + TORSO_W / 2

  // ── Arms ──────────────────────────────────────────────────────
  const elbowL = limbEnd(shoulderLx, shoulderY, pose.armLAngle, 13)
  const elbowR = limbEnd(shoulderRx, shoulderY, pose.armRAngle, 13)
  const handL  = limbEnd(elbowL.x, elbowL.y, pose.armLAngle * 0.6, 11)
  const handR  = limbEnd(elbowR.x, elbowR.y, pose.armRAngle * 0.6, 11)

  g.moveTo(shoulderLx, shoulderY).lineTo(elbowL.x, elbowL.y).lineTo(handL.x, handL.y)
    .stroke({ color: bodyColor, width: LIMB_W, cap: 'round', join: 'round' })
  g.moveTo(shoulderRx, shoulderY).lineTo(elbowR.x, elbowR.y).lineTo(handR.x, handR.y)
    .stroke({ color: bodyColor, width: LIMB_W, cap: 'round', join: 'round' })

  // ── Head placeholder (portrait overlays this) ─────────────────
  g.circle(CX, HEAD_CY + pose.torsoYOff * 0.5, HEAD_R)
    .fill({ color: bodyColor, alpha: 0.15 })
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface AnimationSet {
  textures:   PIXI.Texture[]
  speed:      number
  loop:       boolean
}

export class SpriteFactory {
  private renderer: PIXI.IRenderer
  private cache = new Map<string, PIXI.Texture>()

  constructor(renderer: PIXI.IRenderer) {
    this.renderer = renderer
  }

  private makeTexture(poseName: string, bodyColor: number): PIXI.Texture {
    const key = `${poseName}:${bodyColor}`
    if (this.cache.has(key)) return this.cache.get(key)!

    const pose = POSES[poseName]
    if (!pose) throw new Error(`Unknown pose: ${poseName}`)

    const g = new PIXI.Graphics()
    drawPose(g, pose, bodyColor)

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
      walk:      0.15,
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
