import { ComposioToolSet } from 'composio-core'

let _toolset: ComposioToolSet | null = null

function getToolset(): ComposioToolSet {
  if (!_toolset) {
    _toolset = new ComposioToolSet({ apiKey: process.env.COMPOSIO_API_KEY })
  }
  return _toolset
}

/**
 * Returns an executeTool function bound to a specific user's Composio entity.
 * Pass this into startAgentTask / resumeAgentTask.
 */
export function makeExecutor(entityId: string) {
  return async (toolName: string, input: unknown): Promise<unknown> => {
    const toolset = getToolset()
    return toolset.executeAction({
      action:   toolName,
      params:   input as Record<string, unknown>,
      entityId,
    })
  }
}
