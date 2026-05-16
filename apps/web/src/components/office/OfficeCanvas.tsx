'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, GitBranch, Plug, Zap, Brain, Users, Building2, Sparkles, BookOpen, ChevronDown, BookMarked, Smartphone, Network, TrendingUp, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { OfficeScene } from '@/lib/pixi/scene'
import { useAgentEvents } from '@/hooks/useAgentEvents'
import { useAuthFetch } from '@/hooks/useAuthFetch'
import { AgentAvatarDock } from '@/components/ui/AgentAvatarDock'
import { ApprovalToast } from '@/components/ui/ApprovalToast'
import { CommandLibrary } from '@/components/ui/CommandLibrary'
import { TaskResultPanel } from '@/components/ui/TaskResultPanel'
import { SettingsPanel } from '@/components/ui/SettingsPanel'
import { OnboardingTakeover } from '@/components/ui/OnboardingTakeover'
import { OfficeStatusBar } from '@/components/ui/OfficeStatusBar'
import { TeamChatPanel } from '@/components/ui/TeamChatPanel'
import { WelcomeBackPanel } from '@/components/ui/WelcomeBackPanel'
import { WorkflowBuilderPanel } from '@/components/ui/WorkflowBuilderPanel'
import { McpConnectionsPanel } from '@/components/ui/McpConnectionsPanel'
import { TriggerRulesPanel } from '@/components/ui/TriggerRulesPanel'
import { GamificationPanel } from '@/components/ui/GamificationPanel'
import { AchievementToast } from '@/components/ui/AchievementToast'
import { UpgradePanel } from '@/components/ui/UpgradePanel'
import { ConnectionsPanel } from '@/components/ui/ConnectionsPanel'
import { ConnectionsShelf } from '@/components/ui/ConnectionsShelf'
import { AgentMemoryPanel } from '@/components/ui/AgentMemoryPanel'
import { TeamPanel } from '@/components/ui/TeamPanel'
import { ContentSchedulerPanel } from '@/components/ui/ContentSchedulerPanel'
import { OnboardingWizard } from '@/components/ui/OnboardingWizard'
import { PlaybooksPanel } from '@/components/ui/PlaybooksPanel'
import { AgentMarketplace } from '@/components/ui/AgentMarketplace'
import { ProactiveBriefings } from '@/components/ui/ProactiveBriefings'
import { CollaborationFeed } from '@/components/ui/CollaborationFeed'
import { PushNotificationsPanel } from '@/components/ui/PushNotificationsPanel'
import { AgentEvolutionPanel } from '@/components/ui/AgentEvolutionPanel'
import { CompanyBrainPanel } from '@/components/ui/CompanyBrainPanel'
import { AutonomousModePanel } from '@/components/ui/AutonomousModePanel'
import { DailyBriefPrompt } from '@/components/ui/DailyBriefPrompt'
import { PostOnboardingChecklist } from '@/components/ui/PostOnboardingChecklist'
import { useAgentsStore } from '@/stores/agents.store'

