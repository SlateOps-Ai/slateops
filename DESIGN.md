# SlateOps — Design Concept

## The wedge in one sentence

**SlateOps is the office for your AI team — agents are coworkers you can see, not chat threads you scroll through.**

Every competitor presents AI as a sidebar, a chat history, or a settings page. We make agents feel like teammates in a room. That difference is the entire product.

---

## Three first principles

**1. The canvas is the office, not the wallpaper.** The viewport is a *place* where work happens. Agents bob softly at their desks. Tasks visibly travel between them via animated handoff paths. Status changes are visible, not buried in logs. The user's mental model is "I have a team," not "I have software."

**2. Hide the architecture; show the outcome.** Never use *OAuth*, *MCP*, *API key*, *prompt template*, or *model* in user-facing copy. Say what the agent can do for them:

- ✅ *"Let Tomi see your customer list"* — not "Grant Salesforce integration"
- ✅ *"Sara needs your inbox to triage these"* — not "Authorize Gmail read scope"
- ✅ *"I built this for you"* — not "Task complete, confidence 0.87"

Every settings page is a failure of design.

**3. Defaults that match how a solopreneur thinks.** Most users have never managed a team. The first 60 seconds should feel like *delegating to a human assistant for the first time* — one intake question, the team composes itself, each agent introduces what they'll do first, integrations pre-pick from the business description, first task is already drafted in the input.

---

## Visual language

| Element | Treatment | Why |
|---|---|---|
| **Surface** | Deep navy (`#0d0f1a` → `#12172b`) with thin translucent borders | Reads as "premium tool," not "browser app" |
| **Accent** | Soft electric blue `#4d7fff` for capability, warm amber for CEO/authority | Two purposeful semantic colors, not a palette |
| **Typography** | Inter, semibold for everything user-facing. Labels ≥ 13px at full white. Never below 70% opacity for primary text | "Sharp" feels more important than the typeface choice |
| **Avatars** | Illustrated portraits with status dots. Bob continuously, de-synced per agent | They feel *alive*, not static cards |
| **Motion** | 200–400ms `cubic-bezier(0.16, 1, 0.3, 1)` (snappy ease-out). Spring only for arrival moments — walk-in, level-up, achievement | Confident, never overcooked |
| **Empty states** | Speech bubbles from agents, not blank illustrations | The team is the personality |

---

## Signature UX patterns

- **Speech-bubble for prompts, not modals.** When an agent needs input (approve / grant / confirm), they ask in-character via a bubble anchored to their avatar. Reinforces the metaphor; modals fragment attention.
- **In-character refusals.** *"WhatsApp isn't really my thing"* beats *"Permission denied"*.
- **Slate-writing reveal.** Typewriter effect on the latest assistant message + every fresh notification. Signals "this just came out of an agent" vs. "this is stored history."
- **Handoff paths.** Curved bezier with a glowing token whenever work moves between agents. Makes collaboration *visible*.
- **Drag-to-grant shelf.** Service icons in a bottom strip; drop onto an agent → granted. Off-role drops politely refused. Friendly path is also the safer path.
- **Dual-mode workspace.** Open chat = focused conversation, all agents one click away in a top picker. Close chat = the spatial office, with agents at their desks.

---

## Anti-patterns — banned by design

- ❌ A general **Settings page with 12 sections.** Fragment into per-agent edit, per-connection edit, per-trigger edit.
- ❌ **Loading spinners alone.** Always pair with what the agent is doing in plain English.
- ❌ **Corner toast stacks.** Those are notifications *to a user*. We deliver notifications *from a coworker* — speech bubbles, anchored.
- ❌ **"Configure your AI model" surfaces.** Pick a sensible default, hide BYOK in an advanced flap.
- ❌ **Generic SaaS palette** (purple + grey + green dashboards). We are not a CRM.
- ❌ **Full-page routes for primary work.** Modals overlay the office; full pages break the metaphor.

---

## North-star demo moments

1. **Onboarding theater** — user types two sentences → agents walk in from the door one by one → introduce themselves → the first task is already in the chat input.
2. **First handoff** — Sara finishes research → an animated arc to Tomi → Tomi starts composing the response. The user *sees* the team working.
3. **First grant request** — mid-task, Tomi pops a bubble: *"I need your Gmail to send this — okay?"* with [Always allow] [Just once] [Not now].
4. **Slate-writing reveal** — agent finishes → output types itself character-by-character with a blinking caret. *This is fresh.*

---

## What SlateOps is **not**

- Not a chat app with AI sprinkled in (Slack-with-LLMs)
- Not a workflow builder (Zapier-with-agents)
- Not an AI observability dashboard (LangSmith-with-personality)
- Not a copilot bolted onto something else

It's *an office full of agents you employ.* That's the only thing it is.
