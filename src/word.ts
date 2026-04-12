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

export interface LookupWordMessage    { type: 'LOOKUP_WORD';    word: string }
export interface LookupWordResult     { type: 'LOOKUP_WORD_RESULT'; success: boolean; data?: WordEntry; error?: string }
export interface CheckWordMessage     { type: 'CHECK_WORD';     word: string }
export interface AddWordMessage       { type: 'ADD_WORD';       word: WordEntry }
export interface AddWordResult        { type: 'ADD_WORD_RESULT'; success: boolean; error?: string }
export interface GetWordsaverMessage  { type: 'GET_WORDSAVER';  tag?: string }
export interface GetWordsaverResult   { type: 'GET_WORDSAVER_RESULT'; words: WordEntry[]; allTags: string[] }
export interface DeleteWordMessage    { type: 'DELETE_WORD';    id: string }
export interface DeleteWordResult     { type: 'DELETE_WORD_RESULT'; success: boolean }
export interface UpdateTagsMessage    { type: 'UPDATE_TAGS';    id: number; tags: string[] }
 
// 词典管理消息
export interface InitDictMessage      { type: 'INIT_DICT';      name: string; format: 'txt'|'csv'|'tsv'|'json'; entryCount: number }
export interface InitDictResult       { success: boolean; dictId?: number; error?: string }
export interface WriteDictEntriesMessage {
  type: 'WRITE_DICT_ENTRIES'
  dictId: number
  entries: Array<{ word: string; definition: string; example?: string }>
}
export interface GetDictsMessage      { type: 'GET_DICTS' }
export interface ToggleDictMessage    { type: 'TOGGLE_DICT';    id: number; active: boolean }
export interface DeleteDictMessage    { type: 'DELETE_DICT';    id: number }

// 联合类型：所有可能的消息
export type ExtensionMessage =
  | LookupWordMessage
  | LookupWordResult
  | CheckWordMessage
  | AddWordMessage
  | AddWordResult
  | GetWordsaverMessage
  | GetWordsaverResult
  | DeleteWordMessage
  | DeleteWordResult
  | UpdateTagsMessage
  | InitDictMessage
  | WriteDictEntriesMessage
  | GetDictsMessage
  | ToggleDictMessage
  | DeleteDictMessage

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
  autoTranslate: boolean
  showPhonetic: boolean
  popupTrigger: 'select' | 'doubleclick'  // 触发方式
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiProvider: 'free-dictionary',
  autoTranslate: true,
  showPhonetic: true,
  popupTrigger: 'select'
}
