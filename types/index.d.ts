export type Translation =
  | { status: 'busy' }
  | { status: 'done'; text: string; lang: string; isShown: boolean }
  | { status: 'error'; message: string }

// `replace` sends the translation alone; `attach` keeps the prompt as typed and
// hands the model the translation beside it, so a rewind restores what was typed.
export type SendMode = 'replace' | 'attach'

// Named apart from the engine's own `Settings`, which the module block would see first.
export type TranslateSettings = {
  isOn: boolean
  promptLang: string
  replyLang: string
  mode: SendMode
}

// The line drawn under a sent prompt: the original, or the translation attached.
export type PromptNote = { label: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'quick-translate': {
      settings: TranslateSettings
      notes: StateFamily<PromptNote | null>
      replies: StateFamily<Translation | null>
    }
  }
}
