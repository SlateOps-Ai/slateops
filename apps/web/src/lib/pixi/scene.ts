import * as PIXI from 'pixi.js'

export type DeskKey = 'ceo' | 'agent_0' | 'agent_1' | 'agent_2' | 'door'

export const DESK_POSITIONS: Record<DeskKey, { x: number; y: number }> = {
  ceo:     { x: 640, y: 420 },
  agent_0: { x: 360, y: 290 },
  agent_1: { x: 920, y: 290 },
  agent_2: { x: 360, y: 550 },
  door:    { x: 80,  y: 640 },
}

export const agentDeskKey = (index: number): DeskKey =>
  `agent_${Math.min(index, 2)}` as DeskKey

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

// ── Colours ────────────────────────────────────────────────────────────────

const C = {
  sky:        0xb8d4f0,
  skyNight:   0x1a2035,
  wallWarm:   0xede8dc,
  wallShadow: 0xd6cebc,
  floorOak:   0xc4956a,
  floorShadow:0xa87b52,
  floorLight: 0xd4a87a,
  deskNavy:   0x2c3e6b,
  deskMid:    0x3d5278,
  deskLight:  0x4d6288,
  rugWine:    0x8b2635,
  rugBorder:  0xf0c070,
  plant:      0x4a7c59,
  plantPot:   0xc4956a,
  book1:      0x4d7fff,
  book2:      0xff6b4d,
  book3:      0x4dffa0,
  book4:      0xf0c070,
  window:     0x2a4070,
  building:   0x1a2744,
  buildingLit:0xffb84d,
  lampIdle:   0xffb84d,
  lampWork:   0x4d7fff,
  lampDone:   0x4dffa0,
  lampBlock:  0xff6b4d,
  monitorBg:  0x0a0f1e,
  monitorGlow:0x4d7fff,
  ceilingRail:0xd6cebc,
}

// ── OfficeScene ────────────────────────────────────────────────────────────

export class OfficeScene {
  app!: PIXI.Application
  layers!: SceneLayers

  private camera   = { x: 640, y: 420, targetX: 640, targetY: 420 }
  private lampMap  = new Map<string, PIXI.Graphics>()
  private monitors = new Map<string, { screen: PIXI.Graphics; ticker?: PIXI.TickerCallback<unknown> }>()
  private resizeOb?: ResizeObserver
  private isNight  = false
  private timeOfDay = 0   // 0–1, animated slowly

  // ── Boot ──────────────────────────────────────────────────────

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new PIXI.Application()
    await this.app.init({
      canvas,
      width:           canvas.clientWidth  || window.innerWidth,
      height:          canvas.clientHeight || window.innerHeight,
      backgroundColor: C.wallWarm,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    })

    this.buildLayers()
    this.drawScene()
    this.startCameraLoop()
    this.startDayNightCycle()
    this.setupResize(canvas)
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

  // ── Full scene draw ────────────────────────────────────────────

  private drawScene(): void {
    const { width: W, height: H } = this.app.screen

    this.drawBackdrop(W, H)
    this.drawFloor(W, H)
    this.drawRug(W, H)
    this.drawBookshelf(W, H)
    this.drawPlant(120, H * 0.52, 'l')
    this.drawPlant(W - 120, H * 0.52, 'r')
    this.drawCeilingTrack(W, H)
    this.drawCeoDesk(W, H)
    this.drawAgentDesk('agent_0', W, H)
    this.drawAgentDesk('agent_1', W, H)
    this.drawAgentDesk('agent_2', W, H)
  }

  // ── Backdrop: walls + city window ─────────────────────────────

  private drawBackdrop(W: number, H: number): void {
    const l = this.layers.backdrop

    // Back wall — warm linen
    const wall = new PIXI.Graphics()
    wall.rect(0, 0, W, H * 0.55).fill({ color: C.wallWarm })
    l.addChild(wall)

    // Baseboard shadow at wall/floor join
    const baseboard = new PIXI.Graphics()
    baseboard.rect(0, H * 0.54, W, 6).fill({ color: C.wallShadow })
    l.addChild(baseboard)

    // Large window frame (centred, takes up 55% width)
    const frameX = W * 0.225
    const frameW = W * 0.55
    const frameY = H * 0.04
    const frameH = H * 0.44

    // Outer frame
    const frame = new PIXI.Graphics()
    frame.roundRect(frameX - 8, frameY - 8, frameW + 16, frameH + 16, 4)
      .fill({ color: C.deskNavy })
    l.addChild(frame)

    // Sky gradient (simple two-rect approximation)
    const sky = new PIXI.Graphics()
    sky.rect(frameX, frameY, frameW, frameH * 0.5).fill({ color: 0xc4dcf4 })
    sky.rect(frameX, frameY + frameH * 0.5, frameW, frameH * 0.5).fill({ color: C.sky })
    l.addChild(sky)

    // City skyline — staggered buildings
    this.drawCitySkyline(l, frameX, frameY, frameW, frameH)

    // Window cross-bars
    const bar = new PIXI.Graphics()
    bar.rect(frameX + frameW / 2 - 3, frameY, 6, frameH).fill({ color: C.deskNavy })
    bar.rect(frameX, frameY + frameH * 0.45 - 3, frameW, 6).fill({ color: C.deskNavy })
    l.addChild(bar)

    // Window glare stripe
    const glare = new PIXI.Graphics()
    glare.rect(frameX + 12, frameY + 10, 18, frameH - 20)
      .fill({ color: 0xffffff, alpha: 0.06 })
    l.addChild(glare)
  }

