import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TranslateSettings, Translation } from '../types'

import { sameLanguage, translate } from './google'
import { STRINGS, UI_LANGS, uiLangOf } from './i18n'
import type { Strings } from './i18n'

const DEFAULTS: TranslateSettings = { isOn: false, promptLang: 'en', replyLang: 'zh-CN', uiLang: 'auto' }

const settings = atom({ plugin: 'quick-translate', key: 'settings' } as const, DEFAULTS)
const systemLocale = atom({ plugin: 'quick-translate', key: 'systemLocale' } as const, '')
const sentPrompts = atom({ plugin: 'quick-translate', key: 'sentPrompts' } as const, null)
const replies = atom({ plugin: 'quick-translate', key: 'replies' } as const, null)

// What Google translates to and from, each under its own name.
const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
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

function stringsOf(now: TranslateSettings, locale: string): Strings {
  return STRINGS[uiLangOf(now.uiLang === 'auto' ? locale : now.uiLang)]
}

// The interface's words as the settings and the system ask, read so a drawing redraws on a change.
async function uiStrings($: EngineInterface): Promise<Strings> {
  return stringsOf(await read($, settings), await read($, systemLocale))
}

// The system's language: the locale variables, else macOS's own setting; '' when neither says.
async function detectLocale($: EngineInterface): Promise<string> {
  const fromEnv = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  if (fromEnv && !/^(C|POSIX)([.@]|$)/.test(fromEnv)) return fromEnv

  try {
    const run = await $.process.run(['defaults', 'read', '-g', 'AppleLocale'])
    if (run.exitCode === 0) return run.stdout.trim()
  } catch {
    // Not macOS, or nothing to run it with.
  }

  return ''
}

function normalize(raw: Partial<TranslateSettings> | undefined): TranslateSettings {
  const { isOn, promptLang, replyLang, uiLang } = { ...DEFAULTS, ...raw }

  return { isOn: isOn === true, promptLang: String(promptLang), replyLang: String(replyLang), uiLang: String(uiLang) }
}

// What a first run starts from: replies in the system's language.
function firstSettings(locale: string): TranslateSettings {
  const ui = uiLangOf(locale)

  return { ...DEFAULTS, replyLang: ui === 'zh' ? 'zh-CN' : ui }
}

// One file for every session and every copy of the mod: `$.store` is kept per
// copy (an installed one, one in development), so settings saved there stayed there.
async function settingsPath($: EngineInterface): Promise<string> {
  return `${(await $.env.get('HOME')) ?? ''}/.config/quick-translate/settings.json`
}

// The file's mtime as this copy last read or wrote it; a reload starts over.
let seenMtime = -1

async function saveSettings($: EngineInterface, next: TranslateSettings): Promise<TranslateSettings> {
  const path = await settingsPath($)
  await $.fs.write(path, `${JSON.stringify(next, null, 2)}\n`)
  seenMtime = (await $.fs.stat(path)).mtimeMs

  return update($, settings, () => next)
}

// Brings state up to the file, so a change made in another session shows here too.
async function syncSettings($: EngineInterface): Promise<TranslateSettings> {
  const path = await settingsPath($)
  if (!(await $.fs.exists(path))) {
    // No shared file yet: start it from what this copy had saved, or from the system.
    const legacy = (await $.store.get('settings')) as Partial<TranslateSettings> | undefined
    const first = legacy ? normalize(legacy) : firstSettings(await read($, systemLocale))

    return saveSettings($, first)
  }

  const { mtimeMs } = await $.fs.stat(path)
  if (mtimeMs === seenMtime) return read($, settings)

  try {
    const fresh = normalize(JSON.parse(await $.fs.read(path)) as Partial<TranslateSettings>)
    seenMtime = mtimeMs

    return update($, settings, () => fresh)
  } catch {
    // Mid-write or edited by hand into something unreadable: keep what we have.
    return read($, settings)
  }
}

