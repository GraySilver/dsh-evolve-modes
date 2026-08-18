# DeepSeek Harness Evolve Modes

[English](README.en.md)｜[中文](README.md)

<p align="center">
  <a href="https://github.com/GraySilver/dsh-evolve-modes/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/GraySilver/dsh-evolve-modes/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://www.npmjs.com/package/@graysilver/dsh-evolve-modes"><img alt="npm" src="https://img.shields.io/npm/v/@graysilver/dsh-evolve-modes?style=flat-square&label=npm"></a>
  <a href="https://github.com/GraySilver/dsh-evolve-modes/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/GraySilver/dsh-evolve-modes?style=flat-square&label=release"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-4D6BFE?style=flat-square"></a>
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.0--rc.6-4D6BFE?style=flat-square">
</p>

> 让 Agent 的工作方式可组合、可审查、可持续改进，最终实现 Agent Self Evoling。

**dsh-evolve-modes** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立 Web 插件。它在输入区提供一个紧凑的工作流控制项，让你组合 Agent 的工作状态、思考策略、质量门禁和自进化行为。

插件不 fork DeepSeek Harness，不复制 Agent loop，也不修改核心代码。安装后，当前任务使用的组合始终显示在输入区旁；全局“自进化模式”设置则负责管理跨会话的学习提议和已批准规则。

