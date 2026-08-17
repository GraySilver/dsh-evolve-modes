# dsh-evolve-modes

> Make every agent turn intentional.

**dsh-evolve-modes** is an independent Web plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It turns one compact composer control into a deliberate workflow: choose how the agent should work, how it should reason, how rigorously its result should be checked, and whether completed work may produce reviewable long-term instructions.

No fork of DeepSeek Harness. No duplicate agent loop. Install the plugin, choose a combination, and keep that decision visible in every session.

[中文文档](README.md)

![dsh-evolve-modes](https://raw.githubusercontent.com/GraySilver/dsh-evolve-modes/main/assets/social-preview.png)

## One Control, Four Decisions

The composer shows one concise summary:

```text
Execute · Standard · Off · Evolution Propose
```

Open it to compose four independent dimensions:

| Decision | Options | What it changes |
| --- | --- | --- |
| **Working state** | Execute · Plan | Choose immediate execution or the official DSH planning workflow. |
| **Reasoning strategy** | Standard · First principles | Work normally, or require explicit objectives, facts, assumptions, constraints, derivation, and verification. |
| **Quality gate** | Off · Adversarial review · Acceptance review | Skip review, challenge the answer independently, or check it against the task and an approved plan. |
| **Self-evolution** | Off · Propose | Skip long-term analysis, or by default create human-reviewed rule proposals after every 3 completed parent-agent replies. |

This is not a collection of mutually exclusive modes. It is a small operating model for each task.

## Pick the Right Combination

| When you need to... | Choose | Why |
| --- | --- | --- |
| Move quickly on routine work | `Execute · Standard · Off` | Keep the agent focused on delivery without extra ceremony. |
| Make a high-impact decision | `Plan · First principles · Off` | Research first, expose assumptions, derive the approach, then use DSH's approval flow. |
| Build with confidence | `Execute · Standard · Acceptance review` | Implement normally, then independently check the result against the requested outcome. |
| Challenge a risky answer | `Execute · First principles · Adversarial review` | Make reasoning explicit and ask a separate reviewer to find omissions, counterexamples, and unsupported claims. |
| Accumulate stable preferences | `Execute · Standard · Off · Evolution Propose` | Analyze replies in default batches of 3 and propose durable identity, preference, or work instructions without activating them automatically. |

## Install in One Command

Install the GitHub release tarball into the DeepSeek Harness Web profile:

```sh
dsh plugin --profile web add https://github.com/GraySilver/dsh-evolve-modes/releases/download/v0.3.1/graysilver-dsh-evolve-modes-0.3.1.tgz
```

Restart the Web profile. The self-evolution mode control appears beside the composer tools.

For source auditing or development, install a pinned Git revision instead:

```sh
dsh plugin --profile web add github:GraySilver/dsh-evolve-modes#<trusted-commit>
```

Git-hosted plugins execute install-time code, so install only revisions you trust.

## Built for Real Agent Work

- **One visible decision point.** The selected combination stays readable beside the composer instead of scattering state across separate controls.
- **First-principles reasoning you can inspect.** The extra instruction is persisted in `request/header.system` and appears in Trajectory as evidence of what the model received.
- **Plan mode without a competing implementation.** Plan delegates to the official DSH Plan service, its persisted `plan/mode` event, and its `exit_plan_mode` approval workflow.
- **Independent review where it matters.** Adversarial and Acceptance review run as a forked agent after each completed parent response and render a Markdown report directly below that response.
- **No hidden rewriting.** Reviews identify evidence, gaps, and concrete follow-up actions, but never silently alter, retry, or fix the parent answer.
- **Propose before activation.** The learning agent may only create evidence-backed proposals. A rule reaches the system prompt only after human approval.
- **A plugin-owned Settings page.** The top-level Self-evolution mode page manages global learning thresholds, pending proposals, rules, backups, and learning runs.
- **Plugin-first distribution.** Install the GitHub release tarball, audit a pinned Git revision when needed, and leave DeepSeek Harness core untouched.

![Evolve-mode review panel](https://raw.githubusercontent.com/GraySilver/dsh-evolve-modes/main/assets/evolve-modes-review.png)

## Quality Gates That Explain Themselves

### Adversarial review

An independent reviewer checks the task and answer for unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. Use it when a plausible answer is not enough.

### Acceptance review

An independent reviewer compares the task, candidate answer, and an approved plan when one exists. Its Markdown report separates:

```text
Met
Gap
Unverified
Evidence
Concrete follow-up
```

Use it when you want a clear handoff from implementation to verification.

## Reviewable Self-Evolution

Self-evolution is enabled as `Propose` by default. New sessions and older sessions without an explicit self-evolution choice enter learning after every default batch of 3 completed parent-agent replies; sessions explicitly set to Off stay out of the learning pool. The Self-evolution mode Settings page controls both the batch size and the pending-proposal limit globally.

Each learning request uses one dedicated persona/system prompt and receives the current batch as exactly one structured JSON user message. It does not inherit parent conversation history or parent Agent work context, does not create a learning subagent, does not carry tools, and does not load `AGENTS.md` or `CLAUDE.md` from the source workspace. The isolated request only looks for identity facts, preferences, and work requirements that remain useful beyond the current task.

Automatic learning never changes future behavior directly. Every add, update, or delete first becomes a pending proposal and requires explicit user approval. Proposal evidence must be copied exactly from user messages. Assistant inference, temporary task details, one-off implementation results, silence, and lack of repetition are not sufficient evidence for a rule or deletion.

All approved rules are global. The plugin injects them into a marked `<dsh-evolve-modes-learned-instructions>` system-prompt section and projects the exact section into Trajectory. The Settings page also supports manual edits, apply or dismiss actions, failed-run inspection, and restoration from backups created before each mutation.

All self-evolution data stays in plugin-owned durable storage. The plugin never writes `AGENTS.md`, `CLAUDE.md`, or project files.

## How the Workflow Holds Up

### Plan mode and tools

Plan delegates to the official `@deepseek-ai/dsh-plan-mode` service. This plugin enforces a tool policy through DSH's `tools/pre-execute` pipeline: `read`, `glob`, `grep`, `read_image`, the configured platform shell, and `exit_plan_mode` are allowed; mutation and all other tools receive a clear denial.

The configured shell is intentionally fully available: `bash` on macOS/Linux or `pwsh` on Windows by default. Plan mode is a workflow policy, not an operating-system read-only sandbox. Configure a confining shell or sandbox provider when process isolation matters.

Plan review does not delay or gate official `exit_plan_mode` approval. When the official exit tool successfully submits a plan, that plan is the review candidate rather than only the surrounding assistant text.

### First-principles evidence

The First principles section is persisted in `request/header.system`. Trajectory projects that exact section as a context-style inspection row, so historical requests show the instruction the model received. It does not append a user message or create an artificial transcript event. Turning the strategy off removes the section from later requests while earlier rows remain as historical evidence.

### Review behavior and limits

Both reviewers can inspect with `read`, `glob`, `grep`, `read_image`, and the configured platform shell. Their prompts request non-mutating inspection, but prompt restrictions are not an operating-system sandbox. A review failure is persisted as unavailable and never blocks the parent response or Plan approval.

Quality review adds one model call and corresponding latency per completed parent answer. It does not auto-detect or execute project test, lint, or build commands.

## Persistence and Commands

The bundle stores session controls and reviews in `graysilver_dsh_evolve_modes`, and stores cross-session proposals, approved rules, backups, and learning runs in `graysilver_dsh_evolve_modes_evolution`. On the first start under the new identity, existing data is copied from the former domains. Working state is not duplicated: official Plan mode folds it from the session log. Plugin state survives service restarts and session reloads without adding custom DSH session event types.

Version `0.3.0` fills self-evolution defaults into `0.2.0` records and continues to migrate earlier single-mode records:

| Legacy mode | Reasoning | Quality gate |
| --- | --- | --- |
| `normal` | `standard` | `off` |
| `first-principles` | `first-principles` | `off` |
| `adversarial-review` | `standard` | `general-review` |

Use these commands in the Web composer or through the command API:

```text
/evolve-mode
/evolve-mode working execute
/evolve-mode working plan
/evolve-mode reasoning standard
/evolve-mode reasoning first-principles
/evolve-mode quality off
/evolve-mode quality general-review
/evolve-mode quality acceptance-review
/evolve-mode evolution off
/evolve-mode evolution propose
/evolve-mode evolution batch-size <1..100>
/evolve-mode evolution max-pending-proposals <1..1000>
/evolve-mode review <turn>
/evolve-mode reviews
```

The old single-mode aliases remain migratable: `normal`, `first-principles`, and `adversarial-review`. They reset the working state to Execute, map to the table above, and preserve the current self-evolution setting.

## Configuration

The bundle selects the normal platform shell automatically. Override it only when the target profile registers that exact tool:

```yaml
- id: dsh-evolve-modes
  config:
    shellTool: bash
```

Quality review requires DSH's fork/subagent capability; self-evolution analysis requires DSH's direct `llm` service. Plan mode requires DSH's official `planMode` service and tool registry. Self-evolution adds one isolated model call per completed batch; failed runs appear in Settings and keep the unfinished batch available for a later retry.

## Compatibility

Requires a DeepSeek Harness release that provides the Web plugin loader, client UI slots, storage domains, the direct `llm` service, forked subagents for quality review, the official Plan mode service, and the DSH tools pipeline. GitHub release tarballs are the recommended stable distribution channel; pinned Git revisions remain useful for source auditing and development.

## Feedback

Please use [GitHub Issues](https://github.com/GraySilver/dsh-evolve-modes/issues) for bugs and feature requests. Showcase and integration feedback is welcome in the [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).

## License

MIT
