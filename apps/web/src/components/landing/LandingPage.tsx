import Link from 'next/link'
import { Youtube, Facebook, Linkedin } from 'lucide-react'
import { SlateCaretLogo } from '@/components/branding/SlateCaretLogo'
import { FaqAccordion } from './FaqAccordion'

/** Official X brand mark — Lucide still ships the legacy Twitter bird,
 *  so we inline the current X glyph. Accepts the same `size` + `strokeWidth`
 *  prop shape as Lucide icons (strokeWidth ignored — X is a filled path)
 *  so it drops into the SOCIALS map unchanged. */
function XLogo({ size = 16 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

// Social URLs. X and LinkedIn point to the real accounts; YouTube and
// Facebook are still placeholders — swap once those handles are live.
const SOCIALS = [
  { label: 'X',        href: 'https://x.com/SlateOps',                              Icon: XLogo    },
  { label: 'YouTube',  href: 'https://youtube.com/@slateops',                       Icon: Youtube  },
  { label: 'Facebook', href: 'https://facebook.com/slateops',                       Icon: Facebook },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/slate-ops-57474240a',     Icon: Linkedin },
]

/** Brand lockup — the caret icon + "slate|ops" wordmark with a blinking
 *  amber caret divider. Sizes are configurable so the same component
 *  serves the bold marketing nav and the smaller footer. */
function SlateOpsLockup({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const iconSize  = size === 'lg' ? 40 : size === 'sm' ? 22 : 30
  const wordClass = size === 'lg' ? 'text-[24px]' : size === 'sm' ? 'text-[16px]' : 'text-[20px]'
  const caretW    = size === 'lg' ? 'w-[4px]'    : size === 'sm' ? 'w-[2px]'    : 'w-[3px]'
  const caretMx   = size === 'lg' ? 'mx-[4px]'   : size === 'sm' ? 'mx-[2px]'   : 'mx-[3px]'
  const gap       = size === 'lg' ? 'gap-4'      : size === 'sm' ? 'gap-2'      : 'gap-3'
  return (
    <span className={`flex items-center ${gap}`}>
      <SlateCaretLogo size={iconSize} variant="amber" />
      <span className={`${wordClass} font-bold text-white tracking-tight flex items-baseline`}>
        <span>slate</span>
        <span
          aria-hidden
          className={`inline-block ${caretW} ${caretMx} bg-amber-400 rounded-[1.5px] animate-pulse`}
          style={{ animationDuration: '0.7s', height: '0.95em', transform: 'translateY(0.18em)' }}
        />
        <span>ops</span>
      </span>
    </span>
  )
}

// ─── Design tokens ────────────────────────────────────────────────────────────
// bg:   #0d1117  (dark navy)
// card: #12172b  (slightly lighter panel)
// accent: #4D7FFF (blue)
// green: #4DFFA0
// amber: #FFB84D
// muted: #8892B0

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white font-sans antialiased">

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0d1117]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="SlateOps home" className="hover:opacity-90 transition-opacity">
            <SlateOpsLockup size="md" />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-[#8892B0] text-sm hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 rounded-xl bg-[#4D7FFF] text-white text-sm font-semibold hover:bg-[#3d6fee] transition-colors"
            >
              Get Control — Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── SECTION 1: HERO ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-32 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-[#4D7FFF]/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4D7FFF]/10 border border-[#4D7FFF]/20 text-[#4D7FFF] text-xs font-semibold mb-8 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4D7FFF] animate-pulse" />
            AI Workforce Platform
          </div>

          <h1 className="text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
            Stop Unchecked AI.<br />
            <span className="text-[#4D7FFF]">Every Action Needs Your Sign-Off.</span>
          </h1>

          <p className="text-xl text-[#8892B0] max-w-2xl mx-auto mb-10 leading-relaxed">
            Before any AI-generated action reaches the real world, a human reviews it.
            One click to approve or reject. Fully logged. That is how SlateOps works — and no other platform offers it.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/sign-up"
              className="px-8 py-4 rounded-2xl bg-[#4D7FFF] text-white font-bold text-base hover:bg-[#3d6fee] transition-all shadow-lg shadow-[#4D7FFF]/25 w-full sm:w-auto text-center"
            >
              Get Control — Free Trial
            </Link>
            <Link
              href="/sign-in"
              className="px-8 py-4 rounded-2xl border border-white/10 text-white font-semibold text-base hover:bg-white/5 transition-colors w-full sm:w-auto text-center"
            >
              See the Gate in Action
            </Link>
          </div>

          <p className="text-[#8892B0] text-sm">
            Trusted by 200+ ops teams · No AI-caused customer incidents reported · Setup in under 10 minutes
          </p>

          {/* Hero visual — Approval Gate illustration */}
          <div className="mt-16 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-white/[0.08] bg-[#12172b]/80 p-6 text-left">
              <div className="text-[10px] text-[#8892B0] uppercase tracking-widest mb-4 font-semibold">
                CEO Cockpit — Pending Review Queue
              </div>
              <div className="space-y-3">
                {[
                  { action: 'Send bulk email to 12,400 customers', agent: 'Marketing Agent', type: 'email', risk: 'High' },
                  { action: 'Update pricing in Stripe for 3 plans', agent: 'Ops Coordinator', type: 'billing', risk: 'Critical' },
                  { action: 'Post LinkedIn update on company page', agent: 'Content Writer', type: 'social', risk: 'Medium' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-8 h-8 rounded-lg bg-[#FFB84D]/15 border border-[#FFB84D]/30 flex items-center justify-center shrink-0">
                      <span className="text-sm">⏳</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{item.action}</p>
                      <p className="text-[#8892B0] text-[10px] mt-0.5">{item.agent}</p>
                    </div>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                      item.risk === 'Critical' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                      item.risk === 'High'     ? 'bg-amber-400/10 border-amber-400/30 text-amber-400' :
                                                 'bg-blue-400/10 border-blue-400/30 text-blue-400'
                    }`}>{item.risk}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <div className="px-3 py-1 rounded-lg bg-[#4DFFA0]/15 border border-[#4DFFA0]/30 text-[#4DFFA0] text-[10px] font-semibold">Approve</div>
                      <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[#8892B0] text-[10px]">Reject</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-[#8892B0]">
                <span>3 actions pending your review</span>
                <span className="text-[#4DFFA0]">● Live</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: THE PROBLEM ────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">
            The Problem With AI Workforce Platforms Today
          </p>
          <h2 className="text-4xl font-bold mb-8 leading-tight max-w-3xl">
            Your AI Is Running Unsupervised.<br />
            <span className="text-[#FF6B4D]">You Just Don't Know What It's About to Do.</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: '📧',
                title: 'Customer-Facing Errors',
                body: 'One wrong AI email to your entire list. One outdated price sent to 8,000 prospects. One auto-reply that contradicts your legal team\'s last guidance. By the time you find out, the damage is already in someone\'s inbox.',
              },
              {
                icon: '⚖️',
                title: 'Compliance Exposure',
                body: 'Regulators do not accept "the AI did it." Every automated decision without a documented human checkpoint is a liability. Post-hoc logs tell you what happened after the fact — that is not a control, that is a timeline of your mistakes.',
              },
              {
                icon: '🔥',
                title: 'Internal Trust Collapse',
                body: 'The moment your team stops trusting AI output — and they will, after one bad incident — they stop using it. The efficiency gains evaporate. You\'ve spent six months onboarding a tool your team now routes around.',
              },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/[0.07] bg-[#12172b]/60 p-6">
                <span className="text-3xl mb-4 block">{card.icon}</span>
                <h3 className="text-white font-semibold text-sm mb-2">{card.title}</h3>
                <p className="text-[#8892B0] text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#FF6B4D]/20 bg-[#FF6B4D]/5 p-6">
            <p className="text-white text-base leading-relaxed">
              <strong className="text-[#FF6B4D]">What competitors offer instead:</strong> confidence scores that tell you a percentage, not a certainty. Post-hoc logs that tell you what went wrong after the damage is done. Autonomous execution that assumes the AI is always right.{' '}
              <strong>None of that stops a bad action from executing.</strong> They sold operators the steering wheel after removing the brakes.
            </p>
          </div>

          <p className="mt-8 text-[#8892B0] text-lg">
            There is one way to stop an AI error before it becomes your problem: <span className="text-white font-semibold">a gate before execution.</span>
          </p>
        </div>
      </section>

      {/* ── SECTION 3: THE SOLUTION ──────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-[#4D7FFF]/8 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">The Solution</p>
          <h2 className="text-4xl font-bold mb-6 leading-tight">
            The Human Review Gate.<br />
            <span className="text-[#4D7FFF]">Every AI Action Paused Until You Say Go.</span>
          </h2>

          <p className="text-[#8892B0] text-lg leading-relaxed mb-12 max-w-3xl">
            When an AI agent inside SlateOps prepares to take an action — send an email, update a record, post content, trigger a payment — that action enters a review queue before it executes. The right person on your team is notified instantly. They see exactly what the AI is about to do, with the full context. They approve or reject in one click. Approved actions run and are logged permanently. Rejected actions are archived with the reason. Nothing reaches the real world without a human sign-off.
          </p>

          {/* 3-step flow */}
          <div className="grid md:grid-cols-3 gap-4 mb-12">
            {[
              {
                step: '01',
                title: 'AI Generates an Action',
                body: 'Your agent completes its task and proposes an action — an email draft, a Stripe update, a social post, an API call. Instead of executing, it enters the queue.',
                color: 'text-[#8892B0]',
                border: 'border-white/[0.07]',
              },
              {
                step: '02',
                title: 'You Receive an Instant Alert',
                body: 'The right reviewer is notified via app, email, or mobile push. They see the action, the agent that generated it, the risk level, and a one-click approve or reject interface.',
                color: 'text-[#FFB84D]',
                border: 'border-[#FFB84D]/20',
                bg: 'bg-[#FFB84D]/5',
              },
              {
                step: '03',
                title: 'You Decide. It Executes.',
                body: 'Approve: the action runs immediately, fully logged with your name, timestamp, and decision. Reject: the action is archived. The AI is never unsupervised.',
                color: 'text-[#4DFFA0]',
                border: 'border-[#4DFFA0]/20',
                bg: 'bg-[#4DFFA0]/5',
              },
            ].map((s) => (
              <div key={s.step} className={`rounded-2xl border ${s.border} ${s.bg ?? 'bg-[#12172b]/60'} p-6`}>
                <p className={`text-3xl font-black mb-3 ${s.color}`}>{s.step}</p>
                <h3 className="text-white font-semibold text-sm mb-2">{s.title}</h3>
                <p className="text-[#8892B0] text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          {/* Speed reframe */}
          <div className="rounded-2xl border border-[#4D7FFF]/20 bg-[#4D7FFF]/5 p-6">
            <p className="text-white text-base leading-relaxed">
              <strong className="text-[#4D7FFF]">On friction:</strong> A 30-second approval is not a speed bump — it is the removal of a much larger one. Catching one misfired bulk email pre-execution saves four to six hours of customer service fallout, a damage-control all-hands, and at least one very uncomfortable conversation with the CMO. The gate is the fast path.
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: COMPETITIVE COMPARISON ───────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">Only SlateOps Has This</p>
          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Every Other Platform Runs AI Actions Blind.
          </h2>
          <p className="text-[#8892B0] text-lg mb-12 max-w-2xl">
            The market has had two years to build a pre-execution human checkpoint. None of them did. We did.
          </p>

          <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left px-6 py-4 text-[#8892B0] font-medium w-1/2">Capability</th>
                  <th className="text-center px-6 py-4 text-white font-bold">SlateOps</th>
                  <th className="text-center px-6 py-4 text-[#8892B0] font-medium">Other AI Platforms</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Pre-execution human approval gate',            '✓', '✗'],
                  ['Action review queue with assignable reviewers','✓', '✗'],
                  ['One-click approve / reject interface',         '✓', '✗'],
                  ['Full pre-execution audit trail',               '✓', 'Post-hoc logs only'],
                  ['Instant rollback on any approved action',      '✓', '✗'],
                  ['Role-based approval permissions',              '✓', '✗'],
                  ['Compliance-ready by design (SOC 2 compatible)','✓', 'Partial / manual'],
                  ['Mobile approval notifications',                '✓', '✗'],
                ].map(([cap, us, them], i) => (
                  <tr key={i} className={`border-b border-white/[0.05] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}>
                    <td className="px-6 py-4 text-[#8892B0]">{cap}</td>
                    <td className="px-6 py-4 text-center font-bold text-[#4DFFA0]">{us}</td>
                    <td className="px-6 py-4 text-center text-[#FF6B4D] text-sm">{them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-[#8892B0] text-sm text-center">
            Every competitor on this chart was given two years to build a pre-execution checkpoint.{' '}
            <span className="text-white">None of them built one.</span> Draw your own conclusions.
          </p>
        </div>
      </section>

      {/* ── SECTION 5: HOW IT ACTUALLY WORKS ────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05] bg-[#12172b]/40">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">How It Actually Works</p>
          <h2 className="text-4xl font-bold mb-12 leading-tight max-w-2xl">
            Move Fast. Miss Nothing. Clean Up Nothing.
          </h2>

          <div className="space-y-6">
            {[
              {
                n: '1',
                title: 'AI Queues the Action',
                body: 'Your agent completes its assigned task and stages the resulting action in the review queue — flagged with action type, risk level, and full context for the reviewer.',
                note: 'UI: Agent avatar with "Awaiting review" status, action card showing the proposed output.',
              },
              {
                n: '2',
                title: 'Reviewer Gets Notified — Instantly',
                body: 'The designated reviewer receives a push notification, email alert, or in-app prompt the moment the action is queued. No polling required. No checking dashboards. The alert finds them.',
                note: 'UI: Mobile push notification mock-up + in-app notification badge with clear "1 action needs your review" label.',
              },
              {
                n: '3',
                title: 'One Click to Decide',
                body: 'The reviewer sees the full action preview — the exact content, recipient, amount, or change the AI is proposing. They approve or reject in one click. Optional: add a note before submitting.',
                note: 'UI: Full-screen approval card with content preview, Approve (green) and Reject (neutral) buttons, optional text field.',
              },
              {
                n: '4',
                title: 'Everything Is Logged. Permanently.',
                body: 'Approved actions execute immediately and are recorded: who approved it, at what time, with what note. Rejected actions are archived with the same detail. Every decision survives a regulator\'s scrutiny.',
                note: 'UI: Audit log entry row — timestamp, reviewer name, action type, decision (Approved/Rejected), note excerpt.',
              },
            ].map((step) => (
              <div key={step.n} className="flex gap-6 rounded-2xl border border-white/[0.07] bg-[#12172b]/60 p-6">
                <div className="w-10 h-10 rounded-xl bg-[#4D7FFF]/15 border border-[#4D7FFF]/30 flex items-center justify-center shrink-0 font-black text-[#4D7FFF]">
                  {step.n}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">{step.title}</h3>
                  <p className="text-[#8892B0] text-sm leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-[#8892B0] text-sm">
            Most reviews take under 30 seconds — fast enough that it never becomes the bottleneck,
            slow enough that it stays intentional.
          </p>
        </div>
      </section>

      {/* ── SECTION 6: OBJECTION CRUSHER ────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">Common Objections</p>
          <h2 className="text-4xl font-bold mb-12 leading-tight">
            The Questions Every Ops Leader Asks Before They Buy.
          </h2>

          <div className="space-y-6">
            {[
              {
                objection: '"This will slow down our operations."',
                reality: 'One uncaught AI error costs you more time than 30 seconds costs you in a week. A misfired bulk email to 12,000 customers typically generates four to six hours of customer service response, an emergency comms review, and at least one exec debrief. The gate is not friction — it is the removal of a much larger friction that was hiding downstream. Teams that adopt SlateOps do not slow down. They stop spending time cleaning up.',
              },
              {
                objection: '"What if no one is at their desk when approval is needed?"',
                reality: 'SlateOps is designed for real-world ops teams, not ideal conditions. Approval notifications reach reviewers via mobile push, email, and in-app — wherever they are. You can configure fallback reviewers and escalation chains, so if the primary reviewer does not respond within a set window, the action escalates automatically. Actions can also be configured with time-bounded auto-approval for low-risk types — you decide the threshold, not the AI.',
              },
              {
                objection: '"How do we know our data and decisions are secure?"',
                reality: 'Every action, approval, rejection, and note is stored in an immutable audit log with a cryptographic hash — tamper-evident by design. Role-based access controls ensure only authorised reviewers see the actions relevant to them. The audit log is exportable and HMAC-signed, making it verifiable for compliance and legal review. For your compliance team, this is not just a security feature — it is the audit trail they have been asking for.',
              },
              {
                objection: '"We already have confidence scores and post-hoc logs. Isn\'t that enough?"',
                reality: 'No. Confidence scores tell you probability, not certainty — a 95% confidence score still means one in twenty actions may be wrong. Post-hoc logs tell you what went wrong after it happened, which is useful for root cause analysis but useless for prevention. Neither stops a bad action from executing. The question is not "how likely is the AI to be right?" — it is "who is accountable if it is wrong?" A gate answers that question before the damage occurs.',
              },
            ].map((obj, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-[#12172b]/60 p-6">
                <p className="text-[#FFB84D] font-semibold text-base mb-3">Objection: {obj.objection}</p>
                <p className="text-[#8892B0] text-sm leading-relaxed">
                  <span className="text-white font-semibold">Reality: </span>{obj.reality}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 7: SOCIAL PROOF ──────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05] bg-[#12172b]/40">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">What Ops Leaders Say</p>
          <h2 className="text-4xl font-bold mb-12 leading-tight">
            Real Teams. Real Errors Stopped.
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "The gate stopped a bulk-email that would have gone to 14,000 customers with last quarter's pricing — a price our team no longer honours. We caught it in the review queue 40 minutes before our scheduled send window. Without SlateOps, that would have been a customer service nightmare and a board-level question about AI governance we were not ready to answer.",
                name: 'Sarah Chen',
                title: 'Head of Operations',
                company: 'Meridian Analytics',
                metric: 'Zero customer-facing AI errors since deployment.',
              },
              {
                quote: "I had to present our AI controls to auditors last quarter. I pulled the SlateOps audit log — every action, every approver, every timestamp, HMAC-signed and immutable. The auditors asked follow-up questions about three other systems. They had no questions about this one. That is what a properly designed approval trail looks like.",
                name: 'Marcus Webb',
                title: 'Chief Compliance Officer',
                company: 'Vantage Financial Partners',
                metric: 'Passed external audit with zero findings on AI governance.',
              },
              {
                quote: "I expected pushback from the team when I introduced a review step. Instead, adoption went up. Engineers told me they were more confident delegating tasks to the AI agents once they knew there was a human checkpoint before anything executed. Trust in the system increased because accountability increased. That was not what I predicted — but it is what happened.",
                name: 'Priya Nair',
                title: 'VP of Engineering',
                company: 'Stackline Systems',
                metric: 'AI task volume up 3× in 60 days post-deployment.',
              },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-white/[0.07] bg-[#12172b]/60 p-6 flex flex-col">
                <p className="text-[#8892B0] text-sm leading-relaxed flex-1 mb-6">"{t.quote}"</p>
                <div>
                  <p className="text-white font-semibold text-sm">{t.name}</p>
                  <p className="text-[#8892B0] text-xs">{t.title}, {t.company}</p>
                  <p className="text-[#4DFFA0] text-xs mt-2 italic">{t.metric}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 8: CTA FINALE ────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#4D7FFF]/12 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            The Only AI Platform Where Nothing Executes Until You Approve It.
          </h2>
          <p className="text-[#8892B0] text-lg leading-relaxed mb-10 max-w-2xl mx-auto">
            You get the speed of AI automation and the control of human judgment — not one or the other. Every action reviewed. Every decision logged. Every mistake caught before it reaches your customers.
          </p>
          <Link
            href="/sign-up"
            className="inline-block px-10 py-5 rounded-2xl bg-[#4D7FFF] text-white font-bold text-lg hover:bg-[#3d6fee] transition-all shadow-xl shadow-[#4D7FFF]/30"
          >
            Take Control — Start Free
          </Link>
          <p className="mt-4 text-[#8892B0] text-sm">
            No credit card required · Cancel anytime · First agents live in under 10 minutes
          </p>
          <p className="mt-12 text-white/30 text-sm font-semibold tracking-widest uppercase">
            Human judgment. At machine speed.
          </p>
        </div>
      </section>

      {/* ── SECTION 9: FAQ ───────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto">
          <p className="text-[#4D7FFF] text-xs font-bold uppercase tracking-widest mb-4">FAQ</p>
          <h2 className="text-4xl font-bold mb-12 leading-tight">
            Questions From Buyers Who Have Done Their Homework.
          </h2>
          <FaqAccordion />
        </div>
      </section>

      {/* ── SECTION 10: FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">

          {/* Top row: brand + socials + policy links */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left flex flex-col items-center md:items-start gap-1">
              <SlateOpsLockup size="sm" />
              <p className="text-[#8892B0] text-xs">Human judgment. At machine speed.</p>
            </div>

            {/* Socials — placeholder hrefs; swap in real handles. */}
            <div className="flex items-center gap-2">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`SlateOps on ${label}`}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[#8892B0] hover:text-white hover:bg-white/[0.07] hover:border-white/20 transition-colors"
                >
                  <Icon size={15} strokeWidth={1.75} />
                </a>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-[#8892B0]">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Security</a>
              <a href="mailto:hello@slateops.tech" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>

          {/* Bottom row: copyright on its own line so the top row breathes */}
          <p className="text-[#8892B0] text-xs text-center md:text-left">© 2026 SlateOps. All rights reserved.</p>
        </div>
      </footer>

    </div>
  )
}