![dsh-evolve-modes](https://raw.githubusercontent.com/GraySilver/dsh-evolve-modes/main/assets/social-preview.png)

## 快速安装

推荐通过 npm 将固定版本安装到 DeepSeek Harness Web profile：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @graysilver/dsh-evolve-modes@0.3.1
```

如果已经全局安装 DSH CLI，可以使用简写：

```sh
dsh plugin --profile web add @graysilver/dsh-evolve-modes@0.3.1
```

也可以直接安装对应的 GitHub Release 包：

```sh
dsh plugin --profile web add https://github.com/GraySilver/dsh-evolve-modes/releases/download/v0.3.1/graysilver-dsh-evolve-modes-0.3.1.tgz
```

重启 Web profile 后，自进化模式控件会出现在输入区工具旁。打开顶层 **自进化模式** 设置即可管理全局学习规则。

需要审计源码或进行开发时，可以安装固定 Git revision：

```sh
dsh plugin --profile web add github:GraySilver/dsh-evolve-modes#<trusted-commit>
```

Git 安装包会执行安装期代码，请只安装可信 revision。


## 功能简述

输入区会显示当前组合，例如：

```text
正常 · 标准 · 关 · 进化 开
```

点开控制项即可分别调整四个维度：

| 维度 | 选项 | 作用 |
| --- | --- | --- |
| **工作状态** | 正常 · 计划 | 立即完成任务，或进入官方 DSH 计划工作流。 |
| **思考策略** | 标准 · 第一性原理 | 正常回答，或显式梳理目标、事实、假设、约束、推导和验证。 |
| **质量门禁** | 关 · 对抗性审查 · 验收审查 | 不增加审查，独立寻找风险，或对照任务和已批准计划验收结果。 |
| **自进化** | 关 · 开 | 自动分析会话，生成待人工审阅的规则提议，自动优化AGENTS.md（但不改动 AGENTS.md）|

这不是互斥的“人格模式”，而是每个任务都可以重新组合的一组工作决策。

## 自进化模式

自进化用于从多个已完成的 Agent 协作中识别稳定的用户身份、偏好和工作要求。它默认是 **Propose（提议）**，只提出候选规则，不会自动改变后续行为。

### 默认设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| 自进化 | `Propose` | 新会话和没有明确保存自进化选择的旧会话默认开启。 |
| 学习批次 | `3` | 每累计完成 3 次父 Agent 回复后启动一次学习。可在全局设置中调整为 `1..100`。 |
| 待审阅提议上限 | `100` | 超过上限时不会继续堆积提议，可在全局设置中调整为 `1..1000`。 |
| 学习范围 | 已开启自进化的源会话 | 不再配置项目范围；当前会话打开自进化，就会纳入学习范围。 |
| 规则作用域 | 全局 | 应用后的规则跨会话生效，不绑定项目目录。 |

![自进化模式全局设置](https://raw.githubusercontent.com/GraySilver/dsh-evolve-modes/main/assets/evolve-modes-review.png)

### 学习数据如何被整理

- 每个源会话最多取最近 **100 条学习消息**。
- 保留每轮完整的用户消息，以及该轮最后一个可见的助手消息。
- 助手消息只作为上下文；超过 **2000 个字符**时保留开头 1000 个字符和结尾 1000 个字符，中间以 `...` 代替。
- 提议的证据必须逐字来自用户消息。助手的推断、一次性任务细节、实现结果、沉默或“没有再次提到”都不能单独成为规则证据。

### 学习请求是隔离的

每次学习都使用插件专用的单一 learning persona/system prompt，并把当前批次作为一条结构化 JSON 用户消息传入。学习请求：

- 不继承父会话历史；
- 不继承父 Agent 的工作型上下文；
- 不创建学习子 Agent；
- 不携带工具；
- 不加载源会话工作目录中的 `AGENTS.md` 或 `CLAUDE.md`；
- 只分析可能长期有效的身份信息、偏好和工作要求。

学习失败会记录在设置页，未完成的批次会保留，方便之后重试；不会阻断父 Agent 的正常回复。

### 提议必须经过人工确认

```text
完成 3 次父 Agent 回复
        ↓
隔离的学习请求
        ↓
待审阅提议
        ├─ 应用 → 写入全局 learned instructions
        └─ 忽略 → 不改变后续行为
```

在顶层 **自进化模式** 设置页中可以：

- 调整学习批次大小和待审阅提议上限；
- 查看每条提议的类别、推断类型和原始用户证据；
- 应用或忽略提议；
- 手工新增、修改和删除全局规则；
- 查看学习运行记录和失败原因；
- 从每次变更前自动创建的备份中恢复。

已批准规则会写入带有 `<dsh-evolve-modes-learned-instructions>` 标记的 system prompt section，并在 Trajectory 中投影相同内容。插件只使用自己的持久化存储，不会写入 `AGENTS.md`、`CLAUDE.md` 或任何项目文件。

## 为任务选择组合

| 你需要…… | 推荐组合 | 适合原因 |
| --- | --- | --- |
| 快速完成日常工作 | `正常 · 标准 · 关` | 保持执行节奏，不增加额外流程。 |
| 做高影响决策 | `计划 · 第一性原理 · 关` | 先研究并暴露假设，再进入 DSH 的计划审批流程。 |
| 有把握地交付实现 | `正常 · 标准 · 验收审查` | 完成实现后，由独立审查 Agent 对照任务目标检查结果。 |
| 挑战高风险答案 | `正常 · 第一性原理 · 对抗性审查` | 显式展开推理，再寻找遗漏、反例、回归和缺少依据的结论。 |
| 沉淀稳定的个人偏好 | `正常 · 标准 · 关 · 进化 开` | 按默认每 3 次回复一批识别长期规则，只生成提议，不自动启用。 |



## 质量门禁

### 对抗性审查

在父 Agent 回复完成后启动独立审查 Agent，检查未满足要求、缺少依据的结论、遗漏、回归、反例和安全风险。它只报告证据、缺口和后续行动，不会静默改写、重试或修复父回复。

### 验收审查

对照任务、候选答案以及存在时的已批准计划进行验收。报告固定区分：

```text
Met
Gap
Unverified
Evidence
Concrete follow-up
```

审查报告会显示在对应的助手回复下方。质量审查每个完成的父回复增加一次模型调用和相应延迟，但不会自动执行项目的 test、lint 或 build 命令。

## 第一性原理与计划

- **第一性原理**：将目标、事实、假设、约束、推导和验证写入 `request/header.system`；Trajectory 会保留同一段指令作为可检查证据。关闭后只影响后续请求，历史证据不会被删除。
- **计划模式**：委托给官方 `@deepseek-ai/dsh-plan-mode` service，复用 DSH 的计划持久化和 `exit_plan_mode` 审批流程，不重复实现另一套计划系统。
- **工具策略**：计划和质量审查通过 DSH 的 `tools/pre-execute` pipeline 控制工具；默认允许 `read`、`glob`、`grep`、`read_image`、已配置的平台 shell 和 `exit_plan_mode`。这是一层工作流策略，不是操作系统级 sandbox。

## 命令

可在 Web 输入区或命令 API 使用：

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

旧的单一模式别名仍可迁移：`normal`、`first-principles` 和 `adversarial-review`。它们会把工作状态转换为执行，并按旧模式映射推理方式和质量门禁；当前自进化设置会保留。

## 配置与兼容性

bundle 会自动选择平台 shell。只有目标 profile 已注册该工具时才覆盖：

```yaml
- id: dsh-evolve-modes
  config:
    shellTool: bash
```

质量审查要求 DSH 的 fork/subagent capability；自进化分析要求 DSH 的直接 `llm` service；计划模式要求官方 `planMode` service 和工具注册表。插件需要支持 Web plugin loader、client UI slots、storage domain、Trajectory 和上述 DSH 服务的 DeepSeek Harness 版本。

插件状态保存在自己的 storage domain，可跨服务重启和会话重新加载继续使用。`0.3.0` 会自动迁移旧版本的会话设置、提议、已批准规则、备份和学习记录，不会覆盖已经存在的新名称数据。

## 反馈

Bug 和功能建议请提交到 [GitHub Issues](https://github.com/GraySilver/dsh-evolve-modes/issues)。欢迎在 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 分享集成和使用反馈。

## 许可证

MIT
