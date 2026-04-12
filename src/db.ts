// src/db.ts
// 统一的 IndexedDB 数据库，通过 Dexie.js 管理

import Dexie, { type Table } from 'dexie'

// ─── 表类型定义 ────────────────────────────────────────────────────────────────

/** 用户自定义词典（一个文件 = 一条记录，词条展开存在 DictEntry 表） */
export interface Dictionary {
  id?: number          // 自增主键
  name: string         // 词典名称，如 "GRE词汇.csv"
  format: 'txt' | 'csv' | 'tsv' | 'json'
  entryCount: number   // 词条数量（展示用）
  uploadedAt: number   // 上传时间戳
  active: boolean      // 是否为当前启用词典（可多选）
}

/** 词典中的单个词条（拍平存储，查询快） */
export interface DictEntry {
  id?: number
  dictId: number
  word: string
  definition: string   // 英文释义
  translation?: string // 中文翻译（新增）
  example?: string
}

/** 用户单词本中的单词 */
export interface SavedWord {
  id?: number
  word: string
  phonetic?: string
  definitions: Array<{ partOfSpeech: string; meaning: string }>
  examples: string[]
  translation?: string
  tags: string[]       // ← Tag 系统核心字段
  addedAt: number
  source?: string      // 来源 URL
  reviewCount: number
}

// ─── 数据库类 ──────────────────────────────────────────────────────────────────

class WordsaverDB extends Dexie {
  dictionaries!: Table<Dictionary>
  dictEntries!: Table<DictEntry>
  savedWords!: Table<SavedWord>

  constructor() {
    super('WordsaverDB')

    this.version(1).stores({
      // 只需要声明需要查询/排序的字段作为索引
      dictionaries: '++id, name, uploadedAt, active',
      dictEntries:  '++id, dictId, word, word_lower',   // word 建索引，用于选词时快速匹配
      savedWords:   '++id, word, addedAt, *tags',  // *tags = 多值索引，支持按单个 tag 查询
    })
  }
}

export const db = new WordsaverDB()

// ─── 便捷查询函数 ──────────────────────────────────────────────────────────────

/** 在所有启用的词典中查找一个单词，返回第一个匹配 */
// 修改 src/db.ts 中的查询函数
export async function lookupInDictionaries(word: string) {
  try {
    // 修复：用 toArray + filter 替代布尔值索引 
    const allDicts = await db.dictionaries.toArray()
    const activeDicts = allDicts.filter(d => d.active === true)
    if (!activeDicts.length) return null

    const activeIds = activeDicts.map(d => d.id!)

    // 优化查询逻辑：先通过索引找到单词，再在内存中过滤 dictId，减少数据库负载
    const entries = await db.dictEntries
      .where('word')
      .equals(word.toLowerCase())
      .toArray()

    return entries.find(e => activeIds.includes(e.dictId)) ?? null
  } catch (e) {
    console.error("本地词典查询异常（可能数据库繁忙）:", e)
    // 发生异常时直接返回 null，让 background.ts 走在线 API 流程，防止转圈
    return null 
  }
}

/** 按 tag 过滤单词本，tag 为空则返回全部 */
export async function getWordsByTag(tag?: string): Promise<SavedWord[]> {
  if (!tag) return db.savedWords.orderBy('addedAt').reverse().toArray()
  return db.savedWords.where('tags').equals(tag).sortBy('addedAt')
}

/** 获取单词本中所有已使用的 tags（去重） */
export async function getAllTags(): Promise<string[]> {
  const words = await db.savedWords.toArray()
  const tagSet = new Set(words.flatMap(w => w.tags))
  return Array.from(tagSet).sort()
}