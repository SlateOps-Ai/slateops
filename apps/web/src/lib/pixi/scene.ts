import * as PIXI from 'pixi.js'

export type DeskKey = 'ceo' | 'agent_0' | 'agent_1' | 'agent_2' | 'agent_3' | 'agent_4' | 'agent_5' | 'door'

// Two cubicle pods: left (agents 0,1,2) and right (agents 3,4,5) — CEO centred back
export const DESK_POSITIONS: Record<DeskKey, { x: number; y: number }> = {
  ceo:     { x: 635, y: 435 },
  agent_0: { x: 272, y: 388 },
  agent_1: { x: 412, y: 388 },
  agent_2: { x: 342, y: 525 },
  agent_3: { x: 855, y: 388 },
  agent_4: { x: 995, y: 388 },
  agent_5: { x: 925, y: 525 },
  door:    { x: 80,  y: 680 },
}

const MAX_AGENT_SLOTS = 6

// Fill back rows of both pods first so agents spread symmetrically
// Order: left-back-L, right-back-L, left-back-R, right-back-R, left-front, right-front
const DESK_SLOT_ORDER = [0, 3, 1, 4, 2, 5]

export const agentDeskKey = (index: number): DeskKey =>
  `agent_${DESK_SLOT_ORDER[index % MAX_AGENT_SLOTS]}` as DeskKey

export interface SceneLayers {
  backdrop:  PIXI.Container
  floor:     PIXI.Container
  furniture: PIXI.Container
  monitors:  PIXI.Container
  lamps:     PIXI.Container
  agents:    PIXI.Container
  bubbles:   PIXI.Container
  particles: PIXI.Container
}

// ── Colour palette ────────────────────────────────────────────────────────────

const C = {
  // Walls & floor — richer, warmer tones
  wallWarm:    0xe2ddd4,
  wallShadow:  0xcbc3ac,
  wallAccent:  0xd4e4e8,   // subtle teal tint on back wall section
  floorOak:    0xb07840,   // richer, deeper warm wood
  floorShadow: 0x8a5c2e,
  floorLight:  0xcc9458,

  // Sky / window
  skyTop:      0x8ab4d8,   // deeper blue sky
  skyBot:      0xb8d4ee,
  building:    0x1a2744,
  buildingLit: 0xffb84d,

  // Desk surfaces
  deskNavy:    0x1e2d4d,
  deskMid:     0x2a4070,
  deskLight:   0x3a5898,
  deskSurface: 0x4a7cbf,

  // Cubicle partitions
  partPanel:   0x2b5faa,
  partLight:   0x4a8ad8,
  partEdge:    0x19407a,
  partTrim:    0x6ea0cc,

  // Chairs
  chairSeat:   0x3e7c34,
  chairBack:   0x4a9040,
  chairMesh:   0x2c5e26,
  chairFrame:  0x1a1e30,
  chairArm:    0x23283e,

  // Decor
  rugWine:     0x8b2635,
  rugBorder:   0xf0c070,
  plant:       0x4a7c59,
  plantPot:    0xc4956a,
  book1:       0x4d7fff,
  book2:       0xff6b4d,
  book3:       0x4dffa0,
  book4:       0xf0c070,

  // Lamps / monitors
  lampIdle:    0xffb84d,
  lampWork:    0x4d7fff,
  lampDone:    0x4dffa0,
  lampBlock:   0xff6b4d,
  monitorBg:   0x0a0f1e,
  monitorGlow: 0x4d7fff,
  ceilingRail: 0xd6cebc,

  // Lounge zone
  sofaBase:    0x4a6741,
  sofaLight:   0x5e8054,
  sofaShadow:  0x344a2e,
  sofaArm:     0x3d5938,
  tableWood:   0x8c6240,
  tableLeg:    0x5a3c22,
  coffeeMetal: 0x1e1b2a,
  coffeeLed:   0x4dffa0,
  coffeeAccent:0xf0c070,
  waterBody:   0xe8f4f8,
  waterTank:   0x7ab8d8,
  cream:       0xfaf0e0,
  loungeRug:   0x2c4a6e,
  loungeRugBdr:0x4d7fff,

  // New — pod carpets
  carpetLeft:  0x253450,   // cool blue-navy carpet under left pod
  carpetRight: 0x2e2844,   // purple-navy carpet under right pod

  // New — screen glow
  screenGlow:  0x2244cc,

  // New — whiteboard
  wboardBg:    0xf8f8f4,
  wboardFrame: 0x8a7a60,

  // New — reception
  recepSurface:0x5a90c8,
  recepFront:  0x3a6498,
}

// ── OfficeScene ───────────────────────────────────────────────────────────────

export class OfficeScene {
  app!: PIXI.Application
  layers!: SceneLayers

  private camera    = { x: 640, y: 420, targetX: 640, targetY: 420 }
  private lampMap   = new Map<string, PIXI.Graphics>()
  private monitors  = new Map<string, { screen: PIXI.Graphics; ticker?: PIXI.TickerCallback<unknown> }>()
  private resizeOb?: ResizeObserver
  private isNight   = false
  private timeOfDay = 0
  private _initialized = false

