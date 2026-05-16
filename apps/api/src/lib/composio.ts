import { Composio } from '@composio/core'

let _composio: Composio | null = null

function getComposio(): Composio {
  if (!_composio) {
    _composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
  }
  return _composio
}

/**
 * Returns an executeTool function bound to a specific user's Composio entity.
 * Pass this into startAgentTask / resumeAgentTask.
 *
 * Migrated from the legacy composio-core SDK (which talks to v2 endpoints
 * that no longer accept legacy params) to @composio/core (v3 Platform API,
 * accepts auth_config_id properly).
 */
export function makeExecutor(entityId: string) {
  return async (toolName: string, input: unknown): Promise<unknown> => {
    const composio = getComposio()
    const result = await composio.tools.execute(toolName, {
      userId:    entityId,
      arguments: (input as Record<string, unknown>) ?? {},
    })
    return result
  }
}

/** Direct access to the shared Composio client — used by the integrations
 *  routes to look up auth configs and initiate connections. */
export function getComposioClient(): Composio {
  return getComposio()
}
