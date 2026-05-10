# AgentCity — Project Journal

> A complete record of the design, architecture, and build decisions from first idea to current state.
> Last updated: 2026-05-10

---

## 1. The Pitch

**Original idea:** An AI agent platform where each agent has a visual persona — an avatar with a name, a face, and a role — that lives inside a cinematic 2D "movie mode" office. Users can watch their agents working in real time, see thought bubbles, receive approval gates, and celebrate completed tasks.

The differentiation from every other "AI assistant" product: **you don't just see a chat window, you see your team working.**

---

## 2. The Teardown (Cynical Critique + Counter)

### What could go wrong

| Risk | Severity |
|---|---|
| Pixi / WebGL complexity slows down shipping | High |
| Users don't care about visuals, just results | Medium |
| Composio integration surface area is huge | Medium |
| LangGraph learning curve for the team | Medium |
| Cost blowout on managed LLM | High |

### The counter-proposal

- **Visuals are not decoration — they're the core loop.** The office is the UI. Watching an agent walk to their desk and type is the progress indicator. The visual layer replaces a spinner.
- **Start with programmatic sprites** — no PNG art assets, no designer required. Pixi `Graphics` + `generateTexture()` is fully code-driven.
- **LangGraph gives us suspend/resume for free** — human-in-the-loop approval is table stakes for any agentic product and LangGraph solves it without custom state machines.
- **Cost model first** — price around the LLM cost floor, not a SaaS guess.

---

## 3. Blueprint Lock

### 3a. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 14 App Router | RSC + client islands; easy auth integration |
| 2D Engine | Pixi.js v8 (WebGL) | Fastest 2D canvas; animated sprites; programmatic graphics |
| State machine | XState v5 | Finite states per agent, no impossible visual states |
| Agent store | Zustand | Lightweight global store for agent list + active task |
| Animation | Framer Motion | Page transitions and UI motion |
| UI | Tailwind CSS + Radix UI | Utility-first + accessible primitives |
| Realtime | Socket.io | Events from API → client in real time |
| Backend | Fastify v4 | Fast, schema-driven, good plugin ecosystem |
| ORM | Prisma + PostgreSQL (Neon) | Type-safe queries; Neon is serverless-friendly |
| Cache / pub-sub | Redis (Upstash) | Task event queue; session TTLs |
| Agent framework | LangGraph (StateGraph) | Suspend/resume checkpointing; conditional routing |
| Tool execution | Composio | Managed OAuth + tool execution across 100+ integrations |
| Auth | Clerk | JWT; webhooks; user upsert on first API hit |
| Monorepo | pnpm workspaces + Turborepo | Shared types package; fast builds |

### 3b. Onboarding Flow (5 steps)

```
role → identity → connect → gift → result
```

1. **Role** — pick which agent type to hire first (5 roles)
2. **Identity** — give the agent a name, avatar style, and presentation
3. **Connect** — optionally connect Gmail/Calendar so the agent can act
4. **Gift** — the agent immediately runs a first task (no-input, role-appropriate)
5. **Result** — task output shown; user proceeds to the office

### 3c. Cost Model

| Tier | Price | Credits | Blended LLM cost/task | Margin |
|---|---|---|---|---|
| Free | $0 | 5 tasks (BYOK) | — | — |
| Pro | $39/mo | 200 tasks | ~$0.10 | 44% |
| Team | $149/mo | 1,000 tasks | ~$0.09 | ~50% |

- Break-even at **13 Pro users**
- BYOK (bring-your-own-key) available on free tier — user supplies Anthropic/OpenAI key

---

## 4. Visual Design Spec

### Color Palette
```
Background:   #12172b   (deep navy)
Accent blue:  #4d7fff   (electric blue)
Success:      #4dffa0   (mint green)
Muted text:   #8892b0
```