  // ── Boot ──────────────────────────────────────────────────────────────────

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new PIXI.Application()
    await this.app.init({
      canvas,
      width:           canvas.clientWidth  || window.innerWidth,
      height:          canvas.clientHeight || window.innerHeight,
      backgroundColor: 0x1a2744,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    })
    this.buildLayers()
    this.drawScene()
    this.startCameraLoop()
    this.startDayNightCycle()
    this.setupResize(canvas)
    this._initialized = true
  }

  private buildLayers(): void {
    this.layers = {
      backdrop:  new PIXI.Container(),
      floor:     new PIXI.Container(),
      furniture: new PIXI.Container(),
      monitors:  new PIXI.Container(),
      lamps:     new PIXI.Container(),
      agents:    new PIXI.Container(),
      bubbles:   new PIXI.Container(),
      particles: new PIXI.Container(),
    }
    Object.values(this.layers).forEach(l => this.app.stage.addChild(l))
  }

  // ── Full scene draw ───────────────────────────────────────────────────────

  private drawScene(): void {
    const { width: W, height: H } = this.app.screen

    this.drawBackdrop(W, H)
    this.drawFloor(W, H)
  }

  // ── Backdrop ──────────────────────────────────────────────────────────────

  private drawBackdrop(W: number, H: number): void {
    const bg = new PIXI.Graphics()
    bg.rect(0, 0, W, H).fill({ color: 0x1a2744 })
    this.layers.backdrop.addChild(bg)
  }

  private drawFloor(_W: number, _H: number): void {
    // Floor is same colour as wall — nothing extra to draw
  }

  // ── Lamp state API ────────────────────────────────────────────────────────

  setLampState(deskKey: DeskKey, state: 'idle' | 'working' | 'done' | 'blocked'): void {
    const glow = this.lampMap.get(deskKey)
    if (!glow) return
    const colorMap = {
      idle:    { color: C.lampIdle,  r: 10 },
      working: { color: C.lampWork,  r: 14 },
      done:    { color: C.lampDone,  r: 14 },
      blocked: { color: C.lampBlock, r: 10 },
    }
    const { color, r } = colorMap[state]
    glow.clear()
    glow.circle(0, 0, r).fill({ color, alpha: 0.82 })
    glow.circle(0, 0, r + 8).fill({ color, alpha: 0.14 })
  }

  // ── Monitor animation API ─────────────────────────────────────────────────

  setMonitorWorking(deskKey: string, working: boolean): void {
    const mon = this.monitors.get(deskKey)
    if (!mon) return
    if (mon.ticker) {
      this.app.ticker.remove(mon.ticker as PIXI.TickerCallback<unknown>)
      mon.ticker = undefined
    }
    if (!working) { mon.screen.tint = 0xffffff; return }
    let frame = 0
    const tick = () => {
      frame++
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.08)
      mon.screen.tint = PIXI.Color.shared
        .setValue([0.06 + 0.06 * pulse, 0.15 + 0.08 * pulse, 0.35 + 0.1 * pulse])
        .toNumber()
    }
    this.app.ticker.add(tick)
    mon.ticker = tick
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  panTo(x: number, y: number): void {
    this.camera.targetX = x
    this.camera.targetY = y
  }

  panToDesk(key: DeskKey): void {
    const p = DESK_POSITIONS[key]
    if (p) this.panTo(p.x, p.y)
  }

  private startCameraLoop(): void {
    const lerp = 0.055
    this.app.ticker.add(() => {
      this.camera.x += (this.camera.targetX - this.camera.x) * lerp
      this.camera.y += (this.camera.targetY - this.camera.y) * lerp
      const ox = this.app.screen.width  / 2 - this.camera.x
      const oy = this.app.screen.height / 2 - this.camera.y
      for (const layer of [
        this.layers.furniture, this.layers.monitors,
        this.layers.lamps, this.layers.agents, this.layers.bubbles,
      ]) {
        layer.x = ox
        layer.y = oy
      }
    })
  }

  // ── Day / night cycle ─────────────────────────────────────────────────────

  private startDayNightCycle(): void {
    this.app.ticker.add(() => {
      this.timeOfDay = (this.timeOfDay + 0.0003) % 1
      const night = this.timeOfDay > 0.5
      if (night !== this.isNight) {
        this.isNight = night
        this.layers.backdrop.tint = night ? 0xaab0c8 : 0xffffff
      }
    })
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  private setupResize(canvas: HTMLCanvasElement): void {
    this.resizeOb = new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight
      this.app.renderer.resize(w, h)
      this.layers.backdrop.removeChildren()
      this.layers.floor.removeChildren()
      this.layers.furniture.removeChildren()
      this.layers.monitors.removeChildren()
      this.layers.lamps.removeChildren()
      this.lampMap.clear()
      this.monitors.clear()
      this.drawScene()
    })
    this.resizeOb.observe(canvas)
  }

  destroy(): void {
    this.resizeOb?.disconnect()
    if (!this._initialized) return
    this.monitors.forEach(m => {
      if (m.ticker) this.app.ticker.remove(m.ticker as PIXI.TickerCallback<unknown>)
    })
    try { this.app.destroy(true) } catch { /* ignore mid-init destroy */ }
  }
}