  private drawCitySkyline(
    target: PIXI.Container,
    fx: number, fy: number, fw: number, fh: number
  ): void {
    // Building specs: [relX, relWidth, relHeight, windows_cols, windows_rows]
    const buildings: Array<[number, number, number, number, number]> = [
      [0.00, 0.12, 0.70, 2, 5],
      [0.11, 0.10, 0.55, 2, 4],
      [0.20, 0.14, 0.80, 3, 6],
      [0.33, 0.09, 0.50, 2, 3],
      [0.41, 0.16, 0.90, 3, 7],
      [0.56, 0.11, 0.60, 2, 4],
      [0.66, 0.13, 0.75, 3, 5],
      [0.78, 0.10, 0.45, 2, 3],
      [0.87, 0.14, 0.65, 3, 5],
    ]

    for (const [rx, rw, rh, wc, wr] of buildings) {
      const bx = fx + fw * rx
      const bw = fw * rw
      const bh = fh * rh * 0.85
      const by = fy + fh - bh

      const bldg = new PIXI.Graphics()
      bldg.rect(bx, by, bw, bh).fill({ color: C.building })
      target.addChild(bldg)

      // Windows — random lit/unlit
      const winW = (bw - 6) / wc - 3
      const winH = (bh * 0.7) / wr - 4
      for (let row = 0; row < wr; row++) {
        for (let col = 0; col < wc; col++) {
          const lit = Math.random() > 0.45
          const win = new PIXI.Graphics()
          win.rect(
            bx + 4 + col * (winW + 3),
            by + 8 + row * (winH + 4),
            winW, winH
          ).fill({ color: lit ? C.buildingLit : 0x0d1526, alpha: lit ? 0.9 : 1 })
          target.addChild(win)
        }
      }
    }
  }

  // ── Isometric floor ───────────────────────────────────────────

  private drawFloor(W: number, H: number): void {
    const l = this.layers.floor
    const floorY = H * 0.54

    // Main floor plane
    const floor = new PIXI.Graphics()
    floor.rect(0, floorY, W, H - floorY).fill({ color: C.floorOak })
    l.addChild(floor)

    // Plank lines (horizontal) — isometric feel
    for (let i = 0; i < 8; i++) {
      const y = floorY + (H - floorY) * (i / 8)
      const plank = new PIXI.Graphics()
      plank.rect(0, y, W, 1.5).fill({ color: C.floorShadow, alpha: 0.35 })
      l.addChild(plank)
    }

    // Plank lines (diagonal) — simplified
    for (let i = -4; i < 12; i++) {
      const diag = new PIXI.Graphics()
      const x0 = (W / 8) * i
      diag.moveTo(x0, floorY)
        .lineTo(x0 + W * 0.4, H)
        .stroke({ color: C.floorShadow, width: 1, alpha: 0.15 })
      l.addChild(diag)
    }

    // Near-edge floor highlight
    const highlight = new PIXI.Graphics()
    highlight.rect(0, H - 40, W, 40).fill({ color: C.floorLight, alpha: 0.3 })
    l.addChild(highlight)
  }

  // ── Rug ───────────────────────────────────────────────────────

  private drawRug(W: number, H: number): void {
    const cx = W / 2
    const cy = H * 0.70
    const rw = W * 0.42
    const rh = H * 0.22

    const rug = new PIXI.Graphics()
    // Outer border
    rug.ellipse(cx, cy, rw / 2 + 8, rh / 2 + 6).fill({ color: C.rugBorder, alpha: 0.9 })
    // Main rug
    rug.ellipse(cx, cy, rw / 2, rh / 2).fill({ color: C.rugWine, alpha: 0.85 })
    // Inner pattern ring
    rug.ellipse(cx, cy, rw / 2 - 16, rh / 2 - 10)
      .stroke({ color: C.rugBorder, width: 2, alpha: 0.5 })
    this.layers.furniture.addChild(rug)
  }

