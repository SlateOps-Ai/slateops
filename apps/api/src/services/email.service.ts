import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export interface TaskCompleteData {
  agentName:    string
  agentAvatarUrl: string
  userName:     string
  userEmail:    string
  taskTitle:    string
  resultSummary: string
  officeUrl:    string
}

export async function sendTaskComplete(data: TaskCompleteData): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from:    'SlateOps <briefs@slateops.tech>',
    to:      data.userEmail,
    subject: `${data.agentName} finished: ${data.taskTitle}`,
    html:    renderTaskComplete(data),
  })
}

function renderTaskComplete(d: TaskCompleteData): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d111f;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#12172b;border-radius:16px;border:1px solid #1e2540;overflow:hidden">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #1e2540">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;padding-right:14px">
                <img src="${escapeHtml(d.agentAvatarUrl)}" width="40" height="40"
                     style="border-radius:50%;display:block" alt="${escapeHtml(d.agentName)}" />
              </td>
              <td style="vertical-align:middle">
                <p style="margin:0 0 2px;color:#4dffa0;font-size:10px;font-weight:600;
                          letter-spacing:0.1em;text-transform:uppercase">Task complete</p>
                <p style="margin:0;color:#ffffff;font-size:17px;font-weight:700">${escapeHtml(d.taskTitle)}</p>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px">
            <p style="margin:0 0 8px;color:#8892b0;font-size:11px;font-weight:600;
                      text-transform:uppercase;letter-spacing:0.08em">Result from ${escapeHtml(d.agentName)}</p>
            <div style="background:#0f1426;border:1px solid #1e2540;border-radius:10px;
                        padding:16px;color:#c8cfe0;font-size:13px;line-height:1.6;
                        white-space:pre-wrap;word-break:break-word">${escapeHtml(d.resultSummary)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px;text-align:center">
            <a href="${d.officeUrl}"
               style="display:inline-block;background:#4d7fff;color:#ffffff;font-size:13px;
                      font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none">
              View in your office →
            </a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface DailyBriefData {
  userName:         string
  userEmail:        string
  tasksCompleted:   number
  pendingApprovals: number
  agentNames:       string[]
  briefUrl:         string
  officeUrl:        string
}

export async function sendDailyBrief(data: DailyBriefData): Promise<void> {
  const resend  = getResend()
  const subject = data.pendingApprovals > 0
    ? `Your SlateOps brief — ${data.tasksCompleted} tasks done, ${data.pendingApprovals} waiting for you`
    : `Your SlateOps brief — ${data.tasksCompleted} tasks done yesterday`

  await resend.emails.send({
    from:    'SlateOps <briefs@slateops.tech>',
    to:      data.userEmail,
    subject,
    html:    renderDailyBrief(data),
  })
}

