import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  EvolutionDashboard,
  EvolutionDashboardRequest,
  EvolutionConfigRequest,
  EvolutionProposalRequest,
  EvolutionRestoreRequest,
  EvolutionSettingRequest,
} from './types.ts'
import { EVOLUTION_REMOTE_DESCRIPTORS } from './evolution/wire.ts'

/** Browser namespace installed by this plugin's strict Remote contribution. */
export interface DshEvolveModesRemote {
  dashboard(request: EvolutionDashboardRequest): Promise<RemoteResult<EvolutionDashboard>>
  config(request: EvolutionConfigRequest): Promise<RemoteResult<EvolutionDashboard>>
  proposal(request: EvolutionProposalRequest): Promise<RemoteResult<EvolutionDashboard>>
  setting(request: EvolutionSettingRequest): Promise<RemoteResult<EvolutionDashboard>>
  restore(request: EvolutionRestoreRequest): Promise<RemoteResult<EvolutionDashboard>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'evolveModes/dashboard': DshEvolveModesRemote['dashboard']
    'evolveModes/config': DshEvolveModesRemote['config']
    'evolveModes/proposal': DshEvolveModesRemote['proposal']
    'evolveModes/setting': DshEvolveModesRemote['setting']
    'evolveModes/restore': DshEvolveModesRemote['restore']
  }
  interface TypertRemoteNamespaceMap {
    evolveModes: DshEvolveModesRemote
  }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: '@graysilver/dsh-evolve-modes',
  descriptors: EVOLUTION_REMOTE_DESCRIPTORS,
}

export default TYPERT_REMOTE