  // ── Bookshelf ─────────────────────────────────────────────────

  private drawBookshelf(W: number, H: number): void {
    const x = 24
    const y = H * 0.38
    const sw = 80
    const sh = H * 0.18

    const shelf = new PIXI.Graphics()
    // Back panel
    shelf.rect(x, y, sw, sh).fill({ color: C.deskNavy })
    // Shelves
    const numShelves = 3
    for (let i = 0; i <= numShelves; i++) {
      shelf.rect(x, y + (sh / numShelves) * i, sw, 4).fill({ color: C.deskMid })
    }

    // Books on each shelf
    const bookColors = [C.book1, C.book2, C.book3, C.book4]
    for (let s = 0; s < numShelves; s++) {
      let bx = x + 3
      const by = y + (sh / numShelves) * s + 5
      const bh = sh / numShelves - 10
      while (bx < x + sw - 3) {
        const bw = 6 + Math.floor(Math.random() * 6)
        const col = bookColors[Math.floor(Math.random() * bookColors.length)]
        shelf.rect(bx, by, bw, bh).fill({ color: col, alpha: 0.9 })
        bx += bw + 1
      }
    }

    this.layers.furniture.addChild(shelf)
  }

  // ── Plants ────────────────────────────────────────────────────

  private drawPlant(x: number, y: number, _side: 'l' | 'r'): void {
    const g = new PIXI.Graphics()

    // Pot
    g.roundRect(x - 14, y - 10, 28, 22, 3).fill({ color: C.plantPot })
    g.roundRect(x - 11, y - 12, 22, 4, 2).fill({ color: C.floorShadow })

    // Stem
    g.moveTo(x, y - 10).lineTo(x, y - 42)
      .stroke({ color: C.plant, width: 3, cap: 'round' })

    // Leaf clusters — 5 teardrop-ish circles
    const leaves: Array<[number, number, number]> = [
      [-18, -50, 14], [12, -48, 12], [-10, -62, 10],
      [6,  -65, 9],  [0,  -72, 8],
    ]
    for (const [lx, ly, r] of leaves) {
      g.circle(x + lx, y + ly, r).fill({ color: C.plant, alpha: 0.85 })
    }

    this.layers.furniture.addChild(g)
  }

  // ── Ceiling track (ambient light strip) ───────────────────────

  private drawCeilingTrack(W: number, H: number): void {
    const g = new PIXI.Graphics()
    // Track rail
    g.rect(W * 0.15, H * 0.01, W * 0.70, 5).fill({ color: C.ceilingRail })
    // Light pendants
    const pendantCount = 4
    for (let i = 0; i < pendantCount; i++) {
      const px = W * 0.15 + (W * 0.70 / (pendantCount - 1)) * i
      g.rect(px - 1, H * 0.01, 2, 18).fill({ color: C.wallShadow })
      g.circle(px, H * 0.01 + 24, 8).fill({ color: 0xfff8e8, alpha: 0.9 })
      // Glow halo
      g.circle(px, H * 0.01 + 24, 18).fill({ color: 0xfff8e8, alpha: 0.08 })
    }
    this.layers.backdrop.addChild(g)
  }

  // ── CEO desk ──────────────────────────────────────────────────

  private drawCeoDesk(W: number, H: number): void {
    const pos  = DESK_POSITIONS.ceo
    const dw   = 140
    const dh   = 58
    const depth = 16

    const g = new PIXI.Graphics()

    // Top face
    g.roundRect(pos.x - dw / 2, pos.y - dh / 2, dw, dh, 5)
      .fill({ color: C.deskNavy })

    // Front face (depth illusion)
    g.rect(pos.x - dw / 2, pos.y + dh / 2, dw, depth)
      .fill({ color: C.deskMid })

    // Drawer line
    g.rect(pos.x - dw / 2 + 8, pos.y + dh / 2 + 4, dw - 16, 2)
      .fill({ color: C.deskLight, alpha: 0.4 })

    // Brass handle
    g.circle(pos.x, pos.y + dh / 2 + 8, 4).fill({ color: C.rugBorder })

    this.layers.furniture.addChild(g)

    // Monitor
    this.drawMonitor('ceo', pos.x, pos.y - dh / 2 - 2)

    // Lamp
    this.drawDeskLamp('ceo', pos.x + dw / 2 - 18, pos.y - dh / 2 + 8)
  }

