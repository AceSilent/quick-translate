export type Translation =
  | { status: 'busy' }
  | { status: 'done'; text: string; lang: string; isShown: boolean }
  | { status: 'error'; message: string }

// Named apart from the engine's own `Settings`, which the module block would see first.
export type TranslateSettings = {
  isOn: boolean
  promptLang: string
  replyLang: string
  // An interface language (`zh`, `ja`, ...), or `auto` to follow the system.
  uiLang: string
}

export type SentPrompt = { original: string; translation: string }

declare module 'claude-code' {
  interface PluginState {
    'quick-translate': {
      settings: TranslateSettings
      // The system's locale as this session found it (`zh_CN`), '' when unknown.
      systemLocale: string
      // A prompt sent translated, by the id of either its text as typed or its translation.
      sentPrompts: StateFamily<SentPrompt | null>
      replies: StateFamily<Translation | null>
    }
  }
}
