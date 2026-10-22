# quick-translate

Claude Code 的翻译 mod，用 Google 翻译：

- **发送前翻译提示词**：输入框上方有一行设置，可以打开或关闭"发送前翻译"，并选择译成哪种语言。Claude 只读到译文；你的消息下面用一个代码块显示原文，方便复制（比如用快照撤回后，输入框里是译文，可以从这里复制原文）。
- **翻译 Claude 的回答**：每段回答下面有一个"翻译"按钮，点了在下方显示译文，再点一次收起。回答本来就是目标语言时，改译成"发送译成"的语言。代码块不发给 Google，原样保留。

`/fanyi` 也能切换"发送前翻译"。设置会在会话之间保留。

A Claude Code mod that translates your prompts before sending and adds a translate button under each reply, using Google Translate.

## 安装

在终端版 Claude Code 的输入框里：

```
/plugin install quick-translate --marketplace AceSilent/quick-translate
```

问 `Add marketplace?` 时输入 `y`，然后选安装范围（选 user 就是所有会话都能用）。

在 shell 里：

```bash
claude plugin install quick-translate --marketplace AceSilent/quick-translate
```

在 Claude 桌面 app 里（那里不能用 `/plugin`）：点输入框旁边的 +，选 Plugins，用 Add marketplace 添加 `AceSilent/quick-translate`，再点 Add plugin。

装好后要新开一个会话。桌面 app 内存紧张时不会提前启动新会话，这时要先发一条消息才会出现。

## 设置

- 语言在输入框上方那一行里选。
- 可选：Google Cloud Translation API key。不填就用免费的 `translate.googleapis.com` 接口。免费接口是非官方的，按 IP 限流，用量大或共用代理 IP 时可能返回 429。填了 key 就改用官方 Cloud Translation API v2，费用记在你自己的 Google Cloud 项目上：

```bash
claude plugin configure quick-translate@acesilent
```

翻译失败时：回答下面显示错误和"重试翻译"按钮；提示词照原文发送，并弹出一条提示。

## 隐私

你要翻译的文字（打开开关后发出的提示词、点了"翻译"的回答）会发给 Google。

## 开发

```bash
claude plugin validate .
claude plugin test .
```

## 许可证

MIT
