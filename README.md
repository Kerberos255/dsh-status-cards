# Status Cards for DeepSeek Harness

[简体中文](README.zh-CN.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [Security](SECURITY.md)

A **unified DSH status dashboard** with a compact session-edge panel. See session health, model/preset/permission state, channel connectivity, jobs, schedules, memory/compaction status, and optional provider usage.

## Features

- A read-only **Status Center** in plugin settings for session-scoped diagnostics and plugin health.
- A collapsible side panel showing **OpenCode Go usage windows** and **DeepSeek account/API balances** when those sources are configured.
- Discord/Feishu `/status` integration via [Channel Core](https://github.com/Kerberos255/dsh-channel-core), scoped to the current bound conversation.
- Cached/on-demand provider requests, not a continuously running high-frequency quota poll.
- Keeps account credentials in the DSH host; the client receives bounded status/amount data.

## Install and setup

Requires the DSH session and plugin services declared in [package.json](package.json).

```sh
dsh plugin --profile desktop add github:Kerberos255/dsh-status-cards
```

Use your own profile as appropriate. Restart DSH when plugin code changes. Open **Settings → Plugins → Status Cards** and choose which available provider balances or cards should appear.

## What the UI shows

| Area | Information |
| --- | --- |
| Status Center | Current session, selected model/preset/permissions, channel, jobs, schedules, plugin status |
| Session-edge card | Configured usage and wallet sources, remaining windows and refresh status |
| Discord / Feishu | A privacy-scoped view of the **current bound session** only |

An unconfigured or unavailable provider is **not** displayed as a zero balance. Provider data may be cached, delayed, or unavailable. Only configured sources appear in the quota panel.

## Privacy and tests

Credentials/cookies/API keys stay on the Host. Remote chat channels do **not** receive machine paths, all-account balances, other sessions, or private memory/skill text through status. Data that is not available is marked unavailable rather than fabricated.

Run `npm test` for portable provider-cache, balance-formatting and status logic. Actual balances and channel delivery require live, authorized services. Configuration sample: [config.example.json](config.example.json).

Related: [Channel Core](https://github.com/Kerberos255/dsh-channel-core) · [Lossless Context](https://github.com/Kerberos255/dsh-lossless-context) · [Dream & Memory](https://github.com/Kerberos255/dsh-memory-dreaming).

MIT licensed. See [LICENSE](LICENSE).
