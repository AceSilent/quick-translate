import type { EngineInterface } from 'claude-code'

type Http = Pick<EngineInterface, 'http'>

export type Translated = { text: string; source: string; target: string }

const FREE_URL = 'https://translate.googleapis.com/translate_a/single'
const CLOUD_URL = 'https://translation.googleapis.com/language/translate/v2'
const CHUNK_CHARS = 4000

type Piece = { text: string; isCode: boolean }

// Fenced code blocks pass through untranslated.
function splitCode(markdown: string): Piece[] {
  const pieces: Piece[] = []
  let lines: string[] = []
  let fence: string | null = null

  const flush = (isCode: boolean) => {
    if (lines.length > 0) pieces.push({ text: lines.join('\n'), isCode })
    lines = []
  }

  for (const line of markdown.split('\n')) {
    const mark = line.trim().match(/^(`{3,}|~{3,})/)?.[1]

    if (fence === null && mark !== undefined) {
      flush(false)
      fence = mark
      lines.push(line)
    } else if (fence !== null) {
      lines.push(line)
      if (mark !== undefined && mark[0] === fence[0] && mark.length >= fence.length && line.trim() === mark) {
        flush(true)
        fence = null
      }
    } else {
      lines.push(line)
    }
  }
  flush(fence !== null)

  return pieces
}

function chunk(text: string): string[] {
  const chunks: string[] = []
  let current = ''

  for (const line of text.split('\n')) {
    const joined = current === '' ? line : `${current}\n${line}`
    if (joined.length > CHUNK_CHARS && current !== '') {
      chunks.push(current)
      current = line
    } else {
      current = joined
    }
  }
  chunks.push(current)

  return chunks
}

async function requestFree($: Http, text: string, target: string) {
  const url = `${FREE_URL}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t`
  const res = await $.http.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `q=${encodeURIComponent(text)}`,
  })
  if (!res.ok) throw new Error(`Google Translate: HTTP ${res.status}`)

  const data = JSON.parse(res.text) as [Array<[string | null]> | null, unknown, string | null]
  const translated = (data[0] ?? []).map(segment => segment[0] ?? '').join('')

  return { text: translated, source: data[2] ?? '' }
}

async function requestCloud($: Http, text: string, target: string, apiKey: string) {
  const res = await $.http.fetch(CLOUD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({ q: text, target, format: 'text' }),
  })
  if (!res.ok) throw new Error(`Cloud Translation: HTTP ${res.status}`)

  const data = JSON.parse(res.text) as {
    data: { translations: Array<{ translatedText: string; detectedSourceLanguage?: string }> }
  }
  const [first] = data.data.translations

  return { text: first?.translatedText ?? '', source: first?.detectedSourceLanguage ?? '' }
}

export function sameLanguage(a: string, b: string): boolean {
  return a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0]
}

// `source` is the language Google detected in the first chunk of prose.
export async function translate(
  $: Http,
  markdown: string,
  target: string,
  apiKey?: string,
): Promise<Translated> {
  let source = ''
  const out: string[] = []

  for (const piece of splitCode(markdown)) {
    if (piece.isCode || piece.text.trim() === '') {
      out.push(piece.text)
      continue
    }
    const parts: string[] = []
    for (const part of chunk(piece.text)) {
      const done = apiKey ? await requestCloud($, part, target, apiKey) : await requestFree($, part, target)
      if (source === '') source = done.source
      parts.push(done.text)
    }
    out.push(parts.join('\n'))
  }

  return { text: out.join('\n'), source, target }
}
