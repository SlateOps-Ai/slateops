# THE UNCOMPROMISING PRODUCT ORACLE — AgentCity

> Applied: 2026-05-10
> Framework: The Uncompromising Product Oracle (product-oracle-prompt.md)

---

## CONTEXT GROUNDING BLOCK

| Input | Value | Status |
|---|---|---|
| Core features | See feature inventory below | CONFIRMED |
| Primary user archetypes | Lean Operator, Delegator-in-Training | INFERRED — CONFIRM BEFORE PROCEEDING |
| Current metrics | Pre-launch — all UNKNOWN | UNKNOWN |
| Monetization | Freemium → subscription ($0 / $39 / $149) | CONFIRMED |
| Team reality | 1 founder-engineer, no dedicated designer, ~1 feature/week, hard constraint: cannot ship native mobile app or Stripe billing system in 90 days | CONFIRMED |
| Competitors | Lindy.ai, Zapier AI Agents, Notion AI + Character.AI (adjacent) | CONFIRMED (founder-named) |

**Data Quality Declaration:** All metrics are UNKNOWN (pre-launch). Every recommendation that depends on behavioral data is labeled `[REQUIRES VALIDATION BEFORE BUILD]` where applicable. Archetype definitions are INFERRED from product positioning and must be confirmed with 5+ user interviews before Phase 4 features are scoped.

---

## RUNNING ASSUMPTION REGISTER

| # | Assumption | Source | Status | Phase introduced |
|---|---|---|---|---|
| A1 | The visual office (movie mode) is a retention driver, not a novelty that wears off after 2 sessions | INFERRED | Unvalidated | Pre-Flight |
| A2 | Task output quality from LangGraph + Claude Sonnet 4.6 is good enough that users trust the agent with real work by Week 2 | INFERRED | Unvalidated | Pre-Flight |
| A3 | The target user feels the "hiring a team" emotional narrative, not "setting up a bot" | INFERRED | Unvalidated | Pre-Flight |
| A4 | D7 retention collapses post-gift-task because there is no pull-back mechanism | INFERRED | Unvalidated | Phase 1 |
| A5 | Users who complete 10+ tasks with one agent churn at materially lower rates than fresh-agent users | INFERRED | Unvalidated | Phase 1 |
| A6 | The Delegator archetype churns at the identity/context step because they cannot seed the agent with brand or audience context | INFERRED | Phase 2 Churn Autopsy | Phase 2 |
| A7 | Approval gate friction causes task abandonment at a measurable rate | INFERRED | Unvalidated | Phase 1 |

---

## PRE-FLIGHT — PRODUCT FINGERPRINT

### 1. Feature Inventory

1. **Isometric 2D Office Scene** — programmatic Pixi.js WebGL workspace; oak floors, desks, city skyline, plants, rug
2. **Role-Based Agent Hiring** — 5 roles (Exec Assistant, Research Analyst, Content Writer, Sales Prospector, Ops Coordinator)
3. **Avatar Customization** — style (Professional, Creative, Casual, Executive) + presentation (Feminine, Masculine, Neutral); programmatic sprites
4. **Movie Mode** — cinematic camera pans, 8-state animated agent sprites, thought bubbles with per-state tints
5. **LangGraph Task Graph** — multi-step planner → executor → compiler; PostgresSaver checkpointing for suspend/resume
6. **CEO Router** — Claude Haiku 4.5 routes any free-text command to the right agent; handles ambiguity with clarification questions
7. **Composio OAuth Integrations** — Gmail, Google Calendar; per-agent entity; OAuth flow during onboarding
8. **Human-in-the-Loop Approval Gate** — destructive tool calls pause the graph; 10-minute TTL; `APPROVED / EDITED / CANCELLED`
9. **Real-Time Event System** — Socket.io broadcasts task events to XState director machine → drives all Pixi animations
10. **5-Step Onboarding with Gift Task** — role → identity → connect → gift task → result; agent completes its first real task before user leaves setup

---

### 2. User Archetypes

**Archetype 1: The Lean Operator**
- Role/demographic: Solo founder, indie entrepreneur, 1–3 person startup, age 26–40
- Core motivation: Feels like they're running a real company — not prompting a chatbot
- Biggest pain: Every AI tool feels like a tool, not a colleague. There's no sense of delegation, no sense of trust, no sense that something is happening when they're not watching
- Activation state (max value): The first time they open the office and see their named agent walk to a desk, sit down, and begin working on a real task
- Sentence to a friend: *"It's like SimCity, but the Sims are doing my actual work."*
- Moment they'd churn: Task fails with a cryptic error on the result screen. No explanation of what went wrong, no suggested retry. They're on the result step, staring at a raw JSON error.
- Screen they're on when they decide to leave: The result step, 3 seconds after seeing a failed task output

**Archetype 2: The Delegator-in-Training**
- Role/demographic: Marketing manager, ops lead, or content strategist at a 20–100 person company
- Core motivation: Offloads the execution grunt work that fills their calendar so they can focus on the 20% that actually uses their skills
- Biggest pain: AI tools are powerful but feel like a second job — you have to manage them actively, paste in all the context, check the output, correct mistakes
- Activation state (max value): First time they send a command in natural language and come back later to a finished result with no babysitting required
- Sentence to a friend: *"I hired a team of AI employees and they just… work. Like actual work."*
- Moment they'd churn: Onboarding. They name the agent, pick an avatar style, then realize there's nowhere to tell the agent about their company, their audience, or their brand voice. The gift task produces something generic. They open ChatGPT instead.
- Screen they're on when they decide to leave: The identity step (Step 2 of onboarding), specifically the moment after generating the avatar when there's no "brief your agent" input

---

### 3. Retention Loop Assessment

**Current loop:** User gives command → Agent completes task → User sees result.

This is a **transaction loop**, not a **retention loop**. There is no trigger that brings users back after they close the tab. The office is only alive when the app is open. No push notification, no weekly summary, no recurrence mechanism, no ambient signal that something is happening. The gift task creates a strong activation moment (D1) but there is nothing structurally pulling users back on Day 7 or Day 30.

**Assessment: BROKEN.** The retention loop does not currently exist. This is the most urgent structural risk in the product.

---

### 4. Category Hypothesis

Users currently file this app under *"AI assistant platform."* That label is wrong because the core experience is **visual delegation and team simulation**, not conversation. The category this product actually owns is **"AI workforce simulator"** — the first product that makes you feel like a manager, not a user.

---

### 5. Critical Assumption Stack

1. **A1** — The visual layer is a retention driver, not a novelty. If users find the isometric office gimmicky after 2 sessions, the entire differentiation collapses.
2. **A2** — Task quality is high enough that users trust the agent with real work by Week 2. If the agent fails frequently or produces poor output, no visual layer compensates.
3. **A3** — Users feel the "hiring a team" narrative. If they experience it as "setting up a bot," the positioning is wrong and the ICP may need to shift entirely.

---

## PHASE 1 — THE RUTHLESS AUDIT

**Steel Man First:** At its best, AgentCity is the only AI agent product that lets you *see* your agents working. The animated sprite system — agent walks to desk, sits, begins typing, thought bubble appears — reduces the anxiety of AI delegation and makes invisible computation feel alive. No funded competitor is close to this UX. This is the standard every gap is measured against.

---

### Gap 1: The Command Bar is a Dead End

**Current state:** The command input accepts free text, routes to an agent via the CEO Router, returns a result. One shot. No templates, no history, no recurrence.

**Steelman:** A blank command bar signals unlimited capability — users can ask for anything without preconceptions.

**Archetype it fails:** The Delegator-in-Training. They don't want to invent new tasks. They want to replay the command that worked on Tuesday and schedule it for every Tuesday.

**The leap:** Command Library — every successful task auto-saves as a named template with its actual output attached. Users see a sidebar of commands that worked. "Run again" is one click. "Schedule weekly" is the next click.

