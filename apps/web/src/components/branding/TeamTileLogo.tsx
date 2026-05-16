'use client'

import { cn } from '@/lib/utils'

interface Props {
  size?:    number
  /** Color treatment. Default `blue` matches the SlateOps capability palette. */
  variant?: 'blue' | 'amber' | 'white' | 'dark'
  /** Animate the "active agent" cycling between tiles. */
  animate?: boolean
  className?: string
}

/**
 * TeamTileLogo — Concept 3.
 *
 * Three rounded tiles in a 2×2 grid (TL, TR, BL). Each cycles being the
 * "active agent" — bright for ⅓ of the loop, dim for the other ⅔. The
 * staggered animation tells the team-of-agents story at a glance.
 */
export function TeamTileLogo({
  size    = 64,
  variant = 'blue',
  animate = true,
  className,
}: Props) {
  const palette = {
    blue:  '#4D7FFF',
    amber: '#FBBF24',
    white: '#FFFFFF',
    dark:  '#0d0f1a',
  } as const

  const fill = palette[variant]

  // Each tile spends ~⅓ of the cycle at full opacity, ~⅔ dim.
  // 4 values map to 4 evenly-spaced keyTimes across the loop.
  // Phase = which slot the tile lights up in.
  function tileFrames(phase: 0 | 1 | 2): string {
    return [0, 1, 2].map((slot) => (slot === phase ? '1' : '0.32')).concat(['0.32']).join(';')
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-label="SlateOps"
    >
      {/* Top-left tile — phase 0 (lights first) */}
      <rect x="8" y="8" width="38" height="38" rx="9" fill={fill} opacity="1">
        {animate && <animate attributeName="opacity" values={tileFrames(0)} dur="3s" repeatCount="indefinite" />}
      </rect>
      {/* Top-right tile — phase 1 */}
      <rect x="54" y="8" width="38" height="38" rx="9" fill={fill} opacity="0.32">
        {animate && <animate attributeName="opacity" values={tileFrames(1)} dur="3s" repeatCount="indefinite" />}
      </rect>
      {/* Bottom-left tile — phase 2 */}
      <rect x="8" y="54" width="38" height="38" rx="9" fill={fill} opacity="0.32">
        {animate && <animate attributeName="opacity" values={tileFrames(2)} dur="3s" repeatCount="indefinite" />}
      </rect>
    </svg>
  )
}
