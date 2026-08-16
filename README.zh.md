# dsh-task-modes

DeepSeek Harness Web 的任务模式插件：正常模式、第一性原理和只读对抗式审查。

## 安装

通过 GitHub tag 安装到 Web profile：

```sh
dsh plugin --profile web add github:GraySilver/dsh-task-modes#v0.1.7
```

npm 发布后可使用：

```sh
dsh plugin --profile web add @graysilver/dsh-task-modes
```

安装后重启 Web profile，选择器会出现在输入区工具旁。

## 模式

- **正常模式**：不添加额外提示词。
- **第一性原理**：向 system prompt 加入目标、事实与假设、约束、推导和验证要求。
- **对抗式审查**：文本答复完成后启动 fork 子 Agent，审查当前任务与候选答复，并保存 Markdown 报告。

审查器仅可使用 `read`、`glob`、`grep`、`read_image` 和平台 shell（macOS/Linux 为 `bash`，Windows 为 `pwsh`）。提示词禁止修改文件和启动后台进程。审查失败只记录“不可用”报告，不会阻断原答复。

## 持久化

插件把数据存入自己的 `graysilver_task_modes` storage domain，不写入自定义 DSH session event。已发布 DSH 会拒绝未知的必需事件，因此这种方式可在不修改 DSH core 的前提下，让模式选择和审查报告跨服务重启、会话重新加载后继续存在。

`/task-mode` 查看当前模式，`/task-mode <normal|first-principles|adversarial-review>` 切换，`/task-mode review <turn>` 查看某一回合的报告，`/task-mode reviews` 查看全部已保存报告。Web 端会在对应 AI 回复下方以折叠 Markdown 显示审查结果；展开后内容区高度固定并可滚动。

## 配置

bundle 会按平台选择 shell。只有目标 profile 已注册所选工具时才覆盖：

```yaml
- id: dsh-task-modes
  config:
    shellTool: bash
```

## 安全

插件代码与 Harness 进程拥有相同权限。请只安装可信且固定版本的代码。对抗式审查限制了子 Agent 工具，但它不是 sandbox。
