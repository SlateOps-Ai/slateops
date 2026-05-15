// Executors can't be stored in LangGraph state (functions don't survive Postgres
// checkpoint serialization). We keep them in a plain in-process Map keyed by taskId
// and clean up after each task completes or errors.

type Executor = (name: string, input: unknown) => Promise<unknown>

const registry = new Map<string, Executor>()

export function registerExecutor(taskId: string, fn: Executor): void {
  registry.set(taskId, fn)
}

export function getExecutor(taskId: string): Executor | undefined {
  return registry.get(taskId)
}

export function unregisterExecutor(taskId: string): void {
  registry.delete(taskId)
}