**Behavioral shift:** Users stop treating AgentCity as a one-shot experiment and start treating it as workflow infrastructure. They open the app not to think of something to delegate but to execute the things that already work.

**The moat:** A personal command library with attached results is deeply personal data. Competitors can offer a better blank box; they cannot offer the user's own history.

**Metric:** D30 retention (target: +12–18% lift vs. no-library cohort). Tasks per session (target: +40% lift within 60 days of launch).

**Revenue vector:** Team tier unlocks shared command libraries across a workspace — the most natural Pro → Team upgrade trigger in the product.

**Confirmation signal (60 days):** ≥35% of all tasks in Week 3+ are "Run again" from history rather than new commands.

**Conviction:** `[HIGH]`

---

### Gap 2: The Office Disappears When You Close the Tab

**Current state:** Agents exist only inside the browser. When the tab closes, there is no ambient signal that anything is happening or has finished. Users who step away for 2 hours return to nothing — no notification, no badge, no digest.

**Steelman:** Browser-first is the lowest friction entry point. Push notification permissions have low grant rates and high abuse risk.

**Archetype it fails:** Both archetypes — but differently. The Lean Operator leaves the tab open constantly, burning focus on babysitting. The Delegator-in-Training closes the tab and forgets the product exists.

**The leap:** A weekly Monday morning email brief from the "CEO agent" — what the team accomplished, what failed, what's queued, and one proactive recommendation per agent. Immediate email notification on `TASK_COMPLETE` and `NEEDS_APPROVAL` for active tasks.

**Behavioral shift:** The office becomes a place users return to, not a place they leave running. The email brief creates a Monday ritual anchored to the product.

**The moat:** Out-of-app presence creates habitual check-ins independent of user-initiated sessions. This is the difference between a tool and infrastructure.