### Isometric Office — Layers (back to front)
1. City skyline window (procedural buildings, lit/unlit windows)
2. Wall with ambient gradient
3. Oak plank floor (horizontal + diagonal shadow lines)
4. Wine-colored rug with brass border (ellipse)
5. Bookshelf (left wall)
6. Two corner plants
7. Ceiling track lighting
8. CEO desk (back, elevated)
9. 3× Agent desks (front, depth-illusion with front face)
10. Monitors (animated scan-line when working)
11. Desk lamps (state-coded: idle=amber, working=cyan, done=green, blocked=red)

### Agent Sprite System
- **No PNG files** — all programmatic via `Pixi.Graphics` → `renderer.generateTexture()`
- 8 animation states: `IDLE`, `WALKING`, `WORKING`, `THINKING`, `CELEBRATING`, `PRESENTING`, `TALKING`, `BLOCKED`
- Each state has 2–4 pose frames
- Poses defined as arm/leg angles in degrees; `drawPose()` uses trig for limb positioning
- LRU cache keyed by `${poseName}:${bodyColor}`

### Agent Card (portrait + thought bubble)
- Rounded-rect background with avatar portrait (or colored circle fallback)
- Thought bubble: fade in/out, tail triangle, 45-char truncation with ellipsis
- State-based body tint per animation state

---

## 5. Agent Architecture

### Roles

| ID | Label | Gift Task |
|---|---|---|
| `EXEC_ASSISTANT` | Executive Assistant | Summarise top 3 emails this week |
| `RESEARCH_ANALYST` | Research Analyst | Quick competitive landscape snapshot |
| `CONTENT_WRITER` | Content Writer | Draft a 3-sentence company description |
| `SALES_PROSPECTOR` | Sales Prospector | Identify 3 potential leads in SaaS |
| `OPS_COORDINATOR` | Ops Coordinator | List this week's key operational risks |

### CEO Router (LLM-powered command routing)
- Model: Claude Haiku 4.5
- Input: raw user command + list of active agents
- Output: structured JSON `{ targetAgentId, taskTitle, estimatedComplexity, clarificationNeeded? }`

### LangGraph Agent Graph (`StateGraph`)
```
planStepsNode
    ↓
executeStepNode ←──────────────┐
    ↓                          │
routeAfterStep ────────────────┘
    ├── needsApprovalNode (destructive tools)
    │       ↓ (interrupt — waits for human)
    │   compileResultNode
    └── compileResultNode
            ↓
        handleErrorNode (on failure)
```

- **PostgresSaver checkpointer** — persists full graph state for suspend/resume
- `startAgentTask()` — public API to kick off a new task thread
- `resumeAgentTask()` — resumes from `interrupt` after human approval

### Human-in-the-Loop
- Destructive tool calls (send email, delete file, create event) route through `needsApprovalNode`
- Task status → `NEEDS_APPROVAL`; `ApprovalRequest` record created with 10-min TTL
- API route `POST /api/tasks/:id/approve` accepts `APPROVED | EDITED | CANCELLED`
- Approval expiry job runs every 2 minutes; expired requests → `TASK_BLOCKED` event

### Tool Execution (Composio)
```typescript
// Single shared helper bound to a user's Composio entity
export function makeExecutor(entityId: string) {
  return async (toolName: string, input: unknown): Promise<unknown> => {
    const toolset = getToolset()
    return toolset.executeAction({ action: toolName, params: input, entityId })
  }
}
```

---

## 6. Database Schema (Prisma)

