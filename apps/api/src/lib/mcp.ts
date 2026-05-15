export interface McpTool {
  name:        string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpServerRecord {
  id:          string
  name:        string
  description: string | null
  url:         string
  authHeader:  string | null
  tools:       McpTool[]
}

function headers(authHeader?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authHeader) h['Authorization'] = authHeader
  return h
}

export async function fetchMcpTools(url: string, authHeader?: string | null): Promise<McpTool[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}/tools`, {
    headers: headers(authHeader),
    signal:  AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`MCP server returned ${res.status}`)
  const data: unknown = await res.json()
  const list: unknown[] = Array.isArray(data) ? data : ((data as any)?.tools ?? [])
  return list.map((t: any) => ({
    name:        t.name ?? t.toolName ?? '',
    description: t.description ?? '',
    inputSchema: t.inputSchema ?? t.input_schema ?? {},
  })).filter((t) => t.name)
}

export async function callMcpTool(
  url:        string,
  toolName:   string,
  input:      unknown,
  authHeader?: string | null,
): Promise<unknown> {
  const res = await fetch(`${url.replace(/\/$/, '')}/call`, {
    method:  'POST',
    headers: headers(authHeader),
    body:    JSON.stringify({ tool: toolName, input }),
    signal:  AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`MCP tool call failed (${res.status}): ${text}`)
  }
  return res.json()
}