**Metric:** D7 retention (target: +15–22% for users who open at least one out-of-app notification in week 1 vs. those who don't). Email brief open rate target: ≥40% (signals agents feel alive to users).

**Revenue vector:** Rich brief formatting (charts, agent recommendations, credit usage summaries) is a Pro feature. Plain text for Free tier.

**Confirmation signal (60 days):** Users who receive and open the Monday brief in Week 1 retain at ≥2× the rate of those who don't.

**Conviction:** `[HIGH]`

---

### Gap 3: Approval Gates Are Interruptions, Not Conversations

**Current state:** Task hits a destructive action → status → `NEEDS_APPROVAL` → user must open the app, find the task, decide blind. There's no context about *why* the agent chose this action, no way to edit the parameters, no way to say "always do this."

**Steelman:** Explicit approval UI ensures users never feel their agent acted without full consent. Safety-first is correct for a v1.

**Archetype it fails:** The Lean Operator. They move fast and treat the approval gate as friction, not safety. After the third time they have to approve the same email action, they stop using agents for anything that touches external tools.

**The leap:** Approval as Conversation — the gate shows the exact action parameters as an editable form. Users can modify before approving. A "Trust this agent for this action type" toggle builds a permission profile. After 3 approvals of the same pattern, the system suggests auto-approve.

**Behavioral shift:** Users feel they're training their agent, not managing it. The approval gate becomes a trust-building moment that compounds toward autonomy.

**The moat:** Permission profiles are personal data. Migrating to a competitor means rebuilding trust from zero.

**Metric:** Task completion rate (target: +8–12% from baseline — fewer abandoned tasks). Approval response time median (target: <5 minutes with email notification vs. current unknown baseline). `[REQUIRES VALIDATION BEFORE BUILD]` — depends on measuring actual approval abandonment rate.

**Revenue vector:** Auto-approve profiles as a Pro feature. Users who trust their agents delegate more, consume more credits, upgrade to Pro.

**Confirmation signal (60 days):** ≥40% of approval decisions completed within 5 minutes of the task notification email.

**Conviction:** `[MEDIUM]` — depends on approval abandonment rate being materially high (unvalidated).

---

### Gap 4: Agent Identity is Cosmetic, Not Behavioral

**Current state:** Agents have names, avatars, and roles. But beyond initial role routing, every agent behaves identically. Jordan the Research Analyst and Alex the Exec Assistant produce the same quality output with no memory of past tasks, no awareness of user preferences, no learned voice.

**Steelman:** Role-based routing is already meaningful differentiation from generic chatbots. In v1, behavioral consistency is less risky than a poorly implemented memory that produces wrong outputs.

**Archetype it fails:** The Lean Operator. They hired a "team" but after 2 weeks, they realize Alex is a labeled API call. There's no institutional knowledge, no growth, no personality that develops. The "team" narrative breaks.

**The leap:** Agent Memory & Voice — each agent accumulates a persistent memory of past tasks, user preferences, brand voice, and communication patterns. The Research Analyst learns which sources you trust. The Content Writer learns your brand tone. Each output moves closer to first-draft-is-final quality over time.

**Behavioral shift:** Users stop thinking of agents as tools and start thinking of them as colleagues with institutional knowledge. An agent that has processed 30 tasks and knows your brand voice is not something you abandon for a competitor. Churning means losing months of accumulated calibration.

**The moat:** Agent memory is the deepest switching cost in any AI product. It is not exportable, not replicable, and not available on Day 1 — it is earned through use.

**Metric:** D30 retention (target: +20% for users with agents who have ≥10 completed tasks vs. fresh-agent users). Tasks per agent per month (target: grows ≥10% per month in month 2+ for memory-enabled agents). `[REQUIRES VALIDATION BEFORE BUILD]` — assumes higher task count correlates with measurably better output quality.

**Revenue vector:** Memory storage caps as a tier differentiator. Free: 10 memories per agent. Pro: unlimited + export. Team: shared workspace memory (brand voice shared across all agents). Oldest memories become the reason to upgrade.

**Confirmation signal (60 days):** Users with agents who have ≥10 completed tasks churn at ≤50% the rate of users with fresh agents.

**Conviction:** `[HIGH]`

---

### Gap 5: The Office is a Stage Set, Not a Progress Timeline

**Current state:** The isometric office is programmatically beautiful. Every user sees the same scene. The office does not change based on what the team has accomplished. There's no record that anything has happened here.

**Steelman:** A polished, consistent scene is better than a half-finished customization system. Ship complete before adding personalization.

**Archetype it fails:** The Lean Operator, whose core identity need is building something visible — a "company" they can point to.

**The leap:** The Living Office — office elements respond to productivity milestones. A new bookshelf row fills in after the Content Writer completes 10 tasks. A trophy appears when a task runs without an approval gate for the first time. The rug changes color seasonally. After 30 tasks, a whiteboard appears on the wall with the last briefing. The office becomes a progress timeline, not a stage set.

**Behavioral shift:** Users open the office to see what changed, not just to delegate. The session that begins as "check my agent" becomes "what did my office earn today."

**The moat:** An office that reflects 6 months of accumulated productivity is not just personal data — it's a visual artifact of a user's work. Leaving means losing a timeline.

**Metric:** Sessions per week (target: +25% for users with ≥1 office unlock vs. those without). Average session length (target: +40%). Viral sharing rate (unlocked offices are shareable screenshots).

**Revenue vector:** Premium office skins, trophy case designs, and desk upgrades as cosmetic Pro features. "My Team" shareable card is a word-of-mouth acquisition driver.

**Confirmation signal (60 days):** Users with ≥1 office unlock return the next day at ≥30% higher rates than those without.

**Conviction:** `[MEDIUM]`

---

**Competitor most likely to exploit an open gap in 6 months:** Gap 2 (out-of-app ambient awareness). Lindy.ai already has a notification system and recurring runs. Gap 1 (command library + scheduling) is the second-most-exposed gap.

**`[PHASE SIGNAL]` — Gap 4: Agent Memory & Voice.** This is the only gap that, if closed, makes every other feature stickier. The visual office is beautiful, but agents with institutional memory are the reason users structurally cannot leave. Everything else is a feature. Memory is the moat.

*Founding Team Awareness Check: Agent memory is almost certainly known as a concept. What has blocked execution is likely: (a) uncertainty about the memory architecture (RAG vs. structured state vs. vector store), and (b) reluctance to commit to a schema that might need to change. The blocker is design indecision, not engineering capacity. The fix: ship the simplest possible v1 — 10 editable key-value pairs per agent, injected into the system prompt — before the architecture is perfect.*

---

## PHASE 2 — ADVERSARIAL RED TEAM

### The Battlefield

| Competitor | Est. Market Position | Shared User Segment | Feature They Have That AgentCity Lacks |
|---|---|---|---|
| Lindy.ai | ~50K MAU, Series A | Solo operators, automation-first users | Trigger-based automation (recurring tasks, no user input required) |
| Zapier AI Agents | >3M MAU (Zapier base) | SMB operators, delegation-minded PMs | 6,000+ native app integrations; zero OAuth setup friction |
| Notion AI | >30M MAU (Notion base) | Knowledge workers, PMs | Embedded AI inside existing workflow — no context switching |
| Character.AI | >20M DAU, consumer AI | Users who want relationship with AI, not just output | Persistent personality, emotional continuity, social community around personas |

---

### Lindy.ai — inhabiting their product team

**Feature they'd ship:** "Recurring Agent Runs" — set any task on a schedule (daily brief, weekly digest, Monday prep list) with one click after any successful run. No command entry required; agent executes autonomously in the background.

**Emotional wound exploited:** Users who complete the AgentCity gift task feel excited — then realize they have to re-type the same command next Monday. Lindy is the product that removes that re-typing forever.

**User segment most likely to defect:** The Delegator-in-Training. Their switching cost is currently zero — no memory history, no command library, no office unlocks, no trust profiles. Lindy offers scheduling + notifications with zero visual friction.

**Counter-move:** Ship Command Library with "Schedule Weekly" before Lindy makes it their core positioning against AgentCity. This must land within 30 days. The scheduling feature alone does not differentiate; the combination with agent memory (recurring tasks improve with each run because the agent remembers what worked) is the wedge Lindy cannot match.

**Window:** 60 days.

---

### Zapier AI Agents — inhabiting their product team

**Feature they'd ship:** "One-Click Agent Bootstrap from Your Zaps" — import any existing Zap as an AgentCity-equivalent AI agent. Zapier's 3M users bring their entire automation history into an AI agent experience. 6,000 app connectors become the integration library. Zero OAuth setup.

**Emotional wound exploited:** AgentCity requires Composio OAuth setup per integration. That's 3–5 minutes of friction per tool. Every Zapier user has zero minutes of friction for tools they already use.

**User segment most likely to defect:** Any AgentCity user who runs OPS_COORDINATOR or EXEC_ASSISTANT agents and discovers Zapier's integration breadth. Their switching cost is actually negative — they'd *gain* functionality by leaving.

**Counter-move:** AgentCity cannot compete on integration breadth. The counter-positioning is explicit: *"Zapier automates. AgentCity decides."* Lean into the intelligence layer — judgment, approval gates, memory — not the connection layer. The visual office plus agent memory are the wedge. A user whose Content Writer agent knows their brand voice after 20 tasks will not leave for a system that requires re-pasting their brief every time.

**Window:** 90 days. Zapier moves slowly on product (org size) but their distribution advantage makes this existential.

---

### Notion AI — inhabiting their product team

**Feature they'd ship:** "Notion Agent" — an AI agent that lives inside Notion pages, databases, and task boards. "Assign to Alex" inside an existing workflow. Users don't switch context; their agent appears where they already work.

**Emotional wound exploited:** AgentCity is a destination app. Users have to open it, switch context, type a command. Notion AI eliminates every one of those steps for users who already live in Notion.

**User segment most likely to defect:** The Delegator-in-Training. They live in Notion. If Notion's agent can handle their content drafts and task summaries inside their existing workspace, AgentCity is dead for this archetype.

**Counter-move:** Develop outbound integrations that surface agent outputs *inside the tools users already live in* — a Slack message when a task completes, a Notion page update written by the agent, an email delivered to the inbox. The office is the power-user destination; the outputs appear everywhere. No one leaves a product that delivers finished work to where they already are.

**Window:** 90 days. Notion AI already exists; the agentic layer is the obvious next feature.

---

### Character.AI — the category-adjacent threat (12-month horizon)

**Feature they'd ship:** "Professional Persona Network" — AI agents with consistent personalities, shareable profiles, and community ratings. "Hire Alex from the marketplace, rated 4.9/5 for research tasks by 2,000 users." The hiring metaphor, but social.

**Emotional wound exploited:** AgentCity agents have no personality continuity. Character.AI would give users agents who feel like real people — with histories, quirks, community-validated reputations, and a sense that others are working with the same agent.

**User segment most likely to defect:** The Lean Operator who values the "team feel" narrative most acutely.

**Counter-move:** Agent Memory & Voice is the direct counter. AgentCity's agents become more personal than any marketplace persona because they learn *your specific* preferences, not a generic archetype. The personalization moat beats the community moat for professional use cases.

**Window:** 12+ months. Medium-term threat.

---

### The Churn Autopsy

*User: The Delegator-in-Training. Sarah. Marketing manager at a 30-person B2B SaaS company.*

Device: MacBook Pro, 27-inch external monitor. Time: 9:15 AM on a Tuesday. Context: Saw an AgentCity tweet the night before, signed up this morning before her first standup.

**First screen:** Onboarding — Role step. She picks CONTENT_WRITER. That's where she loses the most time every week.

**Expected to find:** A way to upload her brand voice, tell the agent about her audience, and see it produce something that sounds like her.

**The exact UI moment where disengagement crystallized:** The Identity step. She names the agent "Jamie." She sees the avatar style buttons — Professional, Creative, Casual, Executive. She clicks Creative. She sees Presentation — Feminine, Masculine, Neutral. She clicks Feminine. She presses "Generate Jamie →." An avatar appears. She thinks: *"This is cute. But I can't tell Jamie anything about my brand."* She looks for a text field. There isn't one.

**What she opened instead:** ChatGPT. Pasted her brand brief. Asked for a LinkedIn post. 2 minutes. Done. Closed the AgentCity tab.

**Feature that failed her:** The identity step has no context-seeding moment. There's no place to tell Jamie about tone, audience, or company voice. The customization is cosmetic, not functional.

**The one change that would have kept her:** A "Tell Jamie about your work" textarea during the Identity step — 3–5 sentences about your company, your audience, and your communication style. This seeds the agent's first output. The gift task then produces something that sounds like *her*, not a generic template. The first impression becomes a retention event instead of a churn trigger.

---

### The 12-Month Nightmare

AgentCity launches. The visual layer generates strong early press — "SimCity for AI agents" comparisons, Product Hunt #1 of the day. D1 retention hits 60%+ because the office is genuinely impressive and the gift task works. Then D7 retention collapses to 15–20% because there is no pull-back mechanism, no recurring trigger, no out-of-app signal that anything is happening. Users who churn in Week 1 leave reviews that say "cool concept, not sure how to use it day-to-day."

By Month 3: 1,200 free signups, 50–70 Pro conversions (4–6% conversion rate, below the 8% needed for healthy unit economics). Revenue: ~$2,000–2,700 MRR. Flat. Growth stalls because there is no viral loop, no retention hook, and task quality variance causes 15% of power users to reduce usage after a bad output.

By Month 6: A competitor (likely Lindy) ships scheduled recurring tasks and a notification system. Users comparing the two platforms see feature parity on the functional layer, choose Lindy for the integrations, and choose AgentCity only for the visuals — which is not a durable buying reason.

By Month 12: ~300–500 DAU, flat or declining. Investor narrative: *"Great demo, weak retention. The visual novelty wore off. The task quality variance is too high for users to trust it with critical work."* Series A story is impossible. The company is fundable only as an acqui-hire for the Pixi scene tech.

**Estimated outcome if nothing changes: DAU at month 12 is <500. Not fundable.**

---

### Internal Failure Mode Audit

**Failure Mode 1: Task quality variance creates trust erosion at scale**

Design choice: LangGraph + Claude Sonnet 4.6 runs tasks autonomously against real Composio tools. No quality floor — a poorly seeded agent with vague context produces vague output.

Failure mode at scale: At 500+ active users, 10–15% of tasks produce outputs that are wrong, irrelevant, or confusingly formatted. Users share screenshots mocking the outputs. The positioning shifts from "AI employees" to "AI interns that need constant supervision."

Early warning signal: Task completion rate (user accepts the result without retry) drops below 70%. Watch for this declining >5% week-over-week. Support tickets containing the phrase "wrong output" exceeding 3 per week.

**Failure Mode 2: Approval gate fatigue kills power users**

Design choice: All destructive tool calls route through the approval gate. Architecturally correct for safety; user-experience costly for volume delegators.

Failure mode at scale: Power users who delegate heavily hit approval gates 5–10 times per day. They either auto-cancel tasks to avoid friction or stop using agents for complex workflows entirely. The users most likely to pay for Pro are the same users most likely to be killed by approval gate fatigue.

Early warning signal: Approval response time median exceeds 24 hours (users deferring approvals to "later" = effective churn). Tasks cancelled at the approval gate exceeding 20% of all approval-required tasks.

---

**`[PHASE SIGNAL]` — The Churn Autopsy.** The single vulnerability is this: users cannot tell their agents anything about who they are or what they need during setup. The gift task feels generic because it is generic. Without context-seeding at onboarding, the agent's first output is always a guess — and the first output is the trust threshold. A user who sees a generic gift task result concludes the product is a demo, not a tool.

*Founding Team Awareness Check: The "brief your agent" moment is almost certainly known. It was likely deprioritized because onboarding already has 5 steps and adding a 6th felt like over-engineering for a v1. The fix is not a 6th step — it's embedding a textarea in the Identity step (Step 2). One field. One afternoon of engineering. The ROI on this is the highest of any item in the product.*

---

## PHASE 3 — THE JTBD EXCAVATION

### Anchoring Signals

All `[HYPOTHESIS — requires validation]` — no real user data at pre-launch stage. These are candidate statements that real users would say:

1. `[HYPOTHESIS]` "I just want someone else to do my email triage and actually handle it, not just summarize it." — Delegator
2. `[HYPOTHESIS]` "I've been running this company for 2 years with just me. I want to feel like I have a team even if I don't." — Lean Operator
3. `[HYPOTHESIS]` "Every AI tool feels like a tool. I want something that feels like a colleague." — Both archetypes
4. `[HYPOTHESIS]` "I set up an AI workflow once and it took 4 hours. I never did it again." — Delegator (Zapier migrant)
5. `[HYPOTHESIS]` "I want to open something and see things happening, not just a chat window." — Lean Operator

---

### JTBD — The Lean Operator

**Surface Job:** "I want to run recurring tasks without doing them myself."

**Real Job:** "I want to feel like a capable leader who has a real team working for them."

**Hidden Job:** "I am building something, and the proof that it's real is that I have a team, not just ideas."

**JTBD Translation Test:** *"Your AI team. No headcount required."* — This is the headline that makes them feel *finally, something built for me*. Generic enough to be readable, specific enough to trigger the identity response.

---

### JTBD — The Delegator-in-Training

**Surface Job:** "I want to offload content and ops grunt work."

**Real Job:** "I want to reclaim time for the work that actually uses my skills."

**Hidden Job:** "I am a capable operator who should be trusted with more important work, not buried in execution."

**JTBD Translation Test:** *"Stop doing the work your agent should be doing."* — Confrontational framing that lands with the Delegator who knows exactly which tasks they shouldn't be doing but can't stop.

---

### Cross-Phase Check

Phase 1's `[PHASE SIGNAL]` was Agent Memory & Voice. The JTBD layer most under-served by that gap is the **Hidden Job of the Lean Operator** — "the proof that I'm building something real is that I have a team." An agent with no memory isn't a team member; it's a stateless API. The highest-leverage retention unlock is making agents feel like they know the user — which requires memory. Name it explicitly: **the Hidden Job is the unlock, and Agent Memory is the mechanism**.

---

### Retention Engine Design

**Mechanism 1: Investment Lock-In**

Existing feature: Task history (currently not surfaced in a structured way)
New capability: Agent Memory Core — after each task, the agent identifies and saves 1–3 learnings as key-value pairs ("prefers bullet point summaries," "target audience: B2B SaaS PMs," "brand voice: direct and data-forward"). Users can view and edit their agent's memory profile. Over time, outputs move from 60% → 90% first-draft quality.

Metric proves loop closing: Tasks per agent per month grows ≥10% month-over-month for users in month 2+. D30 retention increases ≥20% for users with agents who have ≥10 completed tasks.

Failure mode: Users feel their agents are "spying" — the memory feature feels surveillance-like rather than collaborative. "Alex remembered I prefer bullet points" reads as helpful; "Alex noticed you always reject the first draft" reads as judgmental.

Detection signal (30 days before failure): NPS drops specifically from the cohort of users with 10+ completed tasks (the most exposed group). If this cohort's NPS trails the general NPS by >10 points, the framing is wrong.

**Mechanism 2: Identity Fusion**

Existing feature: Named agents with avatars, the isometric office scene
New capability: "My Team" shareable card — a formatted image showing each agent's name, role, tasks completed this month, and one standout output. One tap to generate, optimized for LinkedIn and X. The office screenshot as a professional artifact.

Metric proves loop closing: Viral coefficient (K-factor) from shares (target: K > 0.3 within 90 days of shipping). Each share that converts one new signup at Day 7 or later is worth tracking — that is the identity fusion working.

Failure mode: Users who share and get zero engagement feel embarrassed. The card must never make low task counts feel like underperformance. Frame it as "Your team's first week" rather than "Your team's stats."

Detection signal: Share rate falls below 5% of active monthly users, or shared cards appear on social with mockery rather than genuine interest.

**Mechanism 3: Progress Visibility**

Existing feature: Task result history, the Living Office (proposed gap)
New capability: Weekly Office Brief — every Monday at 9am, a 3-sentence email from the "CEO agent" summarizing: what the team accomplished last week, what's queued for this week, and one proactive recommendation. This is the out-of-app presence gap (Gap 2) implemented as a ritual.

Metric proves loop closing: D7 retention (target: +18% for users who open the Monday brief vs. those who don't). Email open rate target: ≥40% sustained through month 3.

Failure mode: The brief becomes formulaic and users stop opening it by week 4. A task-list disguised as a brief is not a brief. The CEO agent's recommendations must be specific and actionable ("Jordan completed 3 research tasks — consider scheduling a standing research request every Monday at 8am") not generic ("Great week! Keep it up.").

Detection signal: Email open rate falls below 25% by week 4, or in-app brief click-through falls below 15%. Either signal means the content is templated, not personalized.

---

**`[PHASE SIGNAL]` — Investment Lock-In via Agent Memory is the mechanism that makes churn structurally difficult.** An agent that has processed 30 tasks and knows your brand voice is not something you abandon for a competitor. Every successful task increases the switching cost. The Memory Profile UI makes this lock-in *visible* — users can see the compounding value, which makes leaving feel like loss. This is the mechanism that converts AgentCity from a tool into infrastructure.

*Founding Team Awareness Check: Agent memory architecture is likely partially designed. What's blocking execution is the RAG vs. structured state vs. vector store decision. The unblocking move: ship structured key-value memory (10 pairs per agent, editable by user, injected into system prompt as a formatted block) in the next sprint. Do not wait for the perfect architecture. The first-draft moat is worth more than the perfect memory system.*

---

## PHASE 4 — THE 10X FEATURE LAB

**Cross-Phase Inventory Before Proposing:**

Phase 2 competitive threats unanswered: Lindy (recurring/scheduled tasks), Zapier (integration breadth), Notion (embedded workflow — answered by outbound agent outputs)
Phase 1 gaps unaddressed: Out-of-app ambient awareness (Gap 2), Agent Memory (Gap 4)
Phase 3 JTBD layers without retention mechanism: The Delegator's Hidden Job — "I should be trusted with more" — no feature currently makes them feel promoted by their agent's output quality improving

---

### 10x Feature 1: Agent Memory Core

**The idea:** Each agent maintains a persistent, editable memory of your preferences, brand voice, contacts, and past output patterns — and uses it automatically in every task, producing measurably better output with each interaction.

**Archetype it serves:** The Lean Operator, in the Working activation state (tasks being executed)

**Why it wins:** The endowment effect. Once users see "Alex has learned that you prefer bullet-point summaries over paragraphs," they cannot imagine going back to a stateless AI. This is loss aversion deployed at the product level. The user's data makes the product feel irreplaceable.

**The Trojan Horse test:** Yes. The initial implementation is a simple structured key-value store — 10 editable pairs per agent. This looks lightweight in sprint planning. But it creates compounding data moat as users accumulate months of calibration. A competitor cannot replicate 6 months of accumulated preferences without asking the user to re-enter everything. The trojan horse is that the data is deeply personal and completely non-exportable.

**What it requires:** 3–4 engineer-weeks. Prisma model: `AgentMemory { id, agentId, key, value, source, confidence, createdAt }`. Memory retrieval: top-10 memories injected into LangGraph system prompt as a formatted block on task start. UI: memory panel on agent profile page with editable list. Hardest dependency: defining what's worth remembering automatically (requires heuristics or a lightweight classifier run on task output + user edits).

**Day 1:** User completes their first real task. After the result appears, a new panel slides in: "Alex learned something from this task. She now knows you prefer concise summaries. Want to add anything?" The user types "Our target customer is a B2B SaaS PM with a team of 5." Alex saves it. The next task system prompt now includes this context.

**Day 180:** Alex has 34 memories accumulated. The user's LinkedIn post drafts don't need editing anymore. Alex's first draft is at 90% instead of 60%. The user delegates without reviewing because the quality threshold is reliable. They could not switch to another AI without starting over from zero. They don't.

**Second-order effects:** Support queue will receive "Alex remembered something wrong" tickets — requires a clear memory editing UI (delete, override) from day one. Some users will be uncomfortable that the agent "knows things" — framing is critical. "Alex's notes about you" feels safer than "Alex's memory." The feature must have a one-click "clear all" option visible at all times.

**Failure mode at high adoption (40% engagement):** Users with hundreds of memories face retrieval noise — the agent pulls irrelevant context from months ago and produces slightly off-brand outputs. Requires memory decay (lower confidence for older memories) and a relevance filter before the feature hits this scale. At low adoption: memories stay sparse and the compounding effect isn't visible, making the feature feel like a gimmick.

**Revenue vector:** Memory storage caps as a tier differentiator. Free: 10 memories per agent. Pro: unlimited memories + memory export. Team: shared workspace memory (brand voice and customer context shared across all agents in a workspace). The oldest, most valuable memories become the reason to upgrade from Free to Pro.

**Moat score: 9/10.** To replicate: a competitor needs the user to re-enter all preferences manually, or build an import tool that doesn't exist anywhere in the category. The data itself is the moat. The time to replicate for a well-funded competitor is 12–18 months of user re-accumulation.

---

### 10x Feature 2: Recurring Agent Runs

**The idea:** Any command that succeeds can be scheduled to run automatically — daily, weekly, or on a custom trigger — with the agent completing it without user input and delivering results directly to the user's email, Slack, or in-office.

**Archetype it serves:** The Delegator-in-Training, in the post-activation state (after first successful task)

**Why it wins:** This is the shift from tool to infrastructure. The moment an agent runs on Tuesday morning without the user asking, the product becomes mission-critical. Missing AgentCity's Monday brief feels like coming in to find your assistant didn't show up. The user now has a calendar dependency on the product.

**The Trojan Horse test:** Yes. The UI is one button: "Run this every Monday at 9am." The infrastructure underneath (cron scheduling, async LangGraph runs without an active user session, result delivery pipeline) is 5–6 engineer-weeks. Users never see the complexity. Once a recurring task has run 4 times without incident, the user builds their Monday routine around its output. That's a behavioral dependency that is functionally irreversible.

**What it requires:** 5–6 engineer-weeks. Upstash QStash for cron scheduling (or node-cron inside the API). `POST /api/tasks/schedule` endpoint with cron expression. Async LangGraph execution without a live browser session. Result delivery: email first (SendGrid), then Slack. Hardest dependency: handling task failures gracefully — a recurring task that fails silently is worse than no task at all. Failure must notify immediately via email.

**Day 1:** User runs "Give me a digest of this week's industry news in my sector" and gets a strong result. A prompt appears below the result: "Want Alex to do this every Monday morning?" They click "Yes — every Monday at 9am."

**Day 180:** The user's Monday brief from Alex is the first thing they read with their coffee. Their team has started asking "what did your AI say this week?" It has become a status artifact in their workflow. They are paying for Pro because the free tier's 5-task limit is consumed by the first recurring task within a month.

**Second-order effects:** Recurring tasks consume credits autonomously. Users will be surprised by a large credit bill if they don't notice the consumption rate. Requires a pre-task notification ("Alex is about to run Monday Brief — this will use 1 credit") and a spend cap setting. Support will receive "why did this run without me asking" tickets in the first 2 weeks.

**Failure mode at high adoption:** Server load spikes on Monday mornings when all recurring tasks execute simultaneously. Requires distributed scheduling with jitter (randomize execution within ±30 minutes of the set time). At low adoption: users set up recurrences they forget about, feel surveilled when the task runs, and report "my agent ran without permission" — which requires clear in-app and email confirmation of all scheduled runs.

**Revenue vector:** Recurring tasks are the strongest Pro conversion driver in the product. Free tier users hit their 5-task limit within the first week of having a recurring run. The upgrade moment is immediate and natural: "You've used your 5 free tasks. Upgrade to Pro for unlimited recurring runs — $39/month."

**Moat score: 7/10.** Lindy already has scheduling. The moat is not the feature alone but the combination: scheduling + agent memory (recurring tasks improve with each run because the agent remembers what worked) + the visual office (seeing your agents working autonomously when you open the office on Monday morning creates emotional connection that Lindy cannot match).

---

### 10x Feature 3: The Team Brief

**The idea:** Every Monday at 9am, the user receives a formatted "office brief" generated by a CEO meta-agent — summarizing what the team accomplished last week, what failed and why, what's scheduled this week, and one proactive recommendation per agent. This is not a notification. It is a weekly performance review of your AI workforce.

**Archetype it serves:** The Lean Operator, in the passive activation state (between active sessions)

**Why it wins:** This is the out-of-app presence gap (Phase 1, Gap 2) implemented as a product ritual. The brief makes the user feel like they are running a real company — receiving a weekly report from their team is the exact Hidden Job the Lean Operator has. The moment a user reads "Jordan completed 4 research tasks this week. Recommendation: consider adding a weekly competitive analysis to Jordan's schedule" — they feel like a manager, not a user.

**The Trojan Horse test:** Yes. The brief looks like a weekly email. It is actually a product touchpoint that creates a behavioral ritual. Users who read their Monday brief 4+ weeks in a row have anchored their Monday morning routine to AgentCity. The brief is the anchor for the identity fusion retention mechanism. A competitor can send a digest; they cannot send a digest that references 6 months of accumulated agent memory and performance patterns.

**What it requires:** 2–3 engineer-weeks. Task history aggregation query (tasks completed, failed, queued per agent). A "CEO meta-agent" prompt that synthesizes across all agents' outputs into a formatted brief. SendGrid for delivery. Hardest dependency: making the proactive recommendation from each agent feel genuine rather than templated — requires using agent memory + task history to generate a specific, non-generic recommendation.

**Day 1:** User receives their first brief on Monday. It shows: "Alex completed 3 tasks this week. Jamie is scheduled to draft 2 posts next week. One recommendation: your email response time to Jordan's output has averaged 48 hours — consider adjusting the approval window to reduce backlog." The user feels like they have a real office manager.

**Day 180:** The user reads their brief before looking at Slack. They forward the "team performance" section to their co-founder. "My AI team hit its KPIs this week." This is a real sentence they say.

**Second-order effects:** Users who receive briefs with low task counts feel like their "team" is unproductive — a subtle shame response that can create churn. The brief must frame low weeks positively ("Your team is ready for more delegation. Here are 3 suggestions based on what Alex knows about your work."). The support queue will receive requests for brief customization within 30 days of launch.

**Failure mode at high adoption:** Briefs become formulaic. Users stop opening them after week 4 when they realize it's a reformatted task list. Requires rotating formats (milestone callouts, seasonal comparisons, streak recognition) to maintain open rates above 35%.

**Revenue vector:** Brief depth is a tier differentiator. Free: plain text brief. Pro: formatted brief with credit usage, per-agent recommendations, and month-over-month comparison. Team: shared brief that goes to all workspace members — CEO-level summary of the full AI workforce. Direct upgrade driver.

**Moat score: 6/10.** The format is replicable. The moat is the agent memory that makes each brief genuinely personalized. A competitor can send a digest; not one informed by 6 months of accumulated output patterns.

---

**`[PHASE SIGNAL]` — Agent Memory Core is the 10x feature that makes the others feel incremental.** Without memory, Recurring Runs repeat the same quality level indefinitely. Without memory, the Team Brief is a formatted task list. Without memory, every feature in the product is a demonstration, not a compounding asset. Memory is the substrate.

*Founding Team Awareness Check: A version of this has been discussed and not built. The blocker was architectural uncertainty. The unblocking action is immediate: scope the simplest possible v1 (10 editable key-value pairs per agent, injected into the LangGraph system prompt) and ship it before the architecture is perfect. Waiting for the perfect memory system means never building the moat.*

---

## PHASE 5 — THE PRIORITIZATION MATRIX

**Team context:** 1 founder-engineer. Sprint velocity: ~1 feature/week. Hard constraint: no native mobile app, no full Stripe billing system in 90 days.

**Scale sensitivity:** Pre-launch, <1K DAU. Word-of-mouth impact scores 2× at this scale. Retention impact scores at standard weight.

| Item | Impact (1–5) | Effort (1–5) | Ratio | Tier |
|---|---|---|---|---|
| "Brief your agent" textarea in Identity step | 5 | 1 | 5.0 | **NOW** |
| Agent Memory Core v1 (structured key-value) | 5 | 3 | 1.67 | **NOW** |
| Command Library + "Run again" | 4 | 2 | 2.0 | **NOW** |
| Weekly Office Brief (email digest) | 4 | 2 | 2.0 | **NOW** |
| Approval Gate v2 (inline edit + trust toggle) | 4 | 2 | 2.0 | **NOW** |
| Recurring Agent Runs (cron scheduling) | 5 | 4 | 1.25 | **NEXT** |
| Out-of-app task notification (email on complete/approval) | 4 | 2 | 2.0 | **NEXT** |
| Agent Report Card (task learning summary panel) | 4 | 3 | 1.33 | **NEXT** |
| Living Office (productivity unlocks) | 3 | 4 | 0.75 | **LATER** |
| "My Team" shareable card | 3 | 2 | 1.5 | **LATER** |

**Sequencing check:** "Brief your agent" (NOW, effort 1) is a prerequisite for Agent Memory (NOW, effort 3) to feel complete — the textarea provides the first memories. Ship them in the same sprint, in sequence. Out-of-app notification (NEXT) is a dependency for Recurring Agent Runs (NEXT) — failure notifications on autonomous runs require email delivery to already be live. Unblock notification first.

---

### NOW — Ship within 30 days

**1. "Brief your agent" textarea in Identity step**
Owner: Founder. First physical action: Add a `<textarea>` to [onboarding/page.tsx](apps/web/src/app/onboarding/page.tsx) Identity step with placeholder "Tell Alex about your company, your audience, and your voice (3–5 sentences)." Store as `agent.contextBrief` (add column to Prisma schema). Inject into every LangGraph task system prompt. Estimated: 1 afternoon.

**2. Agent Memory Core v1**
Owner: Founder. First physical action: Define `AgentMemory` Prisma model. Build `GET/POST/DELETE /api/agents/:id/memory`. Add memory injection to `execute-step.ts` system prompt construction. Add memory panel to agent profile page. Estimated: 3–4 engineer-days.

**3. Command Library + "Run again"**
Owner: Founder. First physical action: Add `SavedCommand` Prisma model (rawCommand, taskTitle, agentId, userId, usedAt). Auto-save on `TASK_COMPLETE`. Add "Saved Commands" panel to office sidebar. "Run again" calls `POST /api/tasks` with the saved rawCommand. Estimated: 2 engineer-days.

**4. Approval Gate v2 (inline edit + trust toggle)**
Owner: Founder. First physical action: Update the approval response UI to render the pending tool's parameters as editable form fields. Add "Trust this action type" checkbox. Store trust profile as `agent.trustProfile` JSON. Estimated: 2 engineer-days.

**5. Weekly Office Brief (email)**
Owner: Founder. First physical action: Integrate SendGrid. Write the brief generation query (tasks completed/failed/queued per agent, last 7 days). Write the CEO meta-agent prompt. Schedule via `setInterval` or cron for Sunday 9pm. Ship as plain HTML email. Estimated: 2–3 engineer-days.

---

### NEXT — 60–90 day roadmap

**1. Recurring Agent Runs**
Dependency that must resolve first: Email delivery (SendGrid) must be live for failure notifications. QStash provisioned or node-cron implemented in API.
Owner: Founder. First physical action: Implement `POST /api/tasks/schedule` endpoint with cron expression storage. Wire QStash webhook receiver.

**2. Out-of-app task notification (email)**
Dependency: SendGrid live (unblocked by Weekly Brief shipping).
Owner: Founder. First physical action: Call `sendEmail(user.email, ...)` on TASK_COMPLETE and NEEDS_APPROVAL events inside `events.service.ts`.

**3. Agent Report Card panel**
Dependency: Command Library must ship (need task history with frequency signals).
Owner: Founder. First physical action: Design the report card data model — task count, most-used commands, user edit rate post-output (proxy for output quality), credits consumed. Render as a panel on the agent profile page.

---

### LATER — 6–12 month investments

**1. Living Office (productivity unlocks)**
Build when: DAU ≥500 AND D7 retention >35%. Below this threshold, cosmetic office features don't move the needle and the engineering time is better spent on retention mechanics.

**2. "My Team" shareable card**
Build when: Organic shares (Twitter/LinkedIn mentions) of office screenshots appear unprompted from ≥10 users. That signal confirms the identity fusion mechanism is active before we invest in a dedicated format.

---

### The 3-in-90 Forcing Function

*Three items only. This is the order:*

**1. "Brief your agent" textarea** — costs 1 afternoon, fixes the single biggest churn trigger (the Churn Autopsy), and seeds agent memory. Every other improvement is built on the quality of the first output.

**2. Agent Memory Core v1** — every week without it is a week users have zero switching cost. Ship the simplest version (10 editable key-value pairs) before the architecture is perfect. The moat starts accumulating from the first memory stored.

**3. Recurring Agent Runs** — converts AgentCity from a tool users visit to infrastructure they depend on. Once a recurring task runs autonomously on Monday morning, the product becomes unavoidable.

*Order justification:* (1) fixes the entry trust gap. (2) creates the lock-in moat. (3) makes the product unavoidable. Each depends on the previous one being live to reach its full impact.

---

## FINAL DELIVERABLE — THE DOMINATION BLUEPRINT

---

### 0. Cross-Phase Convergence Map

| Insight | Phase | Connected phases | Conviction |
|---|---|---|---|
| Agent Memory is the deepest moat and the single retention mechanism that makes churn structurally difficult | Phase 1 (Gap 4) | Phase 3 (lock-in mechanism), Phase 4 (10x Feature 1 + signal), Phase 5 (NOW #2) | `[HIGH]` |
| The first output is the trust threshold — the "brief your agent" gap is the primary churn driver | Phase 2 (Churn Autopsy) | Phase 1 (Gap 4 prerequisite), Phase 5 (NOW #1) | `[HIGH]` |
| There is no retention loop — the product is a transaction, not a habit | Pre-Flight | Phase 1 (Gap 2), Phase 3 (engine design), Phase 4 (10x Feature 3) | `[HIGH]` |
| Recurring Agent Runs converts AgentCity from tool to infrastructure — and is the primary Pro upgrade trigger | Phase 2 (Lindy counter-move) | Phase 4 (10x Feature 2), Phase 5 (NEXT #1) | `[HIGH]` |
| Approval gate friction kills the power users most likely to pay for Pro | Phase 1 (Gap 3) | Phase 2 (Internal Failure Mode 2), Phase 5 (NOW #4) | `[MEDIUM]` |

Multi-phase items are the highest-conviction priorities. Every item above appears in at least 3 phases — build in the order specified.

---

### 1. Product Fingerprint — Confirmed

**Archetypes:** Confirmed as stated in Pre-Flight. No data to validate INFERRED status — the first 20 user interviews should confirm or rewrite Archetype 2 (Delegator-in-Training) specifically. The Lean Operator's JTBD is strongly supported by the product's positioning and the churn autopsy.

**Category Hypothesis — revised after full analysis:**

*"Users currently file this app under 'AI assistant platform.' That label is wrong because the core experience is visual delegation and team simulation, not conversation or chat. The category this product actually owns is 'AI workforce' — the first product that makes you feel like you're managing a team, not operating a tool."*

**Critical Assumption Stack — post-analysis status:**
- **A1** (visual layer = retention driver): Unvalidated. The D7 retention data will confirm or break this in the first 60 days. If D7 < 20%, the visual layer is novelty only and the product must re-anchor entirely on task quality. Monitor before investing further in Pixi features.
- **A2** (task quality = trust by Week 2): Unvalidated. This is the most dangerous assumption. If task output quality is too variable, no memory system or visual layer compensates. Validate by measuring the rate at which users edit, reject, or retry task outputs.
- **A3** (team narrative = felt): Unvalidated. The Churn Autopsy strongly suggests the narrative fails at the identity step when users cannot brief their agent. The "brief your agent" textarea (NOW #1) is the direct test. If it ships and D7 retention does not improve, assumption A3 may be wrong at the archetype level.

---

### 2. Five Upgraded Pillars

**Pillar 1: Command Library** (from Gap 1)
Every successful task auto-saves as a named template with the actual result attached. "Run again" is one click. "Schedule weekly" is the next click. The command bar goes from a blank box to a personal playbook.
Serves: Delegator-in-Training. Behavior change: Users open the office to execute, not invent. D30 retention target: +12–18%. Revenue: Shared command libraries unlock Team tier upgrade.
`[HIGH]`

**Pillar 2: The Ambient Office** (from Gap 2)
Weekly Monday brief (email from CEO agent) + immediate email notification on TASK_COMPLETE and NEEDS_APPROVAL. The office becomes a place users return to — not just a place they leave running.
Serves: Both archetypes. Behavior change: Users build a Monday ritual around the brief. D7 retention target: +15–22%. Revenue: Rich brief formatting (Pro) vs. plain text (Free).
`[HIGH]`

**Pillar 3: Approval as Dialogue** (from Gap 3)
The approval gate renders exact tool parameters as editable form fields. "Trust this action type" toggle builds permission profiles. After 3 approvals of the same pattern, the system suggests auto-approve.
Serves: Lean Operator. Behavior change: Users feel they're training their agent, not managing it. Task completion rate target: +8–12%. Revenue: Auto-approve profiles as Pro feature.
`[MEDIUM]`

**Pillar 4: Agent Memory & Voice** (from Gap 4)
Each agent accumulates a persistent, editable memory of preferences, brand voice, and output patterns. Injected into every task. Every output gets better. Switching to a competitor means starting over.
Serves: Both archetypes. Behavior change: Users stop treating agents as tools and start treating them as colleagues. D30 retention target: +20% for agents with ≥10 tasks. Revenue: Memory storage caps drive Free → Pro upgrade.
`[HIGH]`

**Pillar 5: The Living Office** (from Gap 5)
Office elements respond to productivity milestones — new shelves, trophies, whiteboards, color changes. The office becomes a progress timeline that users open to see what changed, not just to delegate.
Serves: Lean Operator. Behavior change: Sessions per week +25% for users with ≥1 unlock. Revenue: Premium office skins and trophy cases as cosmetic Pro features.
`[MEDIUM]`

---

### 3. Nightmare Scenario + Pre-emptive Strike

**The nightmare (12 months, no changes):** ~300–500 DAU, ~60 Pro subscribers, ~$2,400 MRR, flat growth. Lindy ships scheduled recurring tasks at month 3. Notion AI ships an embedded agent at month 6. AgentCity's visual novelty is no longer novel; its functional gaps are exposed. Investor meeting outcome: "Not fundable at a meaningful valuation."

**Pre-emptive strikes:**

Against Lindy (60-day window): Ship Recurring Agent Runs + Command Library before Lindy can position on scheduling. The counter-narrative: "Lindy schedules. AgentCity schedules *and* improves with every run." Metric that proves pre-emption is working: ≥25% of tasks in month 2 are recurring runs. Owner: Founder. First action: Implement `POST /api/tasks/schedule` and QStash integration.

Against Zapier (90-day window): Lean into the intelligence layer, not the integration layer. Publish the "AgentCity vs. Zapier" positioning: "Zapier connects. AgentCity decides." Invest in memory + output quality rather than integration breadth. Metric: User-reported trust score in post-task feedback ("Was this output useful?" thumbs). Early warning signal that pre-emption is failing: users mentioning Zapier in support tickets as a comparison.

Against Notion (90-day window): Ship outbound delivery — agent outputs delivered to Slack and email as first-class results. Users who live in Notion get a notification: "Jordan finished your brief. [View in office] [Open in Notion]." Metric: Click-through rate on outbound delivery notifications (target ≥30%). Owner: Founder. First action: Slack webhook integration as a result delivery option.

---

### 4. The Unfair Retention Hook

**Agent Memory Core** is the single most powerful retention mechanism.

The under-served JTBD layer it closes: The Lean Operator's Hidden Job — "the proof that I'm building something real is that I have a team." A stateless API is not a team member. An agent with 30 accumulated memories of your preferences is.

Specific feature: `AgentMemory` Prisma model + memory injection into LangGraph system prompt + memory panel UI on agent profile page.

Metric that proves the loop is closing: D30 retention is ≥20% higher for users with agents that have ≥10 completed tasks vs. fresh-agent users.

Day 30 behavior: User opens agent profile before starting a new task. They check Alex's memories, add one new context note ("we're targeting Series A startups this month"), and then fire a task without reviewing the brief carefully because they trust the output will be calibrated.

Failure mode if it works too well: Users with hundreds of memories experience retrieval noise — agent pulls irrelevant old context and produces subtly off-brand outputs. Users don't notice immediately; output quality silently degrades.

Detection signal (30 days before failure becomes visible at scale): User "edit rate" on agent outputs increases for users in the 50+ memory cohort, while decreasing for users in the 10–30 memory cohort. If this inversion appears, the memory relevance filter is broken.

---

### 5. Three 10x Features, Ranked by Moat Score

**Rank 1: Agent Memory Core (Moat: 9/10)**
Your AI agents accumulate a permanent, editable memory of your preferences, voice, and patterns — and use it to make every task better than the last.
Serves: Lean Operator (Working state). Mechanism: endowment effect + investment lock-in. Trojan Horse: looks like 10 editable key-value pairs; is actually 6 months of irreplaceable calibration data. Day 1 → 180: Day 1, the user sees "Alex learned: prefers bullet points" and feels delighted. Day 180, Alex's first draft is 90% of the way there and the user cannot imagine starting over with a competitor. Revenue: Memory storage caps drive Free → Pro conversion. Moat justification: a well-funded competitor would need the user to manually re-enter all preferences, or build a memory import tool — 12–18 months of catch-up.

**Rank 2: Recurring Agent Runs (Moat: 7/10)**
Schedule any successful command to run automatically — daily, weekly, or triggered. Your agents work even when you don't open the app.
Serves: Delegator-in-Training (post-activation state). Mechanism: progress visibility + mission-critical dependency. Trojan Horse: one button click; underneath, a full async infrastructure that makes the product unavoidable. Day 1: user sets Monday brief to run automatically. Day 180: their Monday routine starts with the brief, and they've forgotten they "set it up" — it just happens. Revenue: Strongest Pro conversion trigger — Free tier hits 5-task limit within first week of recurring run. Moat justification: scheduling is replicable; scheduling + agent memory (improving recurring tasks) is not.

**Rank 3: Team Brief (Moat: 6/10)**
Every Monday morning, your CEO agent delivers a formatted report on what your team accomplished, what failed, and what's recommended for the week ahead.
Serves: Lean Operator (passive state between sessions). Mechanism: identity fusion — users feel like they're receiving a management report, not a notification. Trojan Horse: email digest; actually a behavioral ritual that makes AgentCity's existence felt on days the user doesn't open the app. Day 1: user reads "Jordan completed 4 tasks. Recommendation: add a weekly competitive analysis to Jordan's schedule." Day 180: user forwards the brief to their co-founder weekly. Revenue: Brief depth (charts, recommendations, month-over-month) behind Pro. Moat justification: format is replicable; content informed by 6 months of agent memory is not.

---

### 6. The Prioritized Build List

**NOW — Monday morning, someone does this:**

1. **"Brief your agent" textarea** | Owner: Founder | Action: Add `<textarea>` to onboarding Identity step; store as `agent.contextBrief`; inject into LangGraph system prompt. 1 afternoon.

2. **Agent Memory Core v1** | Owner: Founder | Action: Define `AgentMemory` Prisma model; build CRUD endpoints; inject top-10 memories into task system prompt; add memory panel to agent profile page. 3–4 days.

3. **Command Library** | Owner: Founder | Action: Add `SavedCommand` model; auto-save on TASK_COMPLETE; add "Saved Commands" sidebar to office; wire "Run again" button. 2 days.

4. **Approval Gate v2** | Owner: Founder | Action: Render approval tool params as editable form fields; add "Trust this action type" checkbox; store trust profile in `agent.trustProfile`. 2 days.

5. **Weekly Office Brief (email)** | Owner: Founder | Action: Integrate SendGrid; write CEO meta-agent prompt; schedule Sunday night execution; ship as plain HTML email. 2–3 days.

**Sequencing dependency resolved:** "Brief your agent" ships first (seeds memories). Memory Core ships second (consumes the brief as first input). Brief (email) ships last because SendGrid is also needed for NEXT items — ship in the same sprint.

---

**NEXT — 60–90 day roadmap:**

1. **Out-of-app task notification** | Dependency: SendGrid live (from NOW #5) | Owner: Founder | Action: Call `sendEmail()` on TASK_COMPLETE and NEEDS_APPROVAL inside `events.service.ts`.

2. **Recurring Agent Runs** | Dependency: Email notifications live (failure alerts require it) | Owner: Founder | Action: Implement QStash or node-cron; `POST /api/tasks/schedule`; async LangGraph run without active session.

3. **Agent Report Card panel** | Dependency: Command Library live (need task frequency data) | Owner: Founder | Action: Build per-agent analytics query; render as a panel on agent profile page.

---

**LATER — 6–12 months:**

1. **Living Office unlocks** | Build when: DAU ≥500 AND D7 retention >35%
2. **"My Team" shareable card** | Build when: Organic social shares of office screenshots appear unprompted from ≥10 users

---

**The 3-in-90 Answer:**

1. **"Brief your agent" textarea** — 1 afternoon, fixes the single biggest churn trigger, seeds everything else
2. **Agent Memory Core v1** — every week without it is a week users have zero switching cost; ship the simplest version immediately
3. **Recurring Agent Runs** — converts a product users visit into infrastructure they depend on

This order is a dependency chain: (1) creates the first memories; (2) accumulates and uses those memories; (3) makes the product run autonomously, cementing mission-critical status.

---

### 7. The Category Declaration

**Pre-Flight hypothesis:** "AI workforce simulator — the first product that makes you feel like a manager, not a user."

**Post-analysis revision:** Confirmed and sharpened.

*"Users currently file this app under 'AI assistant platform.' That label is wrong because assistant platforms are conversation-first and stateless — every session starts from zero. The category this product actually owns is 'AI workforce' — a product where your agents have names, memories, and jobs, where you manage them rather than prompt them, and where the office they work in reflects the work they've done. The one capability that makes every competitor a compromise is Agent Memory: the only AI platform where your agents get better at your specific work every week, making every competitor's blank-box experience feel like starting over."*

**The category declaration (one sentence, for every product decision):**

*AgentCity is the AI workforce platform where your agents know you — and every task makes them better at your specific work.*

Any proposed feature that doesn't make agents more knowledgeable about the user, or more autonomous on their behalf, or more visible as active team members, does not belong in this product.

---

### 8. The Assumption Register — Final State

| # | Assumption | Source | Status | Phase introduced | Risk to top-5 recommendations |
|---|---|---|---|---|---|
| A1 | Visual layer is a retention driver, not novelty | INFERRED | **UNVALIDATED — monitor D7 at launch** | Pre-Flight | HIGH — if wrong, the entire Pixi investment is a cost center |
| A2 | Task output quality is trustworthy by Week 2 | INFERRED | **UNVALIDATED — measure user edit/retry rate** | Pre-Flight | HIGH — if wrong, no memory system compensates |
| A3 | Users feel the "team" narrative, not "bot setup" | INFERRED | **UNVALIDATED — "brief your agent" is the test** | Pre-Flight | MEDIUM — if wrong, re-anchor positioning on productivity, not identity |
| A4 | D7 retention collapses post-gift-task (no pull-back) | INFERRED | **UNVALIDATED — confirms at launch** | Phase 1 | HIGH — the entire NEXT tier depends on this being true |
| A5 | 10+ task users churn at materially lower rates | INFERRED | **UNVALIDATED — test at 60 days with memory live** | Phase 1 | HIGH — Agent Memory Core's moat score depends on this |
| A6 | Delegator churns at identity step due to no context-seeding | INFERRED | **HIGH CONVICTION — Churn Autopsy, but unconfirmed with data** | Phase 2 | HIGH — NOW #1 is built entirely on this assumption |
| A7 | Approval gate friction causes measurable task abandonment | INFERRED | **UNVALIDATED — measure cancellation rate at gate** | Phase 1 | MEDIUM — Approval Gate v2 (NOW #4) deprioritized if this is low |

**Validate A6 first** — it is the highest-conviction unvalidated assumption and drives NOW #1. A single day of user testing on the identity step will confirm or break it. If confirmed, ship the textarea that afternoon.

**Validate A5 second** — it determines whether Agent Memory Core is a moat (HIGH) or a quality-of-life improvement (MEDIUM). The difference is 3–4 months of build-time justification.

---

*Kill Test applied between each phase. Every recommendation above is one the author would stake their product reputation on.*
