'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: 'How long does a typical review take? Will the queue become a bottleneck?',
    a: 'Most approvals take under 30 seconds — the notification arrives instantly via app, email, or mobile push, and the reviewer sees exactly what the AI is proposing to do with one tap to approve or reject. In practice, the queue does not back up because reviews are designed to be fast by default. If your team runs high-volume AI actions, you can configure auto-approval rules for low-risk action types, reserving human review for decisions that carry real consequence.',
  },
  {
    q: 'Can we assign different reviewers for different types of AI actions?',
    a: 'Yes. Approval chains are fully configurable by action type, agent, or team. A bulk outreach email might route to your Head of Sales for approval; a financial transaction might require your CFO. You can set primary reviewers, fallback reviewers, and escalation paths — so the right person is always on the hook for the right decision, and no approval ever goes unrouted.',
  },
  {
    q: "If a reviewer rejects an action, what happens? Can it be re-queued?",
    a: "Rejected actions are archived with the reviewer's decision and any note they added — creating a permanent record of what was stopped and why. The AI can be instructed to resubmit a revised action for a second review, or a team member can manually adjust the parameters and re-queue. Nothing is lost and nothing is silently retried. Every outcome — approved or rejected — is logged and searchable.",
  },
  {
    q: 'Is SlateOps built for enterprise, or does it work for smaller ops teams too?',
    a: 'Both. Smaller ops teams typically have fewer reviewers and simpler approval chains — SlateOps handles that with a single-reviewer setup out of the box. Enterprise teams get role-based access controls, multi-level approval chains, SOC 2-compatible audit logs, and API access for integration with existing workflows. The gate scales with you. You are not buying enterprise complexity upfront — you grow into it.',
  },
  {
    q: 'What about AI actions that need to execute instantly with no delay tolerance?',
    a: "For genuinely time-sensitive actions — say, a real-time API response or a live chat reply — you can designate those action types as auto-approved with post-execution logging rather than pre-execution review. This is a deliberate configuration you make, not a default. The point is that every action is accounted for: either a human approved it before execution, or your team has explicitly said this category runs automatically. No action is simply untracked.",
  },
]

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      {FAQS.map((faq, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start gap-4 px-6 py-5 text-left"
          >
            <span className="flex-1 text-white text-sm font-medium leading-snug">{faq.q}</span>
            <ChevronDown
              size={16}
              className={`text-[#4D7FFF] shrink-0 mt-0.5 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}
            />
          </button>
          {open === i && (
            <div className="px-6 pb-5">
              <p className="text-[#8892B0] text-sm leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
