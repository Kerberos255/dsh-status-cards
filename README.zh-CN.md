# DSH 状态卡片（Status Cards）

[English](README.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [安全说明](SECURITY.md)

统一查看 **DSH 会话、任务、渠道、插件与额度状态**，并在聊天页边缘使用可收起的小卡片。它不只是“额度插件”。

## 主要功能

- 「设置 → 插件 → 状态卡片」提供会话状态总览：当前模型/预设/权限、渠道连接、Jobs、Schedule、LCM、Dream、技能和恢复提示。
- 会话右侧提供可收起的额度面板：可显示 OpenCode Go 使用窗口、DeepSeek 已登录账户及 API 余额。
- 与 Channel Core 协作，让飞书或 Discord 的 `/status` 返回**当前绑定会话**的只读状态，不泄露其他会话。
- 仅在需要时查询并缓存额度，不持续高频轮询；无凭证或接口不可用时给出明确状态，不伪装为零余额。

## 安装与快速开始

运行要求和依赖见 [package.json](package.json)：

```sh
dsh plugin --profile desktop add github:Kerberos255/dsh-status-cards
```

在「设置 → 插件 → 状态卡片」选择开启哪些额度来源和展示方式，刷新检查状态。更新代码后重启 DSH。聊天页的卡片默认缩在边缘图标处，可展开或固定，不持续占用聊天宽度。

## 各模块显示什么？

| 界面 | 作用 |
| --- | --- |
| 插件设置页 | 检查会话、任务、模型、渠道、后台作业与插件健康 |
| 聊天右侧卡片 | 查看已经配置的供应商额度、余额及缓存/刷新状态 |
| 飞书、Discord `/status` | 仅查看当前频道绑定会话的安全状态，不暴露整机信息 |

OpenCode Go 的窗口信息来自实际服务，DeepSeek 余额优先读取 DSH 已登录账户；若没有账户但原生 API 凭证可用，可按设置使用官方 API 余额。账户与 API 两种来源不会被擅自混算。供应商不可达、未配置或鉴权失败时不会显示假的 `¥0.00`。

## 隐私和测试

Cookie、API Key 与凭证保存在 Host；前端只拿经过筛选的状态和数字。远程渠道不会收到本机路径、整机额度、其他 Session 信息或记忆正文。

`npm test` 检查缓存和数字展示等便携逻辑；实时余额和远端消息需登录后测试。配置：[config.example.json](config.example.json) · 安全：[SECURITY.md](SECURITY.md)。

相关：[Channel Core](https://github.com/Kerberos255/dsh-channel-core) · [无损上下文](https://github.com/Kerberos255/dsh-lossless-context) · [Dream 与长期记忆](https://github.com/Kerberos255/dsh-memory-dreaming)。

许可证：[MIT](LICENSE)。
