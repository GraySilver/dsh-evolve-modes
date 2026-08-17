# dsh-task-modes

[中文文档](README.zh.md)

An independent, installable DeepSeek Harness Web bundle with one task-mode button and three composable dimensions, without changing DeepSeek Harness core:

- working state: Execute or Plan;
- reasoning: Standard or First principles;
- quality gate: Off, Adversarial review, or Acceptance review.

![dsh-task-modes](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/social-preview.png)

## Install

Install the pinned npm release into a Web profile without requiring a global DSH installation:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @graysilver/dsh-task-modes@0.2.0
```

If `dsh` is already installed globally, use:

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes@0.2.0
```

Restart the Web profile after installation. One task-mode button appears beside the composer tools. Its label reflects the active combination, for example `Execute · Standard · Off`; opening it presents all three dimensions. The bundle takes the separate Plan-status UI seat, so the composer has one task-mode entry point while retaining the official Plan service and approval workflow. The bundle requires the standard DSH Plan mode capability; it deliberately fails to load when that service is absent instead of presenting a fake Plan mode.

For source auditing or development, install a pinned Git revision instead:

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#<trusted-commit>
```

Git-hosted plugins execute install-time code, so install only revisions you trust.

## Task-mode menu

The task-mode button opens one grouped menu. Its default is `Execute · Standard · Off`. The three dimensions are independent, so choose Plan plus First principles for a high-impact decision, or Execute plus Acceptance review while implementing a feature.

| Control | Values | Behavior |
| --- | --- | --- |
| Working state | Execute, Plan | Plan delegates to the official `@deepseek-ai/dsh-plan-mode` service, including `/plan`, its persisted `plan/mode` event, and the `exit_plan_mode` user-approval workflow. |
| Reasoning | Standard, First principles | First principles adds a system-prompt section that asks the model to state objectives, separate facts from assumptions, identify constraints, derive the approach, and verify the result. |
| Quality gate | Off, Adversarial review, Acceptance review | Runs one independent advisory fork after each completed parent turn. Adversarial and Acceptance are mutually exclusive profiles, not separate stacked reviewers. |

### Plan mode and tools

When official Plan mode is active, this plugin enforces a tool policy through DSH's `tools/pre-execute` pipeline. It permits only `read`, `glob`, `grep`, `read_image`, the configured platform shell, and `exit_plan_mode`; mutation and all other tools receive a clear denial.

The configured shell is intentionally fully available: `bash` on macOS/Linux or `pwsh` on Windows by default. This means Plan mode is **not** an operating-system read-only sandbox. A model or reviewer can issue mutating shell commands if it chooses to do so. Use a confining shell/sandbox provider and permission policy when process isolation is required.

Plan review does not delay or gate official `exit_plan_mode` approval. If a quality profile is enabled, the plugin produces its advisory report after the completed Plan turn. When the official exit tool successfully submitted a plan, that plan is the review candidate rather than only the assistant's surrounding text.

### First principles evidence

The First principles section is included in the persisted `request/header.system`. Trajectory projects that exact section as a context-style inspection row, so historical requests visibly show the injection. It does not append a user message or otherwise add an artificial transcript event. Turning it off removes the section from later requests while earlier rows remain as historical evidence.

### Quality profiles

Adversarial review checks the task and answer for unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. It returns an advisory Markdown verdict with evidence and concrete follow-up actions.

Acceptance review independently compares the task, candidate answer, and an approved plan when available. Its Markdown checklist separates `Met`, `Gap`, `Unverified`, `Evidence`, and `Concrete follow-up` items. It is a model/subagent review only: it does not auto-detect or execute project test, lint, or build commands, and it never rewrites, retries, or fixes the parent result.

Both reviewers can inspect with `read`, `glob`, `grep`, `read_image`, and the configured platform shell. Their prompts request non-mutating inspection, but those prompt constraints are not an operating-system sandbox. A review failure is persisted as unavailable and never blocks the parent answer or Plan approval.

The Web client renders each review as collapsed Markdown below the matching AI reply. The expanded report has a fixed 240px scrollable body.

![Task-mode review panel](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/task-modes-review.png)

## Persistence and commands

The bundle stores its records in the `graysilver_task_modes` storage domain. Working state is deliberately not duplicated there: it is folded by official Plan mode from the session log. Reasoning choices, quality choices, and reports survive service restarts and session reloads without adding custom DSH session event types.

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
