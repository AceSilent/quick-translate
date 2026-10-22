// The mod's own words, in the languages its interface speaks.

export type UiLang = 'zh' | 'ja' | 'en' | 'fr' | 'de' | 'it' | 'es'

export type Strings = {
  switchOn: string
  switchOff: string
  sendIn: string
  replyIn: string
  uiLang: string
  followSystem: string
  translate: string
  translating: string
  retry: string
  hide: string
  show: string
  original: string
  failed: (reason: string) => string
  translationIn: (lang: string) => string
  sentOriginal: (reason: string) => string
  commandDescription: string
  commandOn: (lang: string) => string
}

export const STRINGS: Record<UiLang, Strings> = {
  zh: {
    switchOn: '发送前翻译：开',
    switchOff: '发送前翻译：关',
    sendIn: '发送译成',
    replyIn: '回答译成',
    uiLang: '界面语言',
    followSystem: '跟随系统',
    translate: '翻译',
    translating: '翻译中…',
    retry: '重试翻译',
    hide: '收起译文',
    show: '显示译文',
    original: '原文',
    failed: reason => `翻译失败：${reason}`,
    translationIn: lang => `译文（${lang}）`,
    sentOriginal: reason => `翻译失败，已发送原文：${reason}`,
    commandDescription: '开关：发送前翻译提示词',
    commandOn: lang => `发送前翻译：开（译成 ${lang}）`,
  },
  ja: {
    switchOn: '送信前に翻訳：オン',
    switchOff: '送信前に翻訳：オフ',
    sendIn: '送信言語',
    replyIn: '回答の翻訳先',
    uiLang: '表示言語',
    followSystem: 'システムに合わせる',
    translate: '翻訳',
    translating: '翻訳中…',
    retry: '再試行',
    hide: '訳文を閉じる',
    show: '訳文を表示',
    original: '原文',
    failed: reason => `翻訳に失敗しました：${reason}`,
    translationIn: lang => `訳文（${lang}）`,
    sentOriginal: reason => `翻訳に失敗したため、原文のまま送信しました：${reason}`,
    commandDescription: '送信前の翻訳をオン／オフ',
    commandOn: lang => `送信前に翻訳：オン（${lang}）`,
  },
  en: {
    switchOn: 'Translate before sending: On',
    switchOff: 'Translate before sending: Off',
    sendIn: 'Send in',
    replyIn: 'Translate replies to',
    uiLang: 'Interface',
    followSystem: 'System',
    translate: 'Translate',
    translating: 'Translating…',
    retry: 'Retry',
    hide: 'Hide translation',
    show: 'Show translation',
    original: 'Original',
    failed: reason => `Translation failed: ${reason}`,
    translationIn: lang => `Translation (${lang})`,
    sentOriginal: reason => `Translation failed; sent the original: ${reason}`,
    commandDescription: 'Turn translate-before-sending on or off',
    commandOn: lang => `Translate before sending: On (${lang})`,
  },
  fr: {
    switchOn: 'Traduire avant l’envoi : activé',
    switchOff: 'Traduire avant l’envoi : désactivé',
    sendIn: 'Envoyer en',
    replyIn: 'Traduire les réponses en',
    uiLang: 'Interface',
    followSystem: 'Système',
    translate: 'Traduire',
    translating: 'Traduction…',
    retry: 'Réessayer',
    hide: 'Masquer la traduction',
    show: 'Afficher la traduction',
    original: 'Texte original',
    failed: reason => `Échec de la traduction : ${reason}`,
    translationIn: lang => `Traduction (${lang})`,
    sentOriginal: reason => `Échec de la traduction ; le texte original a été envoyé : ${reason}`,
    commandDescription: 'Activer ou désactiver la traduction avant l’envoi',
    commandOn: lang => `Traduire avant l’envoi : activé (${lang})`,
  },
  de: {
    switchOn: 'Vor dem Senden übersetzen: Ein',
    switchOff: 'Vor dem Senden übersetzen: Aus',
    sendIn: 'Senden auf',
    replyIn: 'Antworten übersetzen in',
    uiLang: 'Oberfläche',
    followSystem: 'System',
    translate: 'Übersetzen',
    translating: 'Wird übersetzt…',
    retry: 'Erneut versuchen',
    hide: 'Übersetzung ausblenden',
    show: 'Übersetzung anzeigen',
    original: 'Original',
    failed: reason => `Übersetzung fehlgeschlagen: ${reason}`,
    translationIn: lang => `Übersetzung (${lang})`,
    sentOriginal: reason => `Übersetzung fehlgeschlagen, Original gesendet: ${reason}`,
    commandDescription: 'Übersetzen vor dem Senden ein- oder ausschalten',
    commandOn: lang => `Vor dem Senden übersetzen: Ein (${lang})`,
  },
  it: {
    switchOn: 'Traduci prima dell’invio: attivo',
    switchOff: 'Traduci prima dell’invio: disattivato',
    sendIn: 'Invia in',
    replyIn: 'Traduci le risposte in',
    uiLang: 'Interfaccia',
    followSystem: 'Sistema',
    translate: 'Traduci',
    translating: 'Traduzione…',
    retry: 'Riprova',
    hide: 'Nascondi traduzione',
    show: 'Mostra traduzione',
    original: 'Originale',
    failed: reason => `Traduzione non riuscita: ${reason}`,
    translationIn: lang => `Traduzione (${lang})`,
    sentOriginal: reason => `Traduzione non riuscita, inviato il testo originale: ${reason}`,
    commandDescription: 'Attiva o disattiva la traduzione prima dell’invio',
    commandOn: lang => `Traduci prima dell’invio: attivo (${lang})`,
  },
  es: {
    switchOn: 'Traducir antes de enviar: activado',
    switchOff: 'Traducir antes de enviar: desactivado',
    sendIn: 'Enviar en',
    replyIn: 'Traducir respuestas a',
    uiLang: 'Interfaz',
    followSystem: 'Sistema',
    translate: 'Traducir',
    translating: 'Traduciendo…',
    retry: 'Reintentar',
    hide: 'Ocultar traducción',
    show: 'Mostrar traducción',
    original: 'Original',
    failed: reason => `Error al traducir: ${reason}`,
    translationIn: lang => `Traducción (${lang})`,
    sentOriginal: reason => `Error al traducir; se envió el original: ${reason}`,
    commandDescription: 'Activar o desactivar la traducción antes de enviar',
    commandOn: lang => `Traducir antes de enviar: activado (${lang})`,
  },
}

// Each language under its own name, as a picker lists them.
export const UI_LANGS: readonly { value: UiLang; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'es', label: 'Español' },
]

// `zh_CN.UTF-8`, `ja-JP`, `de` → its interface language; anything else is English.
export function uiLangOf(locale: string | undefined): UiLang {
  const base = (locale ?? '').toLowerCase().split(/[-_.@]/)[0] ?? ''

  return UI_LANGS.find(lang => lang.value === base)?.value ?? 'en'
}
