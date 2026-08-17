import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  EvolutionDashboard,
  EvolutionDashboardRequest,
  EvolutionConfigRequest,
  EvolutionProposalRequest,
  EvolutionRestoreRequest,
  EvolutionSettingRequest,
} from './index.d.ts'

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

export declare const TYPERT_REMOTE: TypertRemoteContribution
export default TYPERT_REMOTE
