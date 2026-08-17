import { randomUUID } from 'node:crypto'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import type {
  EvolutionAction,
  EvolutionBackup,
  EvolutionCategory,
  EvolutionConfig,
  EvolutionDashboard,
  EvolutionEvidence,
  EvolutionLearningRun,
  EvolutionProposal,
  EvolutionScope,
  EvolutionSetting,
  EvolutionSettingMutation,
  EvolutionState,
} from '../types.ts'
import { evolutionStateSchema } from './schema.ts'

export const EMPTY_EVOLUTION_STATE: EvolutionState = {
  revision: 0,
  config: {
    learningBatchSize: 3,
    maxPendingProposals: 100,
  },
  settings: [],
  proposals: [],
  backups: [],
  runs: [],
  updatedAt: 0,
}

/** Plugin-owned cross-session learned-instruction state. */
export const evolutionDomain = defineDomain({
  name: 'graysilver_task_modes_evolution',
  version: 1,
  global: { schema: evolutionStateSchema, initial: EMPTY_EVOLUTION_STATE },
  tables: {},
})

export interface EvolutionProposalDraft {
  readonly scope: EvolutionScope
  readonly projectRoot: string | null
  readonly action: EvolutionAction
  readonly category: EvolutionCategory | null
  readonly content: string | null
  readonly targetId: string | null
  readonly inference: 'explicit' | 'implicit'
  readonly deleteReason: 'explicit_denial' | 'expired' | 'replaced' | null
  readonly evidence: readonly EvolutionEvidence[]
}

const DEFAULT_CONFIG: EvolutionConfig = EMPTY_EVOLUTION_STATE.config

/** Convert state from the project-scoped release line to the global model. */
function normalizeState(value: EvolutionState & { readonly config?: EvolutionConfig }): EvolutionState {
  const normalize = <T extends { readonly scope: EvolutionScope; readonly projectRoot: string | null }>(item: T): T => ({
    ...item,
    scope: 'global',
    projectRoot: null,
  })
  return {
    ...value,
    config: value.config === undefined ? DEFAULT_CONFIG : value.config,
    settings: value.settings.map(normalize),
    proposals: value.proposals.map(normalize),
    backups: value.backups.map(normalize),
    runs: value.runs.map(({ projectRoot: _projectRoot, ...run }) => run),
  }
}

function publicSetting(setting: EvolutionSetting): Omit<EvolutionSetting, 'scope' | 'projectRoot'> {
  const { scope: _scope, projectRoot: _projectRoot, ...publicValue } = setting
  return publicValue
}

function publicProposal(proposal: EvolutionProposal): Omit<EvolutionProposal, 'scope' | 'projectRoot'> {
  const { scope: _scope, projectRoot: _projectRoot, ...publicValue } = proposal
  return publicValue
}

function publicBackup(backup: EvolutionBackup): Omit<EvolutionBackup, 'scope' | 'projectRoot' | 'settings'> & {
  readonly settings: readonly Omit<EvolutionSetting, 'scope' | 'projectRoot'>[]
} {
  const { scope: _scope, projectRoot: _projectRoot, settings, ...publicValue } = backup
  return { ...publicValue, settings: settings.map(publicSetting) }
}

function scopeRoot(scope: EvolutionScope, projectRoot: string | null): string | null {
  if (scope === 'global') return null
  const root = projectRoot?.trim() ?? ''
  if (root === '') throw new Error('Project-scoped learned instructions require a project root.')
  return root
}

function sameScope(
  candidate: Pick<EvolutionSetting | EvolutionProposal | EvolutionBackup, 'scope' | 'projectRoot'>,
  scope: EvolutionScope,
  projectRoot: string | null,
): boolean {
  return candidate.scope === scope && candidate.projectRoot === scopeRoot(scope, projectRoot)
}

function mergeEvidence(
  left: readonly EvolutionEvidence[],
  right: readonly EvolutionEvidence[],
): EvolutionEvidence[] {
  const values = new Map<string, EvolutionEvidence>()
  for (const item of [...left, ...right]) values.set(`${item.sessionId}:${item.eventSeq}`, item)
  return [...values.values()]
}

