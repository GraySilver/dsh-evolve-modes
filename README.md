# DeepSeek Harness Mode

[English](README.en.md)｜[中文](README.md)

> 让每一次 Agent 协作都有明确的工作方式。

**dsh-task-modes** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立 Web 插件。它把输入区中的一个紧凑控制项变成可组合的任务工作流：选择 Agent 如何工作、如何思考，以及如何审查结果。

不 fork DeepSeek Harness，不复制 Agent loop，也不改核心代码。安装插件后，每个会话都能清楚看到当前任务组合。


![dsh-task-modes](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/social-preview.png)

## 一个按钮，三种决策方式

输入区会显示一个简洁的当前状态：

```text
Execute · Standard · Off
```

点开后可以独立组合三个维度：

| 决策 | 选项 | 改变什么 |
| --- | --- | --- |
| **工作状态** | 执行 · 计划 | 立即执行，或进入官方 DSH 计划工作流。 |
| **思考策略** | 标准 · 第一性原理 | 正常完成任务，或要求显式梳理目标、事实、假设、约束、推导与验证。 |
| **质量门禁** | 关闭 · 对抗性审查 · 验收审查 | 不审查、独立挑战当前答复，或按照任务与已批准计划验收结果。 |

这不是一组互斥的“模式”，而是每个任务都可以选择的小型工作模型。

## 为任务选择合适组合

| 当你需要…… | 选择 | 原因 |
| --- | --- | --- |
| 快速完成日常工作 | `Execute · Standard · Off` | 保持执行节奏，不增加额外流程。 |
| 做高影响决策 | `Plan · First principles · Off` | 先研究、显式暴露假设、推导方案，再进入 DSH 的计划审批流程。 |
| 有把握地交付实现 | `Execute · Standard · Acceptance review` | 正常开发后，由独立 Agent 对照任务目标审查结果。 |
| 挑战一个高风险答案 | `Execute · First principles · Adversarial review` | 先把推理显式化，再让独立审查者寻找遗漏、反例和缺少依据的结论。 |

## 一条命令安装

将已发布的 npm 版本安装到 DeepSeek Harness Web profile：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @graysilver/dsh-task-modes@0.2.0
```

已经安装 `dsh` 时：

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes@0.2.0
```

重启 Web profile 后，任务模式按钮会出现在输入区工具旁。

需要审计源码或进行开发时，可以安装固定 Git revision：

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#<trusted-commit>
```

Git 安装包会执行安装期代码，请只安装可信 revision。

## 为真实 Agent 工作流而设计

- **一个明确入口。** 当前组合始终显示在输入区旁，不会把状态拆散到多个控制项中。
- **可检查的第一性原理。** 注入的 system prompt 会持久化到 `request/header.system`，Trajectory 中可以直接查看模型当时收到的内容。
- **不重复实现计划模式。** 计划功能复用官方 DSH Plan service、持久化的 `plan/mode` 事件和 `exit_plan_mode` 审批流程。
- **在需要的位置进行独立审查。** 对抗性审查和验收审查会在父回复完成后启动 fork Agent，并将 Markdown 报告显示在对应回复下方。
- **不暗中改写答案。** 审查只给出证据、缺口和后续行动，不会静默修改、重试或修复父回复。
- **插件化分发。** 通过 npm 安装；需要审计时可安装固定 Git revision；DeepSeek Harness core 保持不变。

![任务模式审查面板](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/task-modes-review.png)

## 能解释清楚的质量门禁

### 对抗性审查

独立审查 Agent 会检查当前任务和答案中的未满足要求、缺少依据的结论、遗漏、回归、反例与安全风险。适合“看起来合理”还不够的任务。

### 验收审查

独立审查 Agent 会对照任务、候选答案，以及存在时的已批准计划。报告固定区分：

```text
Met
Gap
Unverified
Evidence
Concrete follow-up
```

适合从“已经实现”走向“有验收证据”的交付场景。

## 工作流如何保持可靠

### 计划模式与工具

Plan 功能委托给官方 `@deepseek-ai/dsh-plan-mode` service。插件通过 DSH 的 `tools/pre-execute` pipeline 执行工具策略：只允许 `read`、`glob`、`grep`、`read_image`、已配置的平台 shell 和 `exit_plan_mode`；所有修改工具及其它工具都会收到明确拒绝。

已配置的 shell 刻意保持完整能力：macOS/Linux 默认使用 `bash`，Windows 默认使用 `pwsh`。Plan mode 是工作流策略，不是操作系统级只读 sandbox。需要进程隔离时，应配置具备约束能力的 shell 或 sandbox provider。

Plan 审核不会延迟或阻断官方 `exit_plan_mode` 审批。官方退出工具成功提交计划时，审查的候选内容是该计划本身，而不仅是周围的助手文本。

### 第一性原理证据

第一性原理 section 会持久化到 `request/header.system`。Trajectory 从其中投影完全相同的内容为上下文式检查行，因此历史请求能直接看到模型当时收到的指令。它不会追加用户消息，也不会人为增加 transcript event。关闭该策略后，后续请求不再包含此 section，已有行则保留为历史证据。

### 审查行为与边界

两种审查都可以使用 `read`、`glob`、`grep`、`read_image` 和已配置的平台 shell。提示词要求进行非修改性检查，但提示词限制不是操作系统 sandbox。审查失败会以不可用状态持久化，且不会阻断父答复或 Plan 审批。

质量审查会在每个完成的父答复后增加一次模型调用和相应延迟。它不会自动识别或执行项目 test、lint、build 命令。

## 持久化与命令

bundle 使用 `graysilver_task_modes` storage domain 保存记录。工作状态不会在这里重复存储，而是由官方 Plan mode 从 session log 折叠得到。推理选择、质量选择和报告可跨服务重启、会话重新加载继续存在，同时不新增自定义 DSH session event 类型。

`0.2.0` 保持 domain descriptor 的版本为 `1`，启动时自动重写旧记录：

| 旧模式 | 推理方式 | 质量门 |
| --- | --- | --- |
| `normal` | `standard` | `off` |
| `first-principles` | `first-principles` | `off` |
| `adversarial-review` | `standard` | `general-review` |

可在 Web 输入区或命令 API 使用：

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

旧的单一模式别名会在 `0.2.x` 期间继续接受：`normal`、`first-principles` 和 `adversarial-review`。它们会将工作状态重置为执行，并按上表转换。

## 配置

bundle 会自动选择平台 shell。只有目标 profile 已注册该工具时才覆盖：

```yaml
- id: dsh-task-modes
  config:
    shellTool: bash
```

质量审查要求 DSH 的 fork/subagent capability；计划模式要求官方 `planMode` service 和工具注册表。

## 兼容性

需要提供 Web plugin loader、client UI slots、storage domain、forked subagent、官方 Plan mode service 与 DSH tools pipeline 的 DeepSeek Harness 版本。npm 是推荐的稳定分发渠道；固定 Git revision 继续用于源码审计和开发。

## 反馈

Bug 和功能建议请提交到 [GitHub Issues](https://github.com/GraySilver/dsh-task-modes/issues)。欢迎在 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 分享集成和使用反馈。

## 许可证

MIT