```prisma
model User {
  id               String   @id
  clerkId          String   @unique
  email            String   @unique
  creditsRemaining Int      @default(5)
  byokKey          String?
  agents           Agent[]
  tasks            Task[]
  integrations     Integration[]
}

model Agent {
  id           String      @id @default(uuid())
  userId       String
  name         String
  role         AgentRole
  avatarStyle  AvatarStyle
  presentation AvatarPresentation
  avatarUrl    String?
  status       AgentStatus @default(IDLE)
  isActive     Boolean     @default(true)
  user         User        @relation(...)
  tasks        Task[]
  events       TaskEvent[]
}

model Task {
  id               String     @id @default(uuid())
  agentId          String
  userId           String
  title            String
  rawCommand       String
  status           TaskStatus @default(PENDING)
  complexity       Complexity @default(MEDIUM)
  result           Json?
  costUsd          Float?
  tokensUsed       Int?
  langGraphThread  String?
  startedAt        DateTime?
  completedAt      DateTime?
  approvalRequests ApprovalRequest[]
  events           TaskEvent[]
}

model TaskEvent {
  id        String    @id @default(uuid())
  agentId   String
  taskId    String?
  type      EventType
  payload   Json
  createdAt DateTime  @default(now())
}

model ApprovalRequest {
  id          String   @id @default(uuid())
  taskId      String
  agentId     String
  toolName    String
  toolInput   Json
  status      ApprovalStatus @default(PENDING)
  expiresAt   DateTime
  respondedAt DateTime?
}

model Integration {
  id           String   @id @default(uuid())
  userId       String
  provider     String
  composioId   String?
  isActive     Boolean  @default(true)
  connectedAt  DateTime @default(now())
  @@unique([userId, provider])
}
```

---

## 7. Event System

Events flow: `emitEvent()` → persists to `TaskEvent` → Socket.io broadcast to `user:{userId}` room → `useAgentEvents` hook → XState director machine → Pixi animations

### Event Types
```typescript
type EventType =
  | 'TASK_ASSIGNED'
  | 'STEP_STARTED'
  | 'TOOL_CALLED'
  | 'TOOL_RESULT'
  | 'NEEDS_APPROVAL'
  | 'APPROVAL_GRANTED'
  | 'TASK_COMPLETE'
  | 'TASK_FAILED'
  | 'TASK_BLOCKED'
  | 'AGENT_THOUGHT'
```

### XState Director Machine States
```
uninitialized → idle → activating → walkingToDesk → working
    → awaitingApproval → presenting → showingResult → failed → blocked
```

---

## 8. API Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/agents` | Create agent |
| POST | `/api/agents/avatar` | Generate avatar URL |
| POST | `/api/tasks` | Create + route task |
| GET | `/api/tasks` | List tasks |
| GET | `/api/tasks/:id` | Get single task |
| POST | `/api/tasks/:id/approve` | Submit approval decision |
| POST | `/api/integrations/connect` | Get Composio OAuth redirect URL |
| GET | `/api/integrations/status` | List connected integrations |
| POST | `/api/integrations/callback` | Record completed OAuth connection |
| DELETE | `/api/integrations/:provider` | Disconnect integration |
| GET | `/health` | Health check |

---

## 9. Monorepo Structure

```
agentcity/
├── apps/
│   ├── web/                        # Next.js 14
│   │   └── src/
│   │       ├── app/
│   │       │   ├── onboarding/page.tsx
│   │       │   └── office/page.tsx
│   │       ├── hooks/
│   │       │   └── useAgentEvents.ts
│   │       └── lib/
│   │           ├── machines/
│   │           │   └── director.machine.ts
│   │           └── pixi/
│   │               ├── scene.ts
│   │               ├── sprite-factory.ts
│   │               └── agent-sprite.ts
│   └── api/                        # Fastify
│       └── src/
│           ├── index.ts
│           ├── agents/
│           │   ├── graph.ts
│           │   ├── router.ts
│           │   └── nodes/
│           │       ├── plan-steps.ts
│           │       ├── execute-step.ts
│           │       ├── needs-approval.ts
│           │       ├── compile-result.ts
│           │       └── handle-error.ts
│           ├── lib/
│           │   ├── prisma.ts
│           │   └── composio.ts
│           ├── plugins/
│           │   ├── auth.ts
│           │   └── socket.ts
│           ├── routes/
│           │   ├── agents/create.ts
│           │   ├── tasks/create.ts
│           │   ├── tasks/approve.ts
│           │   └── integrations/connect.ts
│           └── services/
│               └── events.service.ts
└── packages/
    └── types/
        └── src/
            ├── agents.ts
            ├── tasks.ts
            ├── events.ts
            └── index.ts
```

---

## 10. Build Issues Encountered & Resolved

### Issue 1 — `@langchain/langgraph-checkpoint-postgres@^0.0.12` does not exist
- **Symptom:** `pnpm install` failed with "No matching version found"
- **Fix:** Changed to `^1.0.1` (the actual published package version)

