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
                <img src="${d.agentAvatarUrl}" width="40" height="40"
                     style="border-radius:50%;display:block" alt="${d.agentName}" />
              </td>
              <td style="vertical-align:middle">
                <p style="margin:0 0 2px;color:#4dffa0;font-size:10px;font-weight:600;
                          letter-spacing:0.1em;text-transform:uppercase">Task complete</p>
                <p style="margin:0;color:#ffffff;font-size:17px;font-weight:700">${d.taskTitle}</p>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px">
            <p style="margin:0 0 8px;color:#8892b0;font-size:11px;font-weight:600;
                      text-transform:uppercase;letter-spacing:0.08em">Result from ${d.agentName}</p>
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
        <img src="${a.avatarUrl}" width="36" height="36"
             style="border-radius:50%;object-fit:cover;display:block" alt="${a.name}" />
      </td>
      <td style="padding:12px 0 12px 12px;border-bottom:1px solid #1e2540;vertical-align:top">
        <p style="margin:0 0 2px;color:#ffffff;font-size:13px;font-weight:600">${a.name}</p>
        <p style="margin:0 0 6px;color:#8892b0;font-size:11px">
          ${a.tasksCompleted} task${a.tasksCompleted !== 1 ? 's' : ''} completed
          ${a.topCommand ? `· most used: <em>${a.topCommand}</em>` : ''}
        </p>
        <p style="margin:0;color:#c8cfe0;font-size:12px;line-height:1.5">
          💡 ${a.recommendation}
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
              Your office, week of ${d.weekOf}
            </h1>
            <p style="margin:8px 0 0;color:#8892b0;font-size:13px">
              Hey ${d.userName.split(' ')[0]} — here's what your team got done.
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