/** Serialize cross-table evolution mutations into one durable global replacement. */
export class EvolutionStore {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly global: DomainGlobal<EvolutionState>) {}

  state(): EvolutionState {
    return normalizeState(this.global.get() as EvolutionState & { readonly config?: EvolutionConfig })
  }

  config(): EvolutionConfig {
    return this.state().config
  }

  async setConfig(config: EvolutionConfig): Promise<void> {
    if (!Number.isSafeInteger(config.learningBatchSize) || config.learningBatchSize < 1 || config.learningBatchSize > 100) {
      throw new Error('Learning batch size must be an integer from 1 to 100.')
    }
    if (!Number.isSafeInteger(config.maxPendingProposals) || config.maxPendingProposals < 1 || config.maxPendingProposals > 1000) {
      throw new Error('Pending proposal limit must be an integer from 1 to 1000.')
    }
    await this.mutate((state, _now) => ({
      value: undefined,
      state: { ...state, config },
    }))
  }

  dashboard(): EvolutionDashboard {
    const state = this.state()
    return {
      revision: state.revision,
      config: state.config,
      settings: state.settings.map(publicSetting),
      proposals: state.proposals.map(publicProposal),
      backups: state.backups.map(publicBackup),
      runs: state.runs.slice(-50).reverse(),
    }
  }

  async recordLearningResult(
    run: Omit<EvolutionLearningRun, 'id' | 'proposalCount' | 'createdAt'>,
    drafts: readonly EvolutionProposalDraft[],
  ): Promise<number> {
    return this.mutate((state, now) => {
      const proposals = [...state.proposals]
      let proposalCount = 0
      for (const draft of drafts) {
        const scope: EvolutionScope = 'global'
        const projectRoot = null
        if (draft.action === 'add' && state.settings.some(item => item.scope === scope
          && item.projectRoot === projectRoot
          && item.category === draft.category
          && item.content === draft.content)) continue
        if (draft.action === 'update') {
          const target = state.settings.find(item => item.id === draft.targetId)
          if (target !== undefined && target.category === draft.category && target.content === draft.content) continue
        }
        const duplicate = proposals.find(item => item.status === 'pending'
          && item.scope === scope
          && item.projectRoot === projectRoot
          && item.action === draft.action
          && item.targetId === draft.targetId
          && item.category === draft.category
          && item.content === draft.content)
        if (duplicate !== undefined) {
          const index = proposals.indexOf(duplicate)
          proposals[index] = { ...duplicate, evidence: mergeEvidence(duplicate.evidence, draft.evidence), updatedAt: now }
          proposalCount += 1
          continue
        }
        if (proposals.filter(item => item.status === 'pending').length >= state.config.maxPendingProposals) continue
        proposals.push({
          id: `proposal-${randomUUID()}`,
          ...draft,
          scope,
          projectRoot,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        proposalCount += 1
      }
      const learningRun: EvolutionLearningRun = {
        id: `run-${randomUUID()}`,
        ...run,
        proposalCount,
        createdAt: now,
      }
      return {
        value: proposalCount,
        state: { ...state, proposals, runs: [...state.runs, learningRun] },
      }
    })
  }

  async actOnProposal(id: string, action: 'apply' | 'dismiss'): Promise<void> {
    await this.mutate((state, now) => {
      const proposal = state.proposals.find(item => item.id === id)
      if (proposal === undefined) throw new Error(`Evolution proposal "${id}" was not found.`)
      if (proposal.status !== 'pending') return { value: undefined, state }
      if (action === 'dismiss') {
        return {
          value: undefined,
          state: {
            ...state,
            proposals: state.proposals.map(item => item.id === id ? { ...item, status: 'dismissed', updatedAt: now } : item),
          },
        }
      }

      const settings = [...state.settings]
      const backup = this.backupOf(state, proposal.scope, proposal.projectRoot, 'proposal', `Before applying ${proposal.action} proposal`, now)
      if (proposal.action === 'add') {
        if (proposal.category === null || proposal.content === null || proposal.targetId !== null) {
          throw new Error('The add proposal is no longer valid.')
        }
        settings.push({
          id: `setting-${randomUUID()}`,
          scope: proposal.scope,
          projectRoot: proposal.projectRoot,
          category: proposal.category,
          content: proposal.content,
          evidence: proposal.evidence,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const targetIndex = settings.findIndex(item => item.id === proposal.targetId)
        if (targetIndex === -1) throw new Error('The proposal target changed; refresh the proposal list.')
        const target = settings[targetIndex] as EvolutionSetting
        if (!sameScope(target, proposal.scope, proposal.projectRoot)) {
          throw new Error('The proposal target moved to a different instruction scope.')
        }
        if (proposal.action === 'update') {
          if (proposal.category === null || proposal.content === null) throw new Error('The update proposal is incomplete.')
          settings[targetIndex] = {
            ...target,
            category: proposal.category,
            content: proposal.content,
            evidence: mergeEvidence(target.evidence, proposal.evidence),
            updatedAt: now,
          }
        } else {
          settings.splice(targetIndex, 1)
        }
      }
      const proposals = state.proposals.map(item => {
        if (item.id === id) return { ...item, status: 'applied' as const, updatedAt: now }
        if (proposal.targetId !== null && item.status === 'pending' && item.targetId === proposal.targetId) {
          return { ...item, status: 'expired' as const, updatedAt: now }
        }
        return item
      })
      return { value: undefined, state: { ...state, settings, proposals, backups: [...state.backups, backup] } }
    })
  }

  async mutateSetting(request: EvolutionSettingMutation): Promise<void> {
    await this.mutate((state, now) => {
      const settings = [...state.settings]
      let scope: EvolutionScope
      let projectRoot: string | null
      let summary: string
      let targetId: string | null = null
      if (request.action === 'add') {
        scope = 'global'
        projectRoot = null
        summary = 'Before adding a learned instruction'
        const content = request.content.trim()
        if (content === '') throw new Error('Learned instruction content cannot be empty.')
        if (settings.some(item => item.scope === scope
          && item.projectRoot === projectRoot
          && item.category === request.category
          && item.content === content)) {
          throw new Error('An identical learned instruction already exists in this scope.')
        }
        settings.push({
          id: `setting-${randomUUID()}`,
          scope,
          projectRoot,
          category: request.category,
          content,
          evidence: [],
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const index = settings.findIndex(item => item.id === request.id)
        if (index === -1) throw new Error(`Learned instruction "${request.id}" was not found.`)
        const target = settings[index] as EvolutionSetting
        scope = target.scope
        projectRoot = target.projectRoot
        targetId = target.id
        summary = request.action === 'update'
          ? 'Before updating a learned instruction'
          : 'Before deleting a learned instruction'
        if (request.action === 'update') {
          const content = request.content.trim()
          if (content === '') throw new Error('Learned instruction content cannot be empty.')
          settings[index] = { ...target, category: request.category, content, updatedAt: now }
        } else {
          settings.splice(index, 1)
        }
      }
      const backup = this.backupOf(state, scope, projectRoot, 'manual', summary, now)
      const proposals = targetId === null ? state.proposals : state.proposals.map(item => (
        item.status === 'pending' && item.targetId === targetId
          ? { ...item, status: 'expired' as const, updatedAt: now }
          : item
      ))
      return { value: undefined, state: { ...state, settings, proposals, backups: [...state.backups, backup] } }
    })
  }

  async restoreBackup(id: string): Promise<void> {
    await this.mutate((state, now) => {
      const backup = state.backups.find(item => item.id === id)
      if (backup === undefined) throw new Error(`Evolution backup "${id}" was not found.`)
      const before = this.backupOf(state, backup.scope, backup.projectRoot, 'restore', `Before restoring ${id}`, now)
      const settings = [
        ...state.settings.filter(item => !sameScope(item, backup.scope, backup.projectRoot)),
        ...backup.settings,
      ]
      const liveIds = new Set(settings.map(item => item.id))
      const proposals = state.proposals.map(item => (
        item.status === 'pending' && item.targetId !== null && !liveIds.has(item.targetId)
          ? { ...item, status: 'expired' as const, updatedAt: now }
          : item
      ))
      return { value: undefined, state: { ...state, settings, proposals, backups: [...state.backups, before] } }
    })
  }

  private backupOf(
    state: EvolutionState,
    scope: EvolutionScope,
    projectRoot: string | null,
    source: EvolutionBackup['source'],
    summary: string,
    now: number,
  ): EvolutionBackup {
    return {
      id: `backup-${randomUUID()}`,
      scope,
      projectRoot: scopeRoot(scope, projectRoot),
      source,
      summary,
      settings: state.settings.filter(item => sameScope(item, scope, projectRoot)),
      createdAt: now,
    }
  }

  private mutate<T>(
    operation: (state: EvolutionState, now: number) => { readonly state: EvolutionState; readonly value: T },
  ): Promise<T> {
    const result = this.tail.then(async () => {
      const current = this.state()
      const now = Date.now()
      const outcome = operation(current, now)
      if (outcome.state !== current) {
        await this.global.set({
          ...outcome.state,
          revision: current.revision + 1,
          updatedAt: now,
        })
      }
      return outcome.value
    })
    this.tail = result.then(() => {}, () => {})
    return result
  }
}