### Issue 2 — `AgentSpriteGroup` constructor mismatch
- **Symptom:** `useAgentEvents.ts` called `new AgentSpriteGroup(id, name, url)` but the new 4-arg constructor also requires `factory: SpriteFactory`
- **Fix:** Rewrote `useAgentEvents.ts` to create a single `SpriteFactory` from `scene.app.renderer` and pass it into each `AgentSpriteGroup`

### Issue 3 — `drawRug` unused parameter hint
- **Symptom:** IDE flagged `W` as unused (false positive — `W` is used in the function body)
- **Attempted fix:** Renamed to `_W` → caused "Cannot find name 'W'" at two lines in function body
- **Actual fix:** Reverted to `W: number` (original) — the hint was a false positive

### Issue 4 — `create.ts` implicit any in `Array.find`
- **Symptom:** `agents.find((a) => a.id === ...)` — `a` implicitly typed as `any`
- **Fix:** Added explicit type annotation: `(a: { id: string }) => a.id === targetAgentId`

### Issue 5 — Onboarding page 4 TypeScript errors
- **Error 1:** `Cannot find name 'ConnectStep'` — component not yet defined
  - **Fix:** Added full `ConnectStep` component to the file
- **Error 2:** `Parameter 'provider' implicitly has an 'any' type`
  - **Fix:** Typed as `(provider: string) =>`
- **Error 3:** `'connectedProvider' does not exist in type 'Partial<OnboardingState>'`
  - **Fix:** Added `connectedProvider?: string` to `OnboardingState` interface
- **Error 4:** `Type 'unknown' is not assignable to type 'ReactNode'`
  - **Fix:** Changed `{state.taskResult && ...}` to `{state.taskResult != null && ...}`

---

## 11. Composio OAuth Flow (Onboarding)

```
User clicks "Connect Gmail"
    ↓
POST /api/integrations/connect { provider: 'GMAIL', agentId }
    ↓
Composio entity.initiateConnection() → { redirectUrl }
    ↓
window.location.href = redirectUrl   (leaves site)
    ↓
[User completes Google OAuth in Composio]
    ↓
Composio redirects to /onboarding?connected=GMAIL
    ↓
useEffect detects searchParams.get('connected')
    ↓
POST /api/integrations/callback { provider, agentId }
    ↓
Integration record upserted in DB
    ↓
onConnected('GMAIL') → runGiftTask()
```

**Roles that surface integrations:**
- `EXEC_ASSISTANT` → Gmail, Google Calendar
- `OPS_COORDINATOR` → Gmail, Google Calendar
- `SALES_PROSPECTOR` → Gmail
- `RESEARCH_ANALYST`, `CONTENT_WRITER` → skip screen (no integrations shown)

---

## 12. Current State (2026-05-10)

### Completed
- [x] Full monorepo scaffolded (48 files)
- [x] Programmatic sprite factory — all 8 animation states, no PNGs
- [x] Rich isometric office scene — fully programmatic Pixi.js
- [x] LangGraph agent graph with suspend/resume
- [x] CEO router (Claude Haiku 4.5)
- [x] Fastify API with all routes registered
- [x] Composio `makeExecutor` helper + OAuth routes
- [x] Socket.io event system (emit → persist → broadcast)
- [x] XState director machine wired to Pixi scene
- [x] Onboarding page — all 5 steps, all TypeScript errors resolved
- [x] `ConnectStep` component with full OAuth callback detection

### What's next
- [ ] Office page (`/office`) — Pixi canvas mount, agent list sidebar, command input
- [ ] Approval UI — toast/modal when task status is `NEEDS_APPROVAL`
- [ ] Task result display — formatted output per task type
- [ ] Clerk webhook → user upsert on signup
- [ ] Avatar generation endpoint (`POST /api/agents/avatar`)
- [ ] Stripe integration (credit top-ups, Pro subscription)
- [ ] Deploy: Vercel (web) + Railway (API) + Neon (DB) + Upstash (Redis)
