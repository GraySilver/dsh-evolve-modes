# dsh-task-modes

[中文文档](README.zh.md)

An independent, installable DeepSeek Harness Web bundle that adds three task modes: normal execution, first-principles prompting, and an independent forked adversarial review. It works through the DSH plugin layer and does not modify DSH core.

![dsh-task-modes](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/social-preview.png)

## Install

Install the pinned npm release into a Web profile without requiring a global DSH installation:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @graysilver/dsh-task-modes@0.1.8
```

If `dsh` is already installed globally, use the shorter command:

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes@0.1.8
```

Restart the Web profile after installation. The mode selector appears beside the composer tools.

For source auditing or development, install the pinned Git revision instead:

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#4ec9f5f63679784ef6ce248aae42e373d7a8d049
```

Git-hosted plugins execute install-time code, so install only revisions you trust.

## Modes

| Mode | Behavior | Best for |
| --- | --- | --- |
| Normal mode | Sends the request without extra mode instructions. | Everyday work. |
| First Principles | Injects a system-prompt section that asks the model to state objectives, separate facts from assumptions, identify constraints, derive the approach, and verify the result. | Ambiguous or high-leverage decisions. |
| Adversarial Review | After the parent text answer completes, starts a forked child agent to inspect the current task and answer, then renders a Markdown report below that reply. | Catching omissions and unsupported assumptions. |

The reviewer can inspect with `read`, `glob`, `grep`, `read_image`, and the configured platform shell (`bash` on macOS/Linux or `pwsh` on Windows). Its prompt requests non-mutating inspection and no background processes. A reviewer failure is recorded as unavailable and never blocks the parent answer.

![Adversarial review panel](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/task-modes-review.png)

### Cost and limits

- Adversarial Review adds one model call and corresponding latency per completed parent answer.
- The report is advisory. It does not automatically rewrite or retry the parent answer.
- The child uses the tools registered in the profile; tool restrictions in the prompt are not an operating-system sandbox.
- The plugin shares the Harness process privileges. Treat it as trusted code and install pinned revisions.

## Persistence and commands

The bundle stores its records in the `graysilver_task_modes` storage domain. It does not add custom DSH session event types, so it remains compatible with released DSH persistence while mode selections and review reports survive service restarts and session reloads.

Use these commands in the Web composer:

- `/task-mode` shows the current mode.
- `/task-mode <normal|first-principles|adversarial-review>` switches modes.
- `/task-mode review <turn>` opens one review report.
- `/task-mode reviews` lists saved reports.

The Web client renders each report as collapsed Markdown beneath its corresponding AI reply. Expanding it opens a fixed-height, scrollable panel.

## Configuration

The bundle selects the normal platform shell automatically. Override it only when the target profile registers that tool:

```yaml
- id: dsh-task-modes
  config:
    shellTool: bash
```

Adversarial review requires the fork/subagent capability in the selected profile.

## Compatibility

Requires a DeepSeek Harness release that provides the Web plugin loader, client UI slots, storage domains, and forked subagents. npm is the recommended stable distribution channel; pinned Git revisions remain available for source auditing and development.

## Release

See [v0.1.8](https://github.com/GraySilver/dsh-task-modes/releases/tag/v0.1.8) for the current release.

## Feedback

Please use [GitHub Issues](https://github.com/GraySilver/dsh-task-modes/issues) for bugs and feature requests. Showcase and integration feedback is welcome in the [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).

## License

MIT
