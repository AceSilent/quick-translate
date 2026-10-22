import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SETTINGS_FILE = '/home/me/.config/quick-translate/settings.json'
const ZH = 'zh_CN.UTF-8'

// Stands in for translate.googleapis.com: Chinese becomes English, anything
// else becomes `[tl] text`, and every request is kept for the test to read.
function fakeGoogle(on: On, opts: { status?: number } = {}) {
  const requests: { tl: string; q: string }[] = []

  on('http.fetch', (_, e) => {
    const tl = new URL(e.url).searchParams.get('tl') ?? ''
    const q = decodeURIComponent((e.init?.body ?? '').replace(/^q=/, ''))
    requests.push({ tl, q })
    const isChinese = /[一-鿿]/.test(q)
    const out = isChinese && tl === 'en' ? 'Hello' : `[${tl}] ${q}`
    const status = opts.status ?? 200

    return {
      value: {
        status,
        ok: status === 200,
        headers: {},
        text: JSON.stringify([[[out, q]], null, isChinese ? 'zh-CN' : 'en']),
      },
    }
  })

  return requests
}

// A home folder in memory, holding the settings file every session shares,
// and the per-copy store an older version saved its settings in.
function fakeHome(on: On, opts: { store?: Record<string, unknown>; lang?: string } = {}) {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  let tick = 1

  mock.env(on, { HOME: '/home/me', ...(opts.lang ? { LANG: opts.lang } : {}) })
  mock.store(on, opts.store)
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.stat', (_, e) => {
    const file = files.get(e.path)

    return file
      ? { value: { kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs, isLink: false } }
      : { deny: `${e.path}: no such file` }
  })
  on('fs.read', (_, e) => {
    const file = files.get(e.path)

    return file ? { value: file.text } : { deny: `${e.path}: no such file` }
  })
  on('fs.write', (_, e) => {
    files.set(e.path, { text: e.text, mtimeMs: tick++ })

    return { value: undefined }
  })

  return {
    settings: () => JSON.parse(files.get(SETTINGS_FILE)?.text ?? 'null') as unknown,
    // Another session saving its settings.
    saveElsewhere: (value: unknown) => files.set(SETTINGS_FILE, { text: JSON.stringify(value), mtimeMs: tick++ }),
  }
}

// Stands in for the engine's rows; a user row shows the text its bubble is given.
function engineRow(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.component === 'UserMessage' ? `bubble: ${String(e.props.text)}` : 'engine row'}</Text>
  })
}

async function start($: Engine, on: On) {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'fanyi' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  return clock
}

function promptSink(on: On) {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)

    return { text: e.text }
  })

  return sent
}

function typed($: Engine, text: string) {
  return $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
}

const REPLY = {
  plugin: 'quick-translate',
  component: 'AssistantMessage',
  props: { text: 'Run this:\n```sh\nnpm test\n```\nIt should pass.', isFirstOfReply: true },
} as const

