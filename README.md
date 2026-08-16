# dsh-task-modes

Task execution modes for DeepSeek Harness Web: normal execution, first-principles prompting, and read-only adversarial review.

## Install

Install the tagged GitHub bundle into a Web profile:

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#v0.1.1
```

After the npm release is available:

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes
```

Restart the Web profile after installation. The selector appears beside the composer tools.

## Modes

- **Normal** sends work without additional guidance.
- **First principles** adds a system-prompt section requiring objectives, facts versus assumptions, constraints, derivation, and verification.
- **Adversarial review** starts a forked child after a text answer is complete. It audits the current request and answer, then saves a Markdown report for the session.

The reviewer may use `read`, `glob`, `grep`, `read_image`, and the configured platform shell (`bash` on macOS/Linux, `pwsh` on Windows). Its prompt prohibits modifications and background processes. A reviewer failure produces an unavailable report and never blocks the parent answer.

## Persistence

The plugin stores its own records in the `graysilver_task_modes` storage domain. It intentionally does not append custom DSH session events: released DSH persistence rejects unknown required event types. Mode selection and review reports therefore survive service restarts and session reloads without requiring a patched DSH core.

Use `/task-mode` to inspect the current mode, `/task-mode <normal|first-principles|adversarial-review>` to switch, and `/task-mode reviews` to display saved reports. The Web review panel renders the same reports as Markdown.

## Configuration

The bundle picks the normal platform shell automatically. Override it in the profile patch only when the selected tool is registered in that profile:

```yaml
- id: dsh-task-modes
  config:
    shellTool: bash
```

## Security

A plugin runs inside the Harness process and has the same process privileges as the Harness. Install only pinned revisions and code you trust. Adversarial review limits the child tool set, but it is not a sandbox.
