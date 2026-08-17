import { EVOLUTION_REMOTE_DESCRIPTORS } from './evolution/wire.ts'

/** Strict Host Typert contribution discovered from this plugin package. */
export const TYPERT = {
  package: '@graysilver/dsh-evolve-modes',
  face: 'host',
  schemas: [],
  invocations: EVOLUTION_REMOTE_DESCRIPTORS,
  model: {
    services: [{
      description: 'Plugin-owned self-evolution proposal and learned-instruction service.',
      summary: 'Plugin-owned self-evolution proposal and learned-instruction service.',
      tags: [],
      jsDoc: '/** Plugin-owned self-evolution proposal and learned-instruction service. */',
      key: 'evolveModes',
      exportName: 'DshEvolveModesService',
      members: [],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
