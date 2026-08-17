# dsh-task-modes

> Make every agent turn intentional.

**dsh-task-modes** is an independent Web plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It turns one compact composer control into a deliberate workflow: choose how the agent should work, how it should reason, and how rigorously its result should be checked.

No fork of DeepSeek Harness. No duplicate agent loop. Install the plugin, choose a combination, and keep that decision visible in every session.

[中文文档](README.zh.md)

![dsh-task-modes](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/social-preview.png)

## One Control, Three Decisions

The composer shows one concise summary:

```text
Execute · Standard · Off
```

Open it to compose three independent dimensions:

| Decision | Options | What it changes |
| --- | --- | --- |
| **Working state** | Execute · Plan | Choose immediate execution or the official DSH planning workflow. |
| **Reasoning strategy** | Standard · First principles | Work normally, or require explicit objectives, facts, assumptions, constraints, derivation, and verification. |
| **Quality gate** | Off · Adversarial review · Acceptance review | Skip review, challenge the answer independently, or check it against the task and an approved plan. |

This is not a collection of mutually exclusive modes. It is a small operating model for each task.

## Pick the Right Combination

| When you need to... | Choose | Why |
| --- | --- | --- |
| Move quickly on routine work | `Execute · Standard · Off` | Keep the agent focused on delivery without extra ceremony. |
| Make a high-impact decision | `Plan · First principles · Off` | Research first, expose assumptions, derive the approach, then use DSH's approval flow. |
| Build with confidence | `Execute · Standard · Acceptance review` | Implement normally, then independently check the result against the requested outcome. |
| Challenge a risky answer | `Execute · First principles · Adversarial review` | Make reasoning explicit and ask a separate reviewer to find omissions, counterexamples, and unsupported claims. |

## Install in One Command

Install the published npm release into the DeepSeek Harness Web profile:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @graysilver/dsh-task-modes@0.2.0
```

Or, when `dsh` is already installed:

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes@0.2.0
```

Restart the Web profile. The task-mode control appears beside the composer tools.

For source auditing or development, install a pinned Git revision instead:

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#<trusted-commit>
```

Git-hosted plugins execute install-time code, so install only revisions you trust.

## Built for Real Agent Work

- **One visible decision point.** The selected combination stays readable beside the composer instead of scattering state across separate controls.
- **First-principles reasoning you can inspect.** The extra instruction is persisted in `request/header.system` and appears in Trajectory as evidence of what the model received.
- **Plan mode without a competing implementation.** Plan delegates to the official DSH Plan service, its persisted `plan/mode` event, and its `exit_plan_mode` approval workflow.
- **Independent review where it matters.** Adversarial and Acceptance review run as a forked agent after each completed parent response and render a Markdown report directly below that response.
- **No hidden rewriting.** Reviews identify evidence, gaps, and concrete follow-up actions, but never silently alter, retry, or fix the parent answer.
- **Plugin-first distribution.** Install through npm, audit a pinned Git revision when needed, and leave DeepSeek Harness core untouched.

![Task-mode review panel](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/task-modes-review.png)

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

The bundle stores its records in the `graysilver_task_modes` storage domain. Working state is not duplicated there: official Plan mode folds it from the session log. Reasoning choices, quality choices, and reports survive service restarts and session reloads without adding custom DSH session event types.

Version `0.2.0` keeps the domain descriptor at version `1` and automatically rewrites legacy records on startup:

| Legacy mode | Reasoning | Quality gate |
| --- | --- | --- |
| `normal` | `standard` | `off` |
| `first-principles` | `first-principles` | `off` |
| `adversarial-review` | `standard` | `general-review` |

Use these commands in the Web composer or through the command API:

```text
/task-mode
/task-mode working execute
/task-mode working plan
/task-mode reasoning standard
/task-mode reasoning first-principles
/task-mode quality off
/task-mode quality general-review
/task-mode quality acceptance-review
/task-mode review <turn>
/task-mode reviews
```

The old single-mode aliases remain accepted during the `0.2.x` release line: `normal`, `first-principles`, and `adversarial-review`. They reset the working state to Execute and map to the table above.

## Configuration

The bundle selects the normal platform shell automatically. Override it only when the target profile registers that exact tool:

```yaml
- id: dsh-task-modes
  config:
    shellTool: bash
```

Quality review requires DSH's fork/subagent capability. Plan mode requires DSH's official `planMode` service and tool registry.

## Compatibility

Requires a DeepSeek Harness release that provides the Web plugin loader, client UI slots, storage domains, forked subagents, the official Plan mode service, and the DSH tools pipeline. npm is the recommended stable distribution channel; pinned Git revisions remain useful for source auditing and development.

## Feedback

Please use [GitHub Issues](https://github.com/GraySilver/dsh-task-modes/issues) for bugs and feature requests. Showcase and integration feedback is welcome in the [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).

## License

MIT