function renderDailyBrief(d: DailyBriefData): string {
  const approvalSection = d.pendingApprovals > 0 ? `
    <tr>
      <td style="padding:16px 32px;background:#1a1000;border-bottom:1px solid #2a1f00">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle">
            <p style="margin:0 0 2px;color:#f59e0b;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase">
              Action required
            </p>
            <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600">
              ${d.pendingApprovals} task${d.pendingApprovals > 1 ? 's' : ''} waiting for your approval
            </p>
          </td>
          <td style="text-align:right;vertical-align:middle;padding-left:16px;white-space:nowrap">
            <a href="${d.briefUrl}"
               style="display:inline-block;background:#f59e0b;color:#0d111f;font-size:12px;
                      font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none">
              Review now →
            </a>
          </td>
        </tr></table>
      </td>
    </tr>` : ''

  const agentLine = d.agentNames.length
    ? `Your agents: ${d.agentNames.join(', ')}`
    : 'Your agents are ready for new tasks.'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d111f;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#12172b;border-radius:16px;border:1px solid #1e2540;overflow:hidden">

        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #1e2540">
            <p style="margin:0 0 4px;color:#4d7fff;font-size:11px;font-weight:600;
                      letter-spacing:0.1em;text-transform:uppercase">Daily brief</p>
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.2">
              What happened while you were away
            </h1>
            <p style="margin:8px 0 0;color:#8892b0;font-size:13px">
              Morning, ${escapeHtml(d.userName.split(' ')[0])}. Here's your office update.
            </p>
          </td>
        </tr>

        ${approvalSection}

        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #1e2540;background:#0f1426">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;padding:0 16px">
                  <p style="margin:0;color:#4dffa0;font-size:32px;font-weight:700">${d.tasksCompleted}</p>
                  <p style="margin:4px 0 0;color:#8892b0;font-size:11px">tasks completed</p>
                </td>
                <td style="text-align:center;padding:0 16px;border-left:1px solid #1e2540">
                  <p style="margin:0;color:${d.pendingApprovals > 0 ? '#f59e0b' : '#ffffff'};font-size:32px;font-weight:700">${d.pendingApprovals}</p>
                  <p style="margin:4px 0 0;color:#8892b0;font-size:11px">awaiting approval</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px;border-bottom:1px solid #1e2540">
            <p style="margin:0;color:#8892b0;font-size:12px;line-height:1.6">${escapeHtml(agentLine)}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 28px;text-align:center">
            <a href="${d.officeUrl}"
               style="display:inline-block;background:#4d7fff;color:#ffffff;font-size:13px;
                      font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none">
              Open your office →
            </a>
            <p style="margin:16px 0 0;color:#8892b0;font-size:11px">
              SlateOps · <a href="${d.officeUrl.replace('/office', '/settings')}"
              style="color:#4d7fff;text-decoration:none">manage email preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export interface TeamInviteData {
  toEmail:     string
  teamName:    string
  inviterName: string
  inviteUrl:   string
}

export async function sendTeamInvite(data: TeamInviteData): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from:    'SlateOps <briefs@slateops.tech>',
    to:      data.toEmail,
    subject: `${data.inviterName} invited you to "${data.teamName}" on SlateOps`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d111f;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#12172b;border-radius:16px;border:1px solid #1e2540;overflow:hidden">
        <tr><td style="padding:32px 36px 24px;border-bottom:1px solid #1e2540">
          <p style="margin:0 0 4px;color:#4d7fff;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase">Team invitation</p>
          <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700">You're invited to join "${escapeHtml(data.teamName)}"</h2>
          <p style="margin:10px 0 0;color:#8892b0;font-size:13px">${escapeHtml(data.inviterName)} invited you to collaborate on SlateOps.</p>
        </td></tr>
        <tr><td style="padding:24px 36px 32px;text-align:center">
          <a href="${data.inviteUrl}"
             style="display:inline-block;background:#4d7fff;color:#fff;font-size:13px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none">
            Accept invitation →
          </a>
          <p style="margin:16px 0 0;color:#8892b0;font-size:11px">This invite expires in 72 hours.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  })
}

export interface BriefData {
  userName:    string
  userEmail:   string
  weekOf:      string
  agents: Array<{
    name:            string
    avatarUrl:       string
    tasksCompleted:  number
    topCommand:      string | null
    recommendation:  string
  }>
  totalTasks:    number
  creditsUsed:   number
  activeSchedules: number
}

export async function sendWeeklyBrief(data: BriefData): Promise<void> {
  const resend = getResend()

  await resend.emails.send({
    from:    'SlateOps <briefs@slateops.tech>',
    to:      data.userEmail,
    subject: `Your office brief — week of ${data.weekOf}`,
    html:    renderBrief(data),
  })
}