async function changeSettings($: EngineInterface, change: Partial<TranslateSettings>) {
  return saveSettings($, { ...(await syncSettings($)), ...change })
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

  const { promptLang, replyLang } = await syncSettings($)
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
    const locale = await detectLocale($)
    await update($, systemLocale, () => locale)
    const now = await syncSettings($)
    $.clock.every(3000, () => void syncSettings($))
    await $.command.register({
      name: 'fanyi',
      description: stringsOf(now, locale).commandDescription,
    })

    return next(e)
  })

  on('command.run', { command: 'fanyi' }, async $ => {
    const now = await changeSettings($, { isOn: !(await read($, settings)).isOn })
    const ui = await uiStrings($)

    return { text: now.isOn ? ui.commandOn(langName(now.promptLang)) : ui.switchOff }
  })

  on('prompt.submit', async ($, e, next) => {
    const isTyped = TYPED.has(e.origin.kind) && !e.command && !e.isMeta
    if (!isTyped || e.text.trim() === '') {
      return next(e)
    }
    const { isOn, promptLang } = await syncSettings($)
    if (!isOn) {
      return next(e)
    }

    try {
      const out = await translate($, e.text, promptLang, apiKey)
      if (sameLanguage(out.source, promptLang) || out.text.trim() === '') {
        return next(e)
      }

      // Found again by either text: a surface may draw the row as stored or as typed.
      const sent = { original: e.text, translation: out.text }
      await update($, memberOf(sentPrompts, { requestId: textId(out.text) }), () => sent)
      await update($, memberOf(sentPrompts, { requestId: textId(e.text) }), () => sent)

      return next({ ...e, text: out.text })
    } catch (err) {
      $.ui.toast((await uiStrings($)).sentOriginal(errorText(err)))

      return next(e)
    }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const sent = await read($, memberOf(sentPrompts, { requestId: textId(e.props.text) }))
    if (sent === null) return next(e)

    // The bubble holds what Claude read; the line under it, what was typed.
    const row = await next({ ...e, props: { ...e.props, text: sent.translation } })
    const ui = await uiStrings($)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {row}
        <Text dimColor>
          {ui.original}：{sent.original}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    const text = e.props.text
    if (e.props.isSummary || text.trim() === '') return row

    const tr = await read($, memberOf(replies, e))
    const ui = await uiStrings($)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)

    const label =
      tr === null
        ? ui.translate
        : tr.status === 'busy'
          ? ui.translating
          : tr.status === 'error'
            ? ui.retry
            : tr.isShown
              ? ui.hide
              : ui.show

    return (
      <Box flexDirection="column">
        {row}
        {/* A real button, set apart from the reply, so it does not read as its last line. */}
        <Box marginTop={1}>
          <Button key="translate" label={label} onPress={() => translateReply($, e.requestId, text, apiKey)} />
        </Box>
        {tr?.status === 'error' && <Text color="error">{ui.failed(tr.message)}</Text>}
        {tr?.status === 'done' && tr.isShown && (
          <Box flexDirection="column" paddingLeft={2}>
            <Text dimColor>{ui.translationIn(langName(tr.lang))}</Text>
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
    const ui = stringsOf(now, await read($, systemLocale))
    const { Box, Button, Select } = $.ui.resolve(e)

    return (
      <Box flexWrap="wrap" columnGap={3}>
        <Button
          key="prompt-toggle"
          plain
          label={now.isOn ? ui.switchOn : ui.switchOff}
          onPress={async () => changeSettings($, { isOn: !(await read($, settings)).isOn })}
        />
        <Select
          key="prompt-lang"
          label={ui.sendIn}
          options={LANGS}
          value={now.promptLang}
          onSelect={value => changeSettings($, { promptLang: value })}
        />
        <Select
          key="reply-lang"
          label={ui.replyIn}
          options={LANGS}
          value={now.replyLang}
          onSelect={value => changeSettings($, { replyLang: value })}
        />
        <Select
          key="ui-lang"
          label={ui.uiLang}
          options={[{ value: 'auto', label: ui.followSystem }, ...UI_LANGS]}
          value={now.uiLang}
          onSelect={value => changeSettings($, { uiLang: value })}
        />
      </Box>
    )
  })
}
