// ─── 单词条目 ─────────────────────────────────────────────────────────────────

export interface WordEntry {
  id: string              // 唯一 ID，用时间戳生成
  word: string            // 原词，如 "ephemeral"
  phonetic?: string       // 音标，如 "/ɪˈfɛm.ər.əl/"
  definitions: Definition[]
  examples: string[]      // 例句列表
  translation?: string    // 中文翻译（来自翻译 API）
  tags: string[]          // 用户自定义标签
  addedAt: number         // 添加时间戳（ms）
  reviewCount: number     // 复习次数
  source?: string         // 来源页面 URL
}

export interface Definition {
  partOfSpeech: string    // 词性，如 "adjective"
  meaning: string         // 英文释义
}

// ─── 消息类型（Content ↔ Background 通信协议）────────────────────────────────

export type MessageType =
  | 'LOOKUP_WORD'
  | 'LOOKUP_WORD_RESULT'
  | 'ADD_WORD'
  | 'ADD_WORD_RESULT'
  | 'GET_WORDSAVER'
  | 'GET_WORDSAVER_RESULT'
  | 'DELETE_WORD'
  | 'DELETE_WORD_RESULT'

export interface LookupWordMessage {
  type: 'LOOKUP_WORD'
  word: string
}

export interface LookupWordResult {
  type: 'LOOKUP_WORD_RESULT'
  success: boolean
  data?: WordEntry
  error?: string
}

export interface AddWordMessage {
  type: 'ADD_WORD'
  word: WordEntry
}

export interface AddWordResult {
  type: 'ADD_WORD_RESULT'
  success: boolean
  error?: string
}

export interface GetWordsaverMessage {
  type: 'GET_WORDSAVER'
}

export interface GetWordsaverResult {
  type: 'GET_WORDSAVER_RESULT'
  words: WordEntry[]
}

export interface DeleteWordMessage {
  type: 'DELETE_WORD'
  id: string
}

export interface DeleteWordResult {
  type: 'DELETE_WORD_RESULT'
  success: boolean
}

export type ExtensionMessage =
  | LookupWordMessage
  | LookupWordResult
  | AddWordMessage
  | AddWordResult
  | GetWordsaverMessage
  | GetWordsaverResult
  | DeleteWordMessage
  | DeleteWordResult

// ─── 存储结构 ─────────────────────────────────────────────────────────────────

export interface StorageSchema {
  wordsaver: WordEntry[]     // 单词本列表
  settings: AppSettings     // 用户设置
}

export interface AppSettings {
  apiProvider: 'free-dictionary' | 'youdao' | 'deepl'
  youdaoAppKey?: string
  youdaoAppSecret?: string
  deeplApiKey?: string
  autoTranslate: boolean     // 是否自动翻译
  showPhonetic: boolean      // 是否显示音标
  popupTrigger: 'select' | 'doubleclick'  // 触发方式
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiProvider: 'free-dictionary',
  autoTranslate: true,
  showPhonetic: true,
  popupTrigger: 'select'
}
