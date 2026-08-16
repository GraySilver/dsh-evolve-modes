# dsh-task-modes

[English README](README.md)

一个可独立安装的 DeepSeek Harness Web bundle，提供三种任务模式：正常执行、第一性原理提示词和独立 fork 的对抗式审查。它通过 DSH 插件层工作，不修改 DSH core。

![dsh-task-modes](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/social-preview.png)

## 安装

无需全局安装 DSH，直接将固定版本的 npm bundle 安装到 Web profile：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @graysilver/dsh-task-modes@0.1.9
```

如果已经全局安装 `dsh`，可以使用更短的命令：

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes@0.1.9
```

安装后重启 Web profile，模式选择器会出现在输入区工具旁。

需要审计源码或进行开发时，可以改用固定 Git revision：

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#4ec9f5f63679784ef6ce248aae42e373d7a8d049
```

Git 安装包会执行安装期代码，请只安装可信 revision。

## 模式

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| 正常模式 | 不添加额外模式指令，直接发送请求。 | 日常工作。 |
| 第一性原理 | 向 system prompt 注入目标、事实与假设、约束、推导和验证要求。Trajectory 会从持久化请求头投影该段原文，并以现有上下文样式显示为检查记录。 | 模糊或影响较大的决策。 |
| 对抗式审查 | 父 Agent 完成文本答复后，启动 fork 子 Agent 检查当前任务和答复，并在该答复下方显示 Markdown 报告。 | 发现遗漏和缺少依据的假设。 |

审查器可以使用 `read`、`glob`、`grep`、`read_image` 和平台 shell（macOS/Linux 为 `bash`，Windows 为 `pwsh`）。提示词要求只读检查且不启动后台进程。审查失败会记录为不可用，不会阻断父 Agent 的答复。

![对抗式审查面板](https://raw.githubusercontent.com/GraySilver/dsh-task-modes/main/assets/task-modes-review.png)

### 成本与限制

- 每个完成的父答复都会额外产生一次模型调用和相应延迟。
- 报告只提供建议，不会自动重写或重试父答复。
- 子 Agent 使用 profile 中注册的工具；提示词限制不是操作系统 sandbox。
- 插件与 Harness 进程共享权限，请按可信代码安装固定 revision。

## 持久化与命令

bundle 使用独立的 `graysilver_task_modes` storage domain 保存记录，不添加自定义 DSH session event 类型。因此在不修改已发布 DSH persistence 的前提下，模式选择和审查报告可跨服务重启、会话重新加载继续存在。

可在 Web 输入区使用：

- `/task-mode` 查看当前模式。
- `/task-mode <normal|first-principles|adversarial-review>` 切换模式。
- `/task-mode review <turn>` 查看某一回合报告。
- `/task-mode reviews` 查看全部已保存报告。

Web 端会在对应 AI 回复下方以折叠 Markdown 显示报告，展开后内容区高度固定并可滚动。

第一性原理的 Trajectory 行仅用于检查。它只会在持久化的 `request/header.system` 确实包含完整提示词时派生，不会追加用户消息，也不会改变模型请求。切换到其他模式后，下一次模型请求不再包含该 section；先前的 Trajectory 行仍保留，用于证明历史请求当时使用了什么。

## 配置

bundle 会自动选择平台 shell。只有目标 profile 已注册该工具时才覆盖：

```yaml
- id: dsh-task-modes
  config:
    shellTool: bash
```

对抗式审查要求所选 profile 提供 fork/subagent 能力。

## 兼容性

需要提供 Web 插件加载器、客户端 UI slots、storage domain 和 fork 子 Agent 的 DeepSeek Harness 版本。npm 是推荐的稳定分发渠道；固定 Git revision 继续用于源码审计和开发。

## 发布

当前版本见 [v0.1.9](https://github.com/GraySilver/dsh-task-modes/releases/tag/v0.1.9)。

## 反馈

Bug 和功能建议请提交到 [GitHub Issues](https://github.com/GraySilver/dsh-task-modes/issues)。欢迎在 [DeepSeek Harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 分享集成和使用反馈。

## 许可证

MIT