function renderBrief(d: BriefData): string {
  const agentRows = d.agents.map((a) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1e2540;vertical-align:top;width:44px">
        <img src="${escapeHtml(a.avatarUrl)}" width="36" height="36"
             style="border-radius:50%;object-fit:cover;display:block" alt="${escapeHtml(a.name)}" />
      </td>
      <td style="padding:12px 0 12px 12px;border-bottom:1px solid #1e2540;vertical-align:top">
        <p style="margin:0 0 2px;color:#ffffff;font-size:13px;font-weight:600">${escapeHtml(a.name)}</p>
        <p style="margin:0 0 6px;color:#8892b0;font-size:11px">
          ${a.tasksCompleted} task${a.tasksCompleted !== 1 ? 's' : ''} completed
          ${a.topCommand ? `· most used: <em>${escapeHtml(a.topCommand)}</em>` : ''}
        </p>
        <p style="margin:0;color:#c8cfe0;font-size:12px;line-height:1.5">
          💡 ${escapeHtml(a.recommendation)}
        </p>
      </td>
    </tr>
  `).join('')

  const scheduleBadge = d.activeSchedules > 0
    ? `<span style="display:inline-block;background:#4dffa020;border:1px solid #4dffa040;
         color:#4dffa0;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:8px">
         ${d.activeSchedules} recurring
       </span>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d111f;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#12172b;border-radius:16px;border:1px solid #1e2540;overflow:hidden">

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #1e2540">
            <p style="margin:0 0 4px;color:#4d7fff;font-size:11px;font-weight:600;
                      letter-spacing:0.1em;text-transform:uppercase">Weekly brief</p>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.2">
              Your office, week of ${escapeHtml(d.weekOf)}
            </h1>
            <p style="margin:8px 0 0;color:#8892b0;font-size:13px">
              Hey ${escapeHtml(d.userName.split(' ')[0])} — here's what your team got done.
            </p>
          </td>
        </tr>

        <!-- Stats bar -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #1e2540;background:#0f1426">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center">
                  <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700">${d.totalTasks}</p>
                  <p style="margin:4px 0 0;color:#8892b0;font-size:11px">tasks completed</p>
                </td>
                <td style="text-align:center">
                  <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700">${d.creditsUsed}</p>
                  <p style="margin:4px 0 0;color:#8892b0;font-size:11px">credits used</p>
                </td>
                <td style="text-align:center">
                  <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700">${d.agents.length}</p>
                  <p style="margin:4px 0 0;color:#8892b0;font-size:11px">agents active${scheduleBadge}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Agent rows -->
        <tr>
          <td style="padding:4px 32px 8px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${agentRows}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:20px 32px 28px;text-align:center;border-top:1px solid #1e2540">
            <a href="${process.env.WEB_URL ?? 'https://slateops.tech'}/office"
               style="display:inline-block;background:#4d7fff;color:#ffffff;font-size:13px;
                      font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none">
              Open your office →
            </a>
            <p style="margin:16px 0 0;color:#8892b0;font-size:11px">
              SlateOps · <a href="${process.env.WEB_URL ?? 'https://slateops.tech'}/settings"
              style="color:#4d7fff;text-decoration:none">manage brief preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Anomaly alert ─────────────────────────────────────────────────────────────

export interface AnomalyAlertData {
  toEmail:    string
  userId:     string         // opaque ID — userEmail no longer leaked into alerts
  userName:   string
  plan:       string
  todayUsd:   number
  avgUsd:     number
  ratio:      number
  adminUrl:   string
}

export async function sendAnomalyAlert(data: AnomalyAlertData): Promise<void> {
  const resend = getResend()
  await resend.emails.send({
    from:    'SlateOps Cost Monitor <alerts@slateops.tech>',
    to:      data.toEmail,
    subject: `[SlateOps] Spend anomaly: user ${data.userId} at ${data.ratio.toFixed(1)}× today`,
    html: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0d111f;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="520" cellpadding="0" cellspacing="0" style="background:#12172b;border-radius:16px;border:1px solid #4a1f1f;overflow:hidden">
<tr><td style="padding:24px 28px;border-bottom:1px solid #4a1f1f">
  <p style="margin:0 0 4px;color:#ff6b4d;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase">⚠️ Cost anomaly</p>
  <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700">${escapeHtml(data.userName)} <span style="color:#8892b0;font-weight:400">· user ${escapeHtml(data.userId)}</span></p>
</td></tr>
<tr><td style="padding:24px 28px">
  <table cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="vertical-align:top;padding-right:16px">
      <p style="margin:0;color:#8892b0;font-size:10px;text-transform:uppercase;letter-spacing:0.1em">Today</p>
      <p style="margin:4px 0 0;color:#ff6b4d;font-size:26px;font-weight:700">$${data.todayUsd.toFixed(3)}</p>
    </td>
    <td style="vertical-align:top;padding-right:16px">
      <p style="margin:0;color:#8892b0;font-size:10px;text-transform:uppercase;letter-spacing:0.1em">7-day avg</p>
      <p style="margin:4px 0 0;color:#ffffff;font-size:26px;font-weight:700">$${data.avgUsd.toFixed(3)}</p>
    </td>
    <td style="vertical-align:top">
      <p style="margin:0;color:#8892b0;font-size:10px;text-transform:uppercase;letter-spacing:0.1em">Multiple</p>
      <p style="margin:4px 0 0;color:#ff6b4d;font-size:26px;font-weight:700">${data.ratio.toFixed(1)}×</p>
    </td>
  </tr></table>
  <p style="margin:24px 0 0;color:#8892b0;font-size:13px;line-height:1.6">
    Spend today crossed the anomaly threshold (3× 7-day average OR ≥$2 absolute). Possible causes: legitimate burst, runaway loop in their integration, or compromised credentials.
  </p>
  <p style="margin:16px 0 0;color:#8892b0;font-size:12px">Plan: <span style="color:#ffffff">${escapeHtml(data.plan)}</span></p>
  <a href="${data.adminUrl}" style="display:inline-block;margin-top:20px;padding:10px 16px;background:#4d7fff;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600">
    Open admin dashboard →
  </a>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #1e2540;background:#0d111f">
  <p style="margin:0;color:#8892b0;font-size:10px">SlateOps cost monitor · de-duplicated to ≤1 alert per user per 24h</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`,
  })
}
