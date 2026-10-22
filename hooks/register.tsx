import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TranslateSettings, Translation } from '../types'

import { sameLanguage, translate } from './google'

const DEFAULTS: TranslateSettings = { isOn: false, promptLang: 'en', replyLang: 'zh-CN' }

const settings = atom({ plugin: 'quick-translate', key: 'settings' } as const, DEFAULTS)
const originals = atom({ plugin: 'quick-translate', key: 'originals' } as const, null)
const replies = atom({ plugin: 'quick-translate', key: 'replies' } as const, null)

const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'ru', label: 'Русский' },
] as const

// Prompts the person typed; task notifications, peers and plugins stay as sent.
const TYPED = new Set(['composer', 'bridge', 'sdk'])

function langName(code: string): string {
  return LANGS.find(lang => lang.value === code)?.label ?? code
}

// FNV-1a: a short, stable id for a prompt's text, to find its row again.
function textId(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16)
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function changeSettings($: EngineInterface, change: Partial<TranslateSettings>) {
  const next = await update($, settings, now => ({ ...now, ...change }))
  await $.store.set('settings', next)

  return next
}

// `requestId` is the reply block's, so each block keeps its own translation.
async function translateReply($: EngineInterface, requestId: string, text: string, apiKey?: string) {
  const member = memberOf(replies, { requestId })
  const now = await read($, member)
  if (now?.status === 'busy') return
  if (now?.status === 'done') {
    await update($, member, t => (t?.status === 'done' ? { ...t, isShown: !t.isShown } : t))
    return
  }

  const { promptLang, replyLang } = await read($, settings)
  await update($, member, (): Translation => ({ status: 'busy' }))
  try {
    let out = await translate($, text, replyLang, apiKey)
    if (sameLanguage(out.source, replyLang)) {
      out = await translate($, text, promptLang, apiKey)
    }
    await update($, member, (): Translation => ({ status: 'done', text: out.text, lang: out.target, isShown: true }))
  } catch (err) {
    await update($, member, (): Translation => ({ status: 'error', message: errorText(err) }))
  }
}

export const register: Register = (on, options) => {
  const apiKey = options.apiKey ? String(options.apiKey) : undefined

  on('session.start', async ($, e, next) => {
    const stored = (await $.store.get('settings')) as Partial<TranslateSettings> | undefined
    const { isOn, promptLang, replyLang } = { ...DEFAULTS, ...stored }
    await update($, settings, () => ({ isOn, promptLang, replyLang }))
    await $.command.register({
      name: 'fanyi',
      description: '开关：发送前翻译提示词',
    })

    return next(e)
  })

  on('command.run', { command: 'fanyi' }, async $ => {
    const now = await changeSettings($, { isOn: !(await read($, settings)).isOn })

    return { text: now.isOn ? `发送前翻译：开（译成 ${langName(now.promptLang)}）` : '发送前翻译：关' }
  })

  on('prompt.submit', async ($, e, next) => {
    const isTyped = TYPED.has(e.origin.kind) && !e.command && !e.isMeta
    const { isOn, promptLang } = await read($, settings)
    if (!isTyped || !isOn || e.text.trim() === '') {
      return next(e)
    }

    try {
      const out = await translate($, e.text, promptLang, apiKey)
      if (sameLanguage(out.source, promptLang) || out.text.trim() === '') {
        return next(e)
      }

      await update($, memberOf(originals, { requestId: textId(out.text) }), () => e.text)

      return next({ ...e, text: out.text })
    } catch (err) {
      $.ui.toast(`翻译失败，已发送原文：${errorText(err)}`)

      return next(e)
    }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const original = await read($, memberOf(originals, { requestId: textId(e.props.text) }))
    const row = await next(e)
    if (original === null) return row

    // A code block: the whole original, wrapped, easy to select and copy.
    const { Box, Code, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {row}
        <Text dimColor>原文</Text>
        <Code source={original} />
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    const text = e.props.text
    if (e.props.isSummary || text.trim() === '') return row

    const tr = await read($, memberOf(replies, e))
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)

    const label =
      tr === null
        ? '翻译'
        : tr.status === 'busy'
          ? '翻译中…'
          : tr.status === 'error'
            ? '重试翻译'
            : tr.isShown
              ? '收起译文'
              : '显示译文'

    return (
      <Box flexDirection="column">
        {row}
        <Box>
          <Button key="translate" plain label={label} onPress={() => translateReply($, e.requestId, text, apiKey)} />
        </Box>
        {tr?.status === 'error' && <Text color="red">翻译失败：{tr.message}</Text>}
        {tr?.status === 'done' && tr.isShown && (
          <Box flexDirection="column" paddingLeft={2}>
            <Text dimColor>译文（{langName(tr.lang)}）</Text>
            <Markdown text={tr.text} />
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The band is drawn on these two alone; naming them gives the table its Select.
    if (e.props.hasSurvey || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)

    const now = await read($, settings)
    const { Box, Button, Select } = $.ui.resolve(e)

    return (
      <Box flexWrap="wrap" columnGap={3}>
        <Button
          key="prompt-toggle"
          plain
          label={now.isOn ? '发送前翻译：开' : '发送前翻译：关'}
          onPress={async () => changeSettings($, { isOn: !(await read($, settings)).isOn })}
        />
        <Select
          key="prompt-lang"
          label="发送译成"
          options={LANGS}
          value={now.promptLang}
          onSelect={value => changeSettings($, { promptLang: value })}
        />
        <Select
          key="reply-lang"
          label="回答译成"
          options={LANGS}
          value={now.replyLang}
          onSelect={value => changeSettings($, { replyLang: value })}
        />
      </Box>
    )
  })
}
