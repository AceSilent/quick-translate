export type Translation =
  | { status: 'busy' }
  | { status: 'done'; text: string; lang: string; isShown: boolean }
  | { status: 'error'; message: string }

// Named apart from the engine's own `Settings`, which the module block would see first.
export type TranslateSettings = {
  isOn: boolean
  promptLang: string
  replyLang: string
}

declare module 'claude-code' {
  interface PluginState {
    'quick-translate': {
      settings: TranslateSettings
      // A sent prompt's text as typed, by the id of the translation it was sent as.
      originals: StateFamily<string | null>
      replies: StateFamily<Translation | null>
    }
  }
}