const BAND = {
  plugin: 'quick-translate',
  surface: 'desktop',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('a reply gets a translate button, on every surface', async ($, on) => {
  const requests = fakeGoogle(on)
  fakeHome(on, { lang: ZH })
  engineRow(on)
  await start($, on)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...REPLY, surface, requestId: `reply-${surface}` })

    expect(await ui.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    expect((await ui.find({ key: 'translate' }))?.text).toBe('翻译')

    await ui.press({ key: 'translate' })
    const shown = await ui.find({ type: 'Markdown' })
    expect(shown?.text).toBe('[zh-CN] Run this:\n```sh\nnpm test\n```\n[zh-CN] It should pass.')
    expect((await ui.find({ key: 'translate' }))?.text).toBe('收起译文')

    await ui.press({ key: 'translate' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    expect((await ui.find({ key: 'translate' }))?.text).toBe('显示译文')
    await ui.unmount()
  }

  // The code block never went to Google.
  expect(requests.every(r => !r.q.includes('npm test'))).toBe(true)
})

test('a reply already in Chinese is translated to English instead', async ($, on) => {
  const requests = fakeGoogle(on)
  fakeHome(on, { lang: ZH })
  engineRow(on)
  await start($, on)

  const ui = await $.ui.mount({
    ...REPLY,
    surface: 'desktop',
    props: { text: '你好', isFirstOfReply: true },
  })
  await ui.press({ key: 'translate' })

  expect(requests.map(r => r.tl)).toEqual(['zh-CN', 'en'])
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('Hello')
  await ui.unmount()
})

test('a failed request shows the error and offers a retry', async ($, on) => {
  fakeGoogle(on, { status: 429 })
  fakeHome(on, { lang: ZH })
  engineRow(on)
  await start($, on)

  const ui = await $.ui.mount({ ...REPLY, surface: 'desktop' })
  await ui.press({ key: 'translate' })

  expect((await ui.find({ type: 'Text', text: /HTTP 429/ }))?.text).toContain('翻译失败')
  expect((await ui.find({ key: 'translate' }))?.text).toBe('重试翻译')
  await ui.unmount()
})

test('with the switch on, a typed prompt is sent translated and the row keeps the original', async ($, on) => {
  fakeGoogle(on)
  fakeHome(on, { lang: ZH })
  engineRow(on)
  const sent = promptSink(on)
  await start($, on)

  await typed($, '你好')
  expect(sent).toEqual(['你好'])

  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('发送前翻译：关')
  await band.press({ key: 'prompt-toggle' })
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('发送前翻译：开')

  await typed($, '你好')
  await typed($, 'already English')
  await $.prompt.submit({ text: '任务完成', origin: { kind: 'task-notification' }, wait: false })
  expect(sent).toEqual(['你好', 'Hello', 'already English', '任务完成'])

  // Drawn from the stored row, or from what was typed: the bubble shows the
  // translation either way, and the line under it the original.
  for (const text of ['Hello', '你好']) {
    const row = await $.ui.mount({
      plugin: 'quick-translate',
      surface: 'desktop',
      component: 'UserMessage',
      requestId: `row-${text}`,
      props: { text, origin: { kind: 'composer' }, isExpanded: false },
    })
    expect((await row.find({ type: 'Text', text: /^bubble/ }))?.text).toBe('bubble: Hello')
    expect((await row.find({ type: 'Text', text: /^原文/ }))?.text).toBe('原文：你好')
    await row.unmount()
  }

  // A prompt sent as typed keeps its row as it was.
  const plain = await $.ui.mount({
    plugin: 'quick-translate',
    surface: 'desktop',
    component: 'UserMessage',
    props: { text: 'already English', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect((await plain.find({ type: 'Text', text: /^bubble/ }))?.text).toBe('bubble: already English')
  expect(await plain.find({ type: 'Text', text: /^原文/ })).toBeUndefined()
  await plain.unmount()
  await band.unmount()
})

test('the band picks the languages and saves them where every session reads them', async ($, on) => {
  const requests = fakeGoogle(on)
  const home = fakeHome(on, { lang: ZH })
  engineRow(on)
  const sent = promptSink(on)
  await start($, on)

  const band = await $.ui.mount(BAND)
  await band.press({ key: 'prompt-toggle' })
  await band.select({ key: 'prompt-lang', value: 'ja' })
  await band.select({ key: 'reply-lang', value: 'ko' })
  expect((await band.find({ key: 'prompt-lang' }))?.props.value).toBe('ja')
  expect(home.settings()).toEqual({ isOn: true, promptLang: 'ja', replyLang: 'ko', uiLang: 'auto' })

  await typed($, '你好')
  expect(sent).toEqual(['[ja] 你好'])

  const reply = await $.ui.mount({ ...REPLY, surface: 'desktop' })
  await reply.press({ key: 'translate' })
  expect(requests.at(-1)?.tl).toBe('ko')
  expect((await reply.find({ type: 'Text', text: /^译文（/ }))?.text).toBe('译文（한국어）')
  await reply.unmount()
  await band.unmount()
})

test('a change saved in another session shows here within seconds', async ($, on) => {
  fakeGoogle(on)
  const home = fakeHome(on, { lang: ZH })
  engineRow(on)
  const sent = promptSink(on)
  const clock = await start($, on)

  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('发送前翻译：关')

  home.saveElsewhere({ isOn: true, promptLang: 'ja', replyLang: 'zh-CN' })
  await clock.advance(3000)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('发送前翻译：开')
  expect((await band.find({ key: 'prompt-lang' }))?.props.value).toBe('ja')

  // A prompt reads the file itself, without waiting for the next look.
  home.saveElsewhere({ isOn: true, promptLang: 'ko', replyLang: 'zh-CN' })
  await typed($, '你好')
  expect(sent).toEqual(['[ko] 你好'])
  await band.unmount()
})

test('settings an older version saved carry over to the shared file', async ($, on) => {
  const home = fakeHome(on, {
    lang: ZH,
    store: { settings: { isOn: true, promptLang: 'en', replyLang: 'zh-CN', mode: 'attach' } },
  })
  await start($, on)
  expect(home.settings()).toEqual({ isOn: true, promptLang: 'en', replyLang: 'zh-CN', uiLang: 'auto' })

  const result = await $.command.run({
    command: 'fanyi',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(result).toMatchObject({ text: '发送前翻译：关' })
  expect(home.settings()).toEqual({ isOn: false, promptLang: 'en', replyLang: 'zh-CN', uiLang: 'auto' })
})

// macOS's own language setting, as `defaults read -g AppleLocale` prints it.
function macLocale(on: On, locale: string) {
  on('process.run', (_, e) => ({
    value:
      e.argv.join(' ') === 'defaults read -g AppleLocale'
        ? { exitCode: 0, stdout: `${locale}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
        : { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
}

test('the interface follows the system language', async ($, on) => {
  fakeGoogle(on)
  fakeHome(on, { lang: 'ja_JP.UTF-8' })
  engineRow(on)
  await start($, on)

  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('送信前に翻訳：オフ')
  expect((await band.find({ key: 'reply-lang' }))?.props.label).toBe('回答の翻訳先')

  const reply = await $.ui.mount({ ...REPLY, surface: 'desktop' })
  expect((await reply.find({ key: 'translate' }))?.text).toBe('翻訳')
  await reply.press({ key: 'translate' })
  expect((await reply.find({ key: 'translate' }))?.text).toBe('訳文を閉じる')
  await reply.unmount()
  await band.unmount()
})

test('with no locale variables, macOS\'s setting decides, and a first run replies in it', async ($, on) => {
  const home = fakeHome(on)
  macLocale(on, 'de_DE')
  await start($, on)

  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('Vor dem Senden übersetzen: Aus')
  expect(home.settings()).toEqual({ isOn: false, promptLang: 'en', replyLang: 'de', uiLang: 'auto' })
  await band.unmount()
})

test('with nothing to tell the language by, the interface is English', async ($, on) => {
  fakeHome(on)
  await start($, on)

  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('Translate before sending: Off')
  await band.unmount()
})

test('the picker sets the interface language, in every language it lists', async ($, on) => {
  const home = fakeHome(on, { lang: ZH })
  await start($, on)

  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('发送前翻译：关')

  const expected = {
    zh: '发送前翻译：关',
    ja: '送信前に翻訳：オフ',
    en: 'Translate before sending: Off',
    fr: 'Traduire avant l’envoi : désactivé',
    de: 'Vor dem Senden übersetzen: Aus',
    it: 'Traduci prima dell’invio: disattivato',
    es: 'Traducir antes de enviar: desactivado',
  }
  for (const [lang, text] of Object.entries(expected)) {
    await band.select({ key: 'ui-lang', value: lang })
    expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe(text)
  }
  expect(home.settings()).toMatchObject({ uiLang: 'es' })

  await band.select({ key: 'ui-lang', value: 'auto' })
  expect((await band.find({ key: 'prompt-toggle' }))?.text).toBe('发送前翻译：关')
  await band.unmount()
})
