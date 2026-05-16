'use client'

import { cn } from '@/lib/utils'

interface Props {
  size?:    number
  /** Color treatment. Default `amber` matches the SlateOps authority palette. */
  variant?: 'amber' | 'blue' | 'white' | 'dark' | 'gradient'
  /** Blink the caret. Off for static placements like print/social PNGs. */
  animate?: boolean
  /** Optional className for positioning the host. */
  className?: string
}

/**
 * SlateCaretLogo — Concept 1.
 *
 * A rounded amber slate tile with a vertical white caret cursor inside.
 * The caret blinks at the SlateText typewriter cadence (~700ms), so the
 * favicon literally pulses the brand's product moment. Pure SVG, no raster.
 */
export function SlateCaretLogo({
  size      = 64,
  variant   = 'amber',
  animate   = true,
  className,
}: Props) {
  const palette = {
    amber: { tile: '#FBBF24', caret: '#FFFFFF', stroke: 'none' },
    blue:  { tile: '#4D7FFF', caret: '#FFFFFF', stroke: 'none' },
    white: { tile: '#FFFFFF', caret: '#0d0f1a', stroke: 'none' },
    dark:  { tile: '#0d0f1a', caret: '#FBBF24', stroke: 'rgba(255,255,255,0.08)' },
    gradient: { tile: 'url(#slate-grad)', caret: '#FFFFFF', stroke: 'none' },
  } as const

  const c = palette[variant]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-label="SlateOps"
    >
      {variant === 'gradient' && (
        <defs>
          <linearGradient id="slate-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#4D7FFF" />
          </linearGradient>
        </defs>
      )}
      <rect
        x="0" y="0" width="100" height="100" rx="22"
        fill={c.tile}
        stroke={c.stroke}
        strokeWidth={c.stroke === 'none' ? 0 : 1}
      />
      {/* Caret — centered, 16% wide, 56% tall, gentle round caps */}
      <rect
        x="42" y="22" width="16" height="56" rx="3"
        fill={c.caret}
      >
        {animate && (
          <animate
            attributeName="opacity"
            values="1;1;0.15;0.15;1"
            keyTimes="0;0.45;0.55;0.95;1"
            dur="0.9s"
            repeatCount="indefinite"
          />
        )}
      </rect>
    </svg>
  )
}
