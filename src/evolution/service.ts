import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  EvolutionDashboard,
  EvolutionDashboardRequest,
  EvolutionConfigRequest,
  EvolutionProposalRequest,
  EvolutionRestoreRequest,
  EvolutionSettingRequest,
} from '../types.ts'
import type { EvolutionStore } from './store.ts'

/** Host Remote service for the plugin-owned self-evolution dashboard. */
export class DshEvolveModesService extends TypertRemoteService {
  constructor(ctx: Context, private readonly store: EvolutionStore) {
    super(ctx, 'evolveModes')
  }

  /** Read the global self-evolution dashboard. */
  dashboard(_request: EvolutionDashboardRequest): EvolutionDashboard {
    return this.store.dashboard()
  }

  /** Update the global self-evolution scheduling and proposal limits. */
  async config(request: EvolutionConfigRequest): Promise<EvolutionDashboard> {
    await this.store.setConfig(request.config)
    return this.store.dashboard()
  }

  /** Apply or dismiss one automatic proposal, then return the refreshed dashboard. */
  async proposal(request: EvolutionProposalRequest): Promise<EvolutionDashboard> {
    await this.store.actOnProposal(request.id, request.action)
    return this.store.dashboard()
  }

  /** Add, update, or delete one approved rule and return the refreshed dashboard. */
  async setting(request: EvolutionSettingRequest): Promise<EvolutionDashboard> {
    await this.store.mutateSetting(request.mutation)
    return this.store.dashboard()
  }

  /** Restore one global backup and return the refreshed dashboard. */
  async restore(request: EvolutionRestoreRequest): Promise<EvolutionDashboard> {
    await this.store.restoreBackup(request.id)
    return this.store.dashboard()
  }
}
