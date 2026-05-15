'use client'

import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

export function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  function onMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const baseX  = offset.x
    const baseY  = offset.y
    const onMove = (ev: MouseEvent) => setOffset({ x: baseX + (ev.clientX - startX), y: baseY + (ev.clientY - startY) })
    const onUp   = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  return { offset, onMouseDown, reset: () => setOffset({ x: 0, y: 0 }) }
}