export function OfficeCanvas() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<OfficeScene | null>(null)
  const [sceneReady, setSceneReady]     = useState(false)
  const [firstRunLock, setFirstRunLock] = useState(false)
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [workflowOpen, setWorkflowOpen]   = useState(false)
  const [mcpOpen,          setMcpOpen]          = useState(false)
  const [triggersOpen,     setTriggersOpen]     = useState(false)
  const [gamificationOpen, setGamificationOpen] = useState(false)
  const [billingOpen,      setBillingOpen]      = useState(false)
  const [connectionsOpen,  setConnectionsOpen]  = useState(false)
  const [memoryOpen,       setMemoryOpen]       = useState(false)
  const [teamOpen,         setTeamOpen]         = useState(false)
  const [playbooksOpen,    setPlaybooksOpen]    = useState(false)
  const [marketplaceOpen,  setMarketplaceOpen]  = useState(false)
  const [collabOpen,       setCollabOpen]       = useState(false)
  const [pushOpen,         setPushOpen]         = useState(false)
  const [evolutionOpen,    setEvolutionOpen]    = useState(false)
  const [brainOpen,        setBrainOpen]        = useState(false)
  const [autonomousOpen,   setAutonomousOpen]   = useState(false)
  const [showOnboarding,        setShowOnboarding]        = useState(false)
  const [commandLibraryOpen,    setCommandLibraryOpen]    = useState(false)
  const commandsAnchorRef = useRef<HTMLDivElement>(null)
  const [showDailyBriefPrompt,  setShowDailyBriefPrompt] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showOnboardingTakeover, setShowOnboardingTakeover] = useState(false)
  const setAgents       = useAgentsStore((s) => s.setAgents)
  const setTasks        = useAgentsStore((s) => s.setTasks)
  const evolutionToast  = useAgentsStore((s) => s.evolutionToast)
  const completedTask   = useAgentsStore((s) => s.completedTask)
  const schedulerStoreOpen = useAgentsStore((s) => s.schedulerOpen)
  const closeScheduler  = useAgentsStore((s) => s.closeScheduler)
  const agentsCount     = useAgentsStore((s) => s.agents.length)
  const teamChatOpen    = useAgentsStore((s) => s.teamChatOpen)
  const authFetch  = useAuthFetch()

  // Clear first-run lock once any agent shows up (e.g. after onboarding install)
  useEffect(() => {
    if (firstRunLock && agentsCount > 0) setFirstRunLock(false)
  }, [agentsCount, firstRunLock])

  // Open the upgrade panel when arriving via /billing → /office?billing=1.
  // Strip the param so a refresh doesn't keep re-opening the panel.
  useEffect(() => {
    if (searchParams?.get('billing') === '1') {
      setBillingOpen(true)
      router.replace('/office')
    }
  }, [searchParams, router])

  // Poll pending approval count for badge
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    const poll = () => authFetch(`${base}/api/ceo-layer/summary`)
      .then((r) => r.json())
      .then((d) => setPendingCount(d.pendingCount ?? 0))
      .catch(() => {})
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [authFetch])

  // Check onboarding status once agents + scene are ready
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    authFetch(`${base}/api/user/settings`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings
        if (!s) return
        const isPaid = s.plan === 'PRO' || s.plan === 'ENTERPRISE'
        if (isPaid && !s.onboardingIntakeDone) {
          setShowOnboardingTakeover(true)
        } else if (s.onboardingDone === false) {
          setShowOnboarding(true)
        }
      })
      .catch(() => {})
  }, [authFetch])

  // Show daily brief opt-in prompt after first task completion (once per browser)
  useEffect(() => {
    if (!completedTask || completedTask.status !== 'COMPLETE') return
    if (typeof window !== 'undefined' && localStorage.getItem('slateops_brief_prompt_seen')) return
    setShowDailyBriefPrompt(true)
  }, [completedTask])

  // ── 1. Boot Pixi scene ──────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return
    let cancelled = false
    const scene = new OfficeScene()
    sceneRef.current = scene
    scene.init(canvasRef.current).then(() => {
      if (!cancelled) setSceneReady(true)
    })
    return () => {
      cancelled = true
      scene.destroy()
      sceneRef.current = null
      setSceneReady(false)
    }
  }, [])

  // ── 2. Load agents + tasks from API into Zustand ─────────────────
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL
    Promise.all([
      authFetch(`${base}/api/agents`).then((r) => r.json()),
      authFetch(`${base}/api/tasks?limit=20`).then((r) => r.json()),
    ])
      .then(([agentData, taskData]) => {
        if (taskData.tasks) setTasks(taskData.tasks)
        if (agentData.agents) {
          if (agentData.agents.length === 0) { setFirstRunLock(true); return }
// Reconcile: any agent showing WORKING with no IN_PROGRESS task is stale
          const activeAgentIds = new Set(
            (taskData.tasks ?? [])
              .filter((t: { status: string }) => t.status === 'IN_PROGRESS')
              .map((t: { agentId: string }) => t.agentId)
          )
          const agents = agentData.agents.map((a: { id: string; status: string }) => ({
            ...a,
            status: a.status === 'WORKING' && !activeAgentIds.has(a.id) ? 'IDLE' : a.status,
          }))
          setAgents(agents)
        }
      })
      .catch(() => {})
  }, [setAgents, setTasks, authFetch])

  // ── 3. Wire socket events → XState directors ────────────────────
  useAgentEvents(sceneReady ? sceneRef.current : null)

  return (
    <>
    <div className="relative w-full h-screen bg-office-wall overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* ── Ambient glow — atmosphere only, pointer-events-none ── */}
      <div
        className="absolute left-[184px] right-0 top-0 bottom-0 z-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 30% 55%, rgba(77,127,255,0.06) 0%, transparent 65%)' }}
      />

      {/* ── Centred branding — offset right to account for sidebar ── */}
      <div className="absolute left-[184px] right-0 top-0 bottom-0 flex flex-col items-center justify-start pt-4 z-10 pointer-events-none select-none gap-4">
        {/* Icon + wordmark */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-xl bg-panel-accent/20 blur-xl scale-150" />
            <div className="relative w-10 h-10 rounded-xl border border-white/10 bg-[rgba(18,23,43,0.6)] backdrop-blur-sm flex items-center justify-center">
              <Building2 size={19} className="text-panel-accent/80" />
            </div>
            <Sparkles size={10} className="absolute -top-1.5 -right-1.5 text-panel-accent/60" />
          </div>
          <p className="text-[90px] font-bold tracking-tight leading-none text-white">
            SlateOps
          </p>
        </div>

        {/* Tagline */}
        <p className="text-[16px] tracking-[0.3em] uppercase text-white/50 font-light">
          Your AI&#8209;Powered Office
        </p>

        {/* Status dots */}
        <div className="flex items-center gap-5 mt-1">
          {[
            { color: 'bg-lamp-done',    label: 'Agents' },
            { color: 'bg-panel-accent', label: 'Tasks' },
            { color: 'bg-lamp-idle',    label: 'Automations' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
              <span className="text-[12px] text-white/40 tracking-wide">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {sceneReady && (
        <>
          <OfficeStatusBar
            onOpenUpgrade={()     => { setBillingOpen(true); setMarketplaceOpen(false); setConnectionsOpen(false) }}
            onOpenMarketplace={() => { setMarketplaceOpen(true); setBillingOpen(false); setConnectionsOpen(false) }}
            onOpenConnections={() => { setConnectionsOpen(true); setBillingOpen(false); setMarketplaceOpen(false) }}
          />
          {/* Canvas avatar dock and shelf only show when the chat panel is closed —
              the chat panel owns the picker/grant surface while open. */}
          {!teamChatOpen && <AgentAvatarDock />}
          {!teamChatOpen && <ConnectionsShelf onOpenConnections={() => { setConnectionsOpen(true); setBillingOpen(false); setMarketplaceOpen(false) }} />}
          <ApprovalToast />
          <WelcomeBackPanel />
          <TaskResultPanel />
          <ProactiveBriefings />

          {/* ── Left sidebar ── */}
          {(() => {
            const closeAll = () => {
              setWorkflowOpen(false); setMcpOpen(false); setTriggersOpen(false); setGamificationOpen(false)
              setBillingOpen(false); setMemoryOpen(false); setTeamOpen(false); setSettingsOpen(false)
              setPlaybooksOpen(false); setMarketplaceOpen(false)
              setCollabOpen(false); setPushOpen(false)
              setEvolutionOpen(false); setBrainOpen(false); setAutonomousOpen(false)
            }
            const toggle = (setter: React.Dispatch<React.SetStateAction<boolean>>, current: boolean) => {
              closeAll(); if (!current) setter(true)
            }
            const NAV_GROUPS = [
              {
                group: 'Build',
                items: [
                  { icon: <span className="text-base leading-none">🛠️</span>, c: 'text-purple-400 bg-purple-400/15 border-purple-400/25', label: 'Build a Workflow', active: workflowOpen, onClick: () => toggle(setWorkflowOpen, workflowOpen) },
                ],
              },
              {
                group: 'Workspace',
                items: [
                  { icon: <span className="text-base leading-none">🔌</span>, c: 'text-cyan-400 bg-cyan-400/15 border-cyan-400/25',       label: 'MCP Connections',   active: mcpOpen,        onClick: () => toggle(setMcpOpen, mcpOpen) },
                  { icon: <span className="text-base leading-none">⚡</span>, c: 'text-yellow-400 bg-yellow-400/15 border-yellow-400/25', label: 'Triggers',          active: triggersOpen,   onClick: () => toggle(setTriggersOpen, triggersOpen) },
                  { icon: <span className="text-base leading-none">📖</span>, c: 'text-teal-400 bg-teal-400/15 border-teal-400/25',       label: 'Playbooks',         active: playbooksOpen,  onClick: () => toggle(setPlaybooksOpen, playbooksOpen) },
                ],
              },
              {
                group: 'Agents',
                items: [
                  { icon: <span className="text-base leading-none">🧠</span>, c: 'text-indigo-400 bg-indigo-400/15 border-indigo-400/25', label: 'Agent Memory',  active: memoryOpen, onClick: () => toggle(setMemoryOpen, memoryOpen) },
                  { icon: <span className="text-base leading-none">🤝</span>, c: 'text-sky-400 bg-sky-400/15 border-sky-400/25',           label: 'Collaboration', active: collabOpen, onClick: () => toggle(setCollabOpen, collabOpen) },
                ],
              },
              {
                group: 'Team',
                items: [
                  { icon: <span className="text-base leading-none">👥</span>, c: 'text-pink-400 bg-pink-400/15 border-pink-400/25', label: 'Teams',     active: teamOpen,    onClick: () => toggle(setTeamOpen, teamOpen) },
                ],
              },
              {
                group: 'Intelligence',
                items: [
                  { icon: <span className="text-base leading-none">🏢</span>, c: 'text-violet-400 bg-violet-400/15 border-violet-400/25',   label: 'Company Brain',  active: brainOpen,         onClick: () => toggle(setBrainOpen, brainOpen) },
                  { icon: <span className="text-base leading-none">🤖</span>, c: 'text-emerald-400 bg-emerald-400/15 border-emerald-400/25', label: 'Autonomous',     active: autonomousOpen,    onClick: () => toggle(setAutonomousOpen, autonomousOpen) },
                  { icon: <span className="text-base leading-none">📈</span>, c: 'text-amber-400 bg-amber-400/15 border-amber-400/25',      label: 'Evolution',      active: evolutionOpen,     onClick: () => toggle(setEvolutionOpen, evolutionOpen) },
                ],
              },
              {
                group: 'System',
                items: [
                  { icon: <span className="text-base leading-none">🔔</span>, c: 'text-rose-400 bg-rose-400/15 border-rose-400/25', label: 'Notifications',  active: pushOpen,     onClick: () => toggle(setPushOpen, pushOpen) },
                  { icon: <span className="text-base leading-none">⚙️</span>, c: 'text-gray-400 bg-gray-400/15 border-gray-400/25', label: 'Settings',       active: settingsOpen, onClick: () => toggle(setSettingsOpen, settingsOpen) },
                ],
              },
            ]
            return (
              <div className="absolute left-3 top-3 bottom-3 z-40 w-[184px] flex flex-col bg-panel-bg/96 backdrop-blur-md border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden antialiased">
                {/* Wordmark */}
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] shrink-0">
                  <div className="w-6 h-6 rounded-md bg-panel-accent/20 border border-panel-accent/30 flex items-center justify-center shrink-0">
                    <Building2 size={11} className="text-panel-accent" />
                  </div>
                  <span className="text-[11px] font-bold text-white tracking-tight">SlateOps</span>
                </div>

                {/* Control Layer CTA */}
                <button
                  onClick={() => router.push('/ceo-layer')}
                  className="mx-3 mt-2 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/15 transition-colors"
                >
                  <Shield size={11} className="text-amber-400 shrink-0" />
                  <span className="text-[13px] font-semibold text-amber-300 flex-1 text-left">CEO Control Center</span>
                  {pendingCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-400 text-[#12172b] text-[9px] font-bold flex items-center justify-center shrink-0">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </button>

                {/* Nav */}
                <div className="flex-1 overflow-y-auto scrollbar-none py-2">
                  {NAV_GROUPS.map(({ group, items }) => (
                    <div key={group} className="mb-1">
                      <p className="px-4 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/40">{group}</p>
                      {items.map(({ icon, c, label, active, onClick }) => {
                        const iconColor = c.split(' ')[0] // e.g. 'text-blue-400'
                        return (
                        <button
                          key={label}
                          onClick={onClick}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-1.5 transition-all group relative',
                            active ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
                          )}
                        >
                          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-panel-accent" />}
                          <div className="w-[28px] h-[28px] rounded-lg flex items-center justify-center shrink-0 bg-white shadow-sm">
                            <span className={cn('leading-none', iconColor)}>
                              {icon}
                            </span>
                          </div>
                          <span className={cn('text-[13px] font-medium truncate transition-colors', active ? 'text-white' : 'text-white/70 group-hover:text-white')}>
                            {label}
                          </span>
                        </button>
                        )
                      })}
                      {group === 'Agents' && (
                        <div ref={commandsAnchorRef}>
                          <button
                            onClick={() => setCommandLibraryOpen((v) => !v)}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-1.5 transition-all',
                              commandLibraryOpen ? 'bg-white/[0.06] text-panel-accent' : 'text-white/35 hover:text-white/65 hover:bg-white/[0.04]',
                            )}
                          >
                            <BookOpen size={11} className="shrink-0" />
                            <span className="text-[13px] font-medium flex-1 text-left">Commands</span>
                            <ChevronDown size={10} className={cn('transition-transform shrink-0', commandLibraryOpen && 'rotate-180')} />
                          </button>
                          <CommandLibrary open={commandLibraryOpen} onOpenChange={setCommandLibraryOpen} anchorRef={commandsAnchorRef} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          <AchievementToast />

          <DailyBriefPrompt
            visible={showDailyBriefPrompt}
            onDismiss={() => {
              setShowDailyBriefPrompt(false)
              if (typeof window !== 'undefined') localStorage.setItem('slateops_brief_prompt_seen', '1')
            }}
          />

          <PostOnboardingChecklist />

          <AnimatePresence>
            {evolutionToast && (
              <motion.div
                key="evolution-toast"
                initial={{ opacity: 0, y: 24, scale: 0.95 }}
                animate={{ opacity: 1, y: 0,  scale: 1    }}
                exit={{    opacity: 0, y: 24, scale: 0.95 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-4 py-3 rounded-2xl bg-panel-bg border border-panel-accent/40 shadow-2xl"
              >
                <span className="text-lg">⬆</span>
                <div>
                  <p className="text-white text-xs font-semibold">{evolutionToast.agentName} levelled up!</p>
                  <p className="text-panel-accent text-[10px]">Level {evolutionToast.level} · {evolutionToast.title}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {settingsOpen     && <SettingsPanel            onClose={() => setSettingsOpen(false)} />}
            {workflowOpen     && <WorkflowBuilderPanel     onClose={() => setWorkflowOpen(false)} />}
            {mcpOpen          && <McpConnectionsPanel      onClose={() => setMcpOpen(false)} />}
            {triggersOpen     && <TriggerRulesPanel        onClose={() => setTriggersOpen(false)} />}
            {gamificationOpen && <GamificationPanel        onClose={() => setGamificationOpen(false)} />}
            {billingOpen      && <UpgradePanel             onClose={() => setBillingOpen(false)} />}
            {connectionsOpen  && <ConnectionsPanel         onClose={() => setConnectionsOpen(false)} />}
            {memoryOpen       && <AgentMemoryPanel         onClose={() => setMemoryOpen(false)} />}
            {teamOpen         && <TeamPanel                onClose={() => setTeamOpen(false)} />}
            {schedulerStoreOpen && <ContentSchedulerPanel onClose={closeScheduler} />}
            {playbooksOpen    && <PlaybooksPanel           onClose={() => setPlaybooksOpen(false)} />}
            {marketplaceOpen  && <AgentMarketplace         onClose={() => setMarketplaceOpen(false)} />}
            {collabOpen          && <CollaborationFeed        onClose={() => setCollabOpen(false)} />}
            {pushOpen            && <PushNotificationsPanel   onClose={() => setPushOpen(false)} />}
            {evolutionOpen       && <AgentEvolutionPanel      onClose={() => setEvolutionOpen(false)} />}
            {brainOpen           && <CompanyBrainPanel         onClose={() => setBrainOpen(false)} />}
            {autonomousOpen      && <AutonomousModePanel       onClose={() => setAutonomousOpen(false)} />}
          </AnimatePresence>

          {showOnboarding && (
            <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
          )}

          <AnimatePresence>
            {showOnboardingTakeover && (
              <OnboardingTakeover
                onComplete={() => setShowOnboardingTakeover(false)}
                onSkip={()     => setShowOnboardingTakeover(false)}
              />
            )}
          </AnimatePresence>
        </>
      )}

      {firstRunLock && !showOnboardingTakeover && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[#12172b]/80 backdrop-blur-md">
          <div className="w-full max-w-sm mx-auto text-center space-y-6 px-6">
            <div className="w-14 h-14 rounded-2xl bg-panel-accent/20 border border-panel-accent/30 flex items-center justify-center mx-auto">
              <Building2 size={24} className="text-panel-accent" />
            </div>
            <div>
              <h2 className="text-white text-2xl font-semibold mb-2">Your office is empty.</h2>
              <p className="text-[#8892b0] text-sm leading-relaxed">
                Hire your first AI agent to unlock the workspace. It takes 60 seconds.
              </p>
            </div>
            <button
              onClick={() => router.push('/onboarding')}
              className="w-full py-3 rounded-xl bg-panel-accent text-white font-medium text-sm hover:bg-panel-accent/90 transition-colors"
            >
              Start setup →
            </button>
          </div>
        </div>
      )}
    </div>
    <TeamChatPanel />
    </>
  )
}
