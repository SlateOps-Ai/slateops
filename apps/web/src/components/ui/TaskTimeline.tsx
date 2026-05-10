'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@agentcity/types'

const STATUS_COLOR: Record<string, string> = {
  COMPLETE:    'bg-lamp-done/20 text-lamp-done border-lamp-done/30',
  IN_PROGRESS: 'bg-lamp-working/20 text-lamp-working border-lamp-working/30',
  FAILED:      'bg-lamp-blocked/20 text-lamp-blocked border-lamp-blocked/30',
  PENDING:     'bg-white/5 text-panel-muted border-white/10',
}

export function TaskTimeline() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tasks?limit=8`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks ?? []))
      .catch(() => {})
  }, [])

  if (!tasks.length) return null

  return (
    <div className="absolute bottom-4 left-4 right-60 z-20">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap',
              STATUS_COLOR[task.status] ?? STATUS_COLOR.PENDING
            )}
          >
            {task.title}
          </div>
        ))}
      </div>
    </div>
  )
}
