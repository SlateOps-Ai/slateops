'use client'

import { motion } from 'framer-motion'
import { useEffect, useId, useRef } from 'react'

interface Props {
  fromX:       number
  fromY:       number
  toX:         number
  toY:         number
  onComplete?: () => void
}

// Animation timing — total ≈ 2.1s, then the parent unmounts on `onComplete`.
const DRAW_MS   = 700   // path draws in
const TRAVEL_MS = 1000  // token rides the curve
const FADE_MS   = 400   // path fades out after the token lands

/**
 * HandoffPath — animated SVG curve drawn between two screen coordinates,
 * with a small glowing token that "rides" the curve. Renders fixed to the
 * viewport so it sits above the office canvas avatars but below modal UI.
 *
 * Positions are captured at mount and not tracked thereafter — if an agent
 * is dragged mid-animation, the path stays anchored to where the handoff
 * began. Acceptable tradeoff for a brief delight moment.
 */
export function HandoffPath({ fromX, fromY, toX, toY, onComplete }: Props) {
  const fired = useRef(false)
  const gradId = useId()

  useEffect(() => {
    const t = setTimeout(() => {
      if (fired.current) return
      fired.current = true
      onComplete?.()
    }, DRAW_MS + TRAVEL_MS + FADE_MS + 50)
    return () => clearTimeout(t)
  }, [onComplete])

  // Quadratic bezier control point: arc upward proportionally to distance
  const dist = Math.hypot(toX - fromX, toY - fromY)
  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2 - Math.max(70, dist * 0.28)
  const path = `M ${fromX},${fromY} Q ${midX},${midY} ${toX},${toY}`

  return (
    <svg
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{ width: '100vw', height: '100vh', overflow: 'visible', zIndex: 25 }}
    >
      <defs>
        <linearGradient
          id={gradId}
          x1={fromX} y1={fromY}
          x2={toX}   y2={toY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor="rgba(125, 152, 255, 0)" />
          <stop offset="15%"  stopColor="rgba(125, 152, 255, 0.65)" />
          <stop offset="85%"  stopColor="rgba(125, 152, 255, 0.65)" />
          <stop offset="100%" stopColor="rgba(125, 152, 255, 0)" />
        </linearGradient>
      </defs>

      {/* Drawn path */}
      <motion.path
        d={path}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={2}
        strokeDasharray="6 6"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0.95 }}
        animate={{ pathLength: 1, opacity: 0 }}
        transition={{
          pathLength: { duration: DRAW_MS / 1000, ease: 'easeOut' },
          opacity:    { duration: FADE_MS / 1000, delay: (DRAW_MS + TRAVEL_MS) / 1000 },
        }}
      />

      {/* Outer glow — soft halo following the token */}
      <circle r={10} fill="rgba(125, 152, 255, 0.22)">
        <animateMotion
          dur={`${TRAVEL_MS}ms`}
          begin={`${DRAW_MS}ms`}
          path={path}
          fill="freeze"
        />
      </circle>

      {/* Inner traveling token */}
      <circle r={4.5} fill="rgba(196, 213, 255, 0.95)">
        <animateMotion
          dur={`${TRAVEL_MS}ms`}
          begin={`${DRAW_MS}ms`}
          path={path}
          fill="freeze"
        />
      </circle>
    </svg>
  )
}
