import { t as EVOLUTION_REMOTE_DESCRIPTORS } from "./wire-Ch1E-bs7.js";
//#region src/typert.ts
/** Strict Host Typert contribution discovered from this plugin package. */
const TYPERT = {
	package: "@graysilver/dsh-evolve-modes",
	face: "host",
	schemas: [],
	invocations: EVOLUTION_REMOTE_DESCRIPTORS,
	model: {
		services: [{
			description: "Plugin-owned self-evolution proposal and learned-instruction service.",
			summary: "Plugin-owned self-evolution proposal and learned-instruction service.",
			tags: [],
			jsDoc: "/** Plugin-owned self-evolution proposal and learned-instruction service. */",
			key: "evolveModes",
			exportName: "DshEvolveModesService",
			members: [],
			types: []
		}],
		events: [],
		objects: []
	}
};
//#endregion
export { TYPERT, TYPERT as default };
