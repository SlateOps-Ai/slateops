'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  text:        string
  className?:  string
  /**
   * Total target duration in ms for the writing animation. The per-char
   * speed scales so short messages don't feel painful slow and long
   * messages don't take forever. Default ~1800ms total cap.
   */
  maxDurationMs?: number
  /** Skip animation; render text statically. */
  disabled?:   boolean
  /** Fires once the typewriter finishes. */
  onComplete?: () => void
}

/**
 * SlateText — typewriter "writing on a slate" effect.
 *
 * Reveals `text` one character at a time on first mount. A subtle caret
 * blinks at the cursor position during writing and disappears when done.
 * Re-renders that change `text` restart the animation; static unmounts
 * never re-animate.
 */
export function SlateText({
  text,
  className,
  maxDurationMs = 1800,
  disabled,
  onComplete,
}: Props) {
  const [shown, setShown] = useState(disabled ? text.length : 0)
  const [done,  setDone]  = useState(!!disabled)

  useEffect(() => {
    if (disabled) {
      setShown(text.length); setDone(true)
      return
    }
    setShown(0); setDone(false)

    const total = text.length
    if (total === 0) { setDone(true); return }

    // Cap per-char speed between 8ms (fast) and 35ms (snappy but visible).
    const perChar = Math.max(8, Math.min(35, maxDurationMs / total))
    let i = 0
    const id = setInterval(() => {
      i++
      setShown(i)
      if (i >= total) {
        clearInterval(id)
        setDone(true)
        onComplete?.()
      }
    }, perChar)
    return () => clearInterval(id)
  // We intentionally key off the text identity — different strings restart.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, disabled])

  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {text.slice(0, shown)}
      {!done && (
        <span
          aria-hidden
          className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-[1px] bg-current opacity-80 animate-pulse"
          style={{ animationDuration: '0.7s' }}
        />
      )}
    </span>
  )
}
