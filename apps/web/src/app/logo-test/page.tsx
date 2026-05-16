'use client'

import { useState } from 'react'
import { SlateCaretLogo } from '@/components/branding/SlateCaretLogo'
import { TeamTileLogo }   from '@/components/branding/TeamTileLogo'

const SIZES = [16, 24, 32, 48, 64, 96, 128, 192, 256]

const BACKGROUNDS = [
  { name: 'Dark navy (app)', bg: '#0d0f1a', text: 'text-white'      },
  { name: 'White',           bg: '#ffffff', text: 'text-[#0d0f1a]'  },
  { name: 'Slate gray',      bg: '#e5e7eb', text: 'text-[#0d0f1a]'  },
  { name: 'Amber field',     bg: '#FBBF24', text: 'text-[#0d0f1a]'  },
  { name: 'Blue field',      bg: '#4D7FFF', text: 'text-white'      },
]

type CaretVariant = 'amber' | 'blue' | 'white' | 'dark' | 'gradient'
type TileVariant  = 'blue'  | 'amber' | 'white' | 'dark'

export default function LogoTestPage() {
  const [caretVariant, setCaretVariant] = useState<CaretVariant>('amber')
  const [tileVariant,  setTileVariant]  = useState<TileVariant>('blue')
  const [animate,      setAnimate]      = useState(true)

  return (
    <div className="min-h-screen bg-[#0d1117] text-white p-10 antialiased">
      <header className="max-w-5xl mx-auto mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">SlateOps — Logo bake-off</h1>
        <p className="text-white/50 text-sm">
          Concept 1 (Slate Caret) vs Concept 3 (Team Tile Grid), every size, every background.
          The caret blinks; the tiles cycle. Toggle animation if it gets distracting.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
            Animate
          </label>
          <span className="opacity-30">·</span>
          <span className="opacity-50">Caret variant:</span>
          {(['amber','blue','white','dark','gradient'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setCaretVariant(v)}
              className={`px-2 py-0.5 rounded-md transition-colors ${caretVariant === v ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {v}
            </button>
          ))}
          <span className="opacity-30">·</span>
          <span className="opacity-50">Tile variant:</span>
          {(['blue','amber','white','dark'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setTileVariant(v)}
              className={`px-2 py-0.5 rounded-md transition-colors ${tileVariant === v ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-12">

        {/* Size ladder on dark — side-by-side */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Size ladder (on app navy)</h2>
          <div className="grid grid-cols-2 gap-8 rounded-2xl border border-white/[0.07] p-6 bg-[#0d0f1a]">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-amber-400/80 font-semibold mb-4">Concept 1 — Slate Caret</p>
              <div className="flex items-end flex-wrap gap-5">
                {SIZES.map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1">
                    <SlateCaretLogo size={s} variant={caretVariant} animate={animate} />
                    <span className="text-[9px] text-white/40">{s}px</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#4D7FFF] font-semibold mb-4">Concept 3 — Team Tile Grid</p>
              <div className="flex items-end flex-wrap gap-5">
                {SIZES.map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1">
                    <TeamTileLogo size={s} variant={tileVariant} animate={animate} />
                    <span className="text-[9px] text-white/40">{s}px</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Hero — big side-by-side with wordmark */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Hero lockup with wordmark</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/[0.07] p-8 bg-[#0d0f1a]">
              <div className="flex items-center gap-5">
                <SlateCaretLogo size={96} variant={caretVariant} animate={animate} />
                <Wordmark />
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] p-8 bg-[#0d0f1a]">
              <div className="flex items-center gap-5">
                <TeamTileLogo size={96} variant={tileVariant} animate={animate} />
                <Wordmark />
              </div>
            </div>
          </div>
        </section>

        {/* Background grid */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Across backgrounds</h2>
          <div className="grid grid-cols-5 gap-3">
            {BACKGROUNDS.map((b) => (
              <div key={b.name}>
                <div className="rounded-xl p-6 flex flex-col items-center gap-4" style={{ background: b.bg }}>
                  <SlateCaretLogo size={56} variant={caretVariant} animate={animate} />
                  <TeamTileLogo size={56} variant={tileVariant} animate={animate} />
                </div>
                <p className="text-[10px] text-white/40 text-center mt-2">{b.name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Favicon-only quick test */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Favicon stress test (16/24/32px)</h2>
          <div className="grid grid-cols-2 gap-6">
            <FaviconStrip label="Concept 1">
              <SlateCaretLogo size={16} variant={caretVariant} animate={animate} />
              <SlateCaretLogo size={24} variant={caretVariant} animate={animate} />
              <SlateCaretLogo size={32} variant={caretVariant} animate={animate} />
            </FaviconStrip>
            <FaviconStrip label="Concept 3">
              <TeamTileLogo size={16} variant={tileVariant} animate={animate} />
              <TeamTileLogo size={24} variant={tileVariant} animate={animate} />
              <TeamTileLogo size={32} variant={tileVariant} animate={animate} />
            </FaviconStrip>
          </div>
        </section>

      </main>
    </div>
  )
}

function Wordmark() {
  return (
    <p className="text-[44px] font-bold tracking-tight leading-none text-white flex items-baseline">
      <span>slate</span>
      <span
        aria-hidden
        className="inline-block w-[3px] mx-[5px] bg-amber-400 rounded-[1.5px] animate-pulse"
        style={{ animationDuration: '0.7s', height: '0.95em', transform: 'translateY(0.18em)' }}
      />
      <span>ops</span>
    </p>
  )
}

function FaviconStrip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-5 bg-[#12172b]">
      <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold mb-3">{label}</p>
      <div className="flex items-end gap-5">{children}</div>
    </div>
  )
}
