import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SETTINGS_FILE = '/home/me/.config/quick-translate/settings.json'

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
function fakeHome(on: On, store?: Record<string, unknown>) {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  let tick = 1

  mock.env(on, { HOME: '/home/me' })
  mock.store(on, store)
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

function engineRow(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine row</Text>
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
  fakeHome(on)
  engineRow(on)

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
  fakeHome(on)
  engineRow(on)

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
  fakeHome(on)
  engineRow(on)

  const ui = await $.ui.mount({ ...REPLY, surface: 'desktop' })
  await ui.press({ key: 'translate' })

  expect((await ui.find({ type: 'Text', text: /HTTP 429/ }))?.text).toContain('翻译失败')
  expect((await ui.find({ key: 'translate' }))?.text).toBe('重试翻译')
  await ui.unmount()
})

test('with the switch on, a typed prompt is sent translated and the row keeps the original', async ($, on) => {
  fakeGoogle(on)
  fakeHome(on)
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

  const row = await $.ui.mount({
    plugin: 'quick-translate',
    surface: 'desktop',
    component: 'UserMessage',
    props: { text: 'Hello', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await row.find({ type: 'Text', text: '原文' })).toBeDefined()
  expect((await row.find({ type: 'Code' }))?.text).toBe('你好')
  await row.unmount()
  await band.unmount()
})

test('the band picks the languages and saves them where every session reads them', async ($, on) => {
  const requests = fakeGoogle(on)
  const home = fakeHome(on)
  engineRow(on)
  const sent = promptSink(on)
  await start($, on)

  const band = await $.ui.mount(BAND)
  await band.press({ key: 'prompt-toggle' })
  await band.select({ key: 'prompt-lang', value: 'ja' })
  await band.select({ key: 'reply-lang', value: 'ko' })
  expect((await band.find({ key: 'prompt-lang' }))?.props.value).toBe('ja')
  expect(home.settings()).toEqual({ isOn: true, promptLang: 'ja', replyLang: 'ko' })

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
  const home = fakeHome(on)
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
  const home = fakeHome(on, { settings: { isOn: true, promptLang: 'en', replyLang: 'zh-CN', mode: 'attach' } })
  await start($, on)
  expect(home.settings()).toEqual({ isOn: true, promptLang: 'en', replyLang: 'zh-CN' })

  const result = await $.command.run({
    command: 'fanyi',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(result).toMatchObject({ text: '发送前翻译：关' })
  expect(home.settings()).toEqual({ isOn: false, promptLang: 'en', replyLang: 'zh-CN' })
})