  // ── Agent desk (smaller, standard) ───────────────────────────

  private drawAgentDesk(key: DeskKey, _W: number, _H: number): void {
    const pos = DESK_POSITIONS[key]
    const dw  = 110
    const dh  = 50
    const depth = 13

    const g = new PIXI.Graphics()

    // Top
    g.roundRect(pos.x - dw / 2, pos.y - dh / 2, dw, dh, 4)
      .fill({ color: C.deskMid })

    // Front face
    g.rect(pos.x - dw / 2, pos.y + dh / 2, dw, depth)
      .fill({ color: C.deskLight })

    this.layers.furniture.addChild(g)

    // Monitor
    this.drawMonitor(key, pos.x, pos.y - dh / 2 - 2)

    // Lamp
    this.drawDeskLamp(key, pos.x + dw / 2 - 14, pos.y - dh / 2 + 6)
  }

  // ── Monitor ───────────────────────────────────────────────────

  private drawMonitor(deskKey: string, cx: number, baseY: number): void {
    const mw = 56
    const mh = 38
    const g  = new PIXI.Graphics()

    // Stand
    g.rect(cx - 3, baseY - 10, 6, 12).fill({ color: C.deskNavy })
    g.roundRect(cx - 10, baseY - 11, 20, 4, 2).fill({ color: C.deskNavy })

    // Bezel
    g.roundRect(cx - mw / 2 - 3, baseY - mh - 12, mw + 6, mh + 6, 3)
      .fill({ color: 0x0d1220 })

    // Screen
    const screen = new PIXI.Graphics()
    screen.roundRect(cx - mw / 2, baseY - mh - 10, mw, mh, 2)
      .fill({ color: C.monitorBg })

    // Idle scan-lines
    for (let i = 0; i < 5; i++) {
      screen.rect(cx - mw / 2 + 4, baseY - mh - 10 + 6 + i * 6, mw - 8, 1)
        .fill({ color: C.monitorGlow, alpha: 0.15 })
    }

    this.layers.furniture.addChild(g)
    this.layers.monitors.addChild(screen)
    this.monitors.set(deskKey, { screen })
  }

  // ── Desk lamp + glow ─────────────────────────────────────────

  private drawDeskLamp(deskKey: string, x: number, y: number): void {
    const base = new PIXI.Graphics()
    // Stem
    base.moveTo(x, y).lineTo(x - 2, y - 20)
      .stroke({ color: C.deskNavy, width: 2.5, cap: 'round' })
    // Shade
    base.moveTo(x - 2, y - 20)
      .lineTo(x - 14, y - 26)
      .lineTo(x + 6, y - 26)
      .closePath()
      .fill({ color: C.deskNavy })
    this.layers.lamps.addChild(base)

    // Glow disc (colour-coded by state)
    const glow = new PIXI.Graphics()
    glow.circle(x - 2, y - 24, 10).fill({ color: C.lampIdle, alpha: 0.75 })
    this.layers.lamps.addChild(glow)
    this.lampMap.set(deskKey, glow)
  }

  // ── Lamp state API ────────────────────────────────────────────

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
    // Outer halo
    glow.circle(0, 0, r + 8).fill({ color, alpha: 0.14 })
  }

  // ── Monitor animation API ─────────────────────────────────────

  setMonitorWorking(deskKey: string, working: boolean): void {
    const mon = this.monitors.get(deskKey)
    if (!mon) return

    if (mon.ticker) {
      this.app.ticker.remove(mon.ticker as PIXI.TickerCallback<unknown>)
      mon.ticker = undefined
    }

    if (!working) {
      mon.screen.tint = 0xffffff
      return
    }

    // Animated scan-line sweep while working
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

  // ── Camera ────────────────────────────────────────────────────

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

  // ── Day / night cycle ─────────────────────────────────────────

  private startDayNightCycle(): void {
    this.app.ticker.add(() => {
      this.timeOfDay = (this.timeOfDay + 0.0003) % 1
      const night = this.timeOfDay > 0.5

      if (night !== this.isNight) {
        this.isNight = night
        // Tint the backdrop subtly for night
        this.layers.backdrop.tint = night ? 0xaab0c8 : 0xffffff
      }
    })
  }

  // ── Resize ────────────────────────────────────────────────────

  private setupResize(canvas: HTMLCanvasElement): void {
    this.resizeOb = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      this.app.renderer.resize(w, h)
      // Redraw static layers
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
    this.monitors.forEach(m => {
      if (m.ticker) this.app.ticker.remove(m.ticker as PIXI.TickerCallback<unknown>)
    })
    this.app.destroy(true)
  }
}
