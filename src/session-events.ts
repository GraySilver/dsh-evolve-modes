import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

type CompatibleSession = Agent['session'] & {
  readonly events?: readonly SessionEvent[]
  snapshotEvents?: () => readonly SessionEvent[]
}

/** Read the immutable Session log across the 0.1.1 property and 0.1.2 snapshot API. */
export function sessionEvents(session: Agent['session']): readonly SessionEvent[] {
  const compatible = session as CompatibleSession
  if (typeof compatible.snapshotEvents === 'function') return compatible.snapshotEvents()
  return compatible.events ?? []
}
