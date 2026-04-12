// background/index.ts
// Service Worker —— 插件的"后台服务器"

import { db, lookupInDictionaries } from '@/db'

console.log("DB loaded:", db)
// 挂到全局，供调试用
;(self as any).db = db
;(self as any).lookup = lookupInDictionaries
import { parseDict } from '@/dictParser'
import type {
  ExtensionMessage,
  LookupWordMessage,
  AddWordMessage,
  GetWordsaverMessage,
  DeleteWordMessage,
} from '@/word'
import type { SavedWord } from '@/db'

// ─── 消息路由 ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    // safe：无论 handler 内部是否抛异常，都保证调用 sendResponse
    // 否则 content script 的 sendMessage 会永远挂起
    const safe = (p: Promise<unknown>) =>
  p.then(res => {
    console.log("✅ handleLookup返回:", res)
    sendResponse(res)
  }).catch(err => {
    console.error("❌ handleLookup报错:", err)
    sendResponse({ success: false, error: String(err) })
  })
 
    switch (message.type) {
      case 'LOOKUP_WORD':
        safe(handleLookup(message as LookupWordMessage))
        return true
 
      case 'ADD_WORD':
        safe(handleAddWord(message as AddWordMessage))
        return true
 
      // 添加前先查重，content script 用来决定按钮状态
      case 'CHECK_WORD':
        safe(handleCheckWord((message as any).word))
        return true
 
      case 'GET_WORDSAVER':
        safe(handleGetWordsaver(message as GetWordsaverMessage))
        return true
 
      case 'DELETE_WORD':
        safe(handleDeleteWord(message as DeleteWordMessage))
        return true
 
      // Tag 更新
      case 'UPDATE_TAGS':
        safe(handleUpdateTags((message as any).id, (message as any).tags))
        return true
 
      // 词典管理
      case 'UPLOAD_DICT':
        safe(handleUploadDict(message as any))
        return true
      case 'GET_DICTS':
        safe(handleGetDicts())
        return true
      case 'TOGGLE_DICT':
        safe(handleToggleDict((message as any).id, (message as any).active))
        return true
      case 'DELETE_DICT':
        safe(handleDeleteDict((message as any).id))
        return true
    }
  }
)

// ─── 右键菜单 ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lookup-word',
    title: '查询「%s」',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'lookup-word' && info.selectionText) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'LOOKUP_WORD',
          word: info.selectionText!.trim(),
        })
      }
    })
  }
})

// ─── 查词（本地词典优先，未命中再走在线 API）─────────────────────────────────

async function handleLookup(msg: LookupWordMessage) {
  try {
    // 第一步：查本地词典（Dexie），任何 apiProvider 都先走这里
    const local = await lookupInDictionaries(msg.word)
    if (local) {
      return {
        type: 'LOOKUP_WORD_RESULT',
        success: true,
        source: 'local',
        data: buildFromLocal(msg.word, local),
      }
    }

    // 第二步：本地未命中，读用户设置决定走哪个在线 API
    // settings 仍然存在 chrome.storage（数据量小，适合存这里）
    const { settings = { apiProvider: 'free-dictionary' } } =
      await chrome.storage.local.get('settings')

    let entry: SavedWord

    if (settings.apiProvider === 'youdao') {
      // TODO: 替换为真实有道调用
      // entry = await fetchYoudao(msg.word, settings.youdaoAppKey, settings.youdaoAppSecret)
      console.log('[WordBook] 有道 AppKey:', settings.youdaoAppKey)
      entry = await fetchFreeDict(msg.word)   // 暂时降级到免费 API
    } else if (settings.apiProvider === 'deepl') {
      // TODO: 替换为真实 DeepL 调用
      // entry = await fetchDeepl(msg.word, settings.deeplApiKey)
      console.log('[WordBook] DeepL API Key:', settings.deeplApiKey)
      entry = await fetchFreeDict(msg.word)
    } else {
      entry = await fetchFreeDict(msg.word)
    }

    return { type: 'LOOKUP_WORD_RESULT', success: true, source: 'remote', data: entry }
  } catch (err) {
    return { type: 'LOOKUP_WORD_RESULT', success: false, error: String(err) }
  }
}

// ─── 查重：单词是否已在 Dexie 单词本中 ───────────────────────────────────────

async function handleCheckWord(word: string) {
  // equalsIgnoreCase 保证大小写不敏感，"Ephemeral" 能匹配已存的 "ephemeral"
  const exists = await db.savedWords.where('word').equalsIgnoreCase(word).first()
  return { exists: !!exists }
}

// ─── 单词本 CRUD ───────────────────────────────────────────────────────────────

async function handleAddWord(msg: AddWordMessage) {
  try {
    const exists = await db.savedWords
      .where('word').equalsIgnoreCase(msg.word.word)
      .first()
    if (!exists) {
      await db.savedWords.add(msg.word as unknown as SavedWord)
    }
    return { type: 'ADD_WORD_RESULT', success: true }
  } catch (err) {
    return { type: 'ADD_WORD_RESULT', success: false, error: String(err) }
  }
}

async function handleGetWordsaver(msg: GetWordsaverMessage) {
  const tag = (msg as any).tag as string | undefined
  const words = tag
    ? await db.savedWords.where('tags').equals(tag).sortBy('addedAt')
    : await db.savedWords.orderBy('addedAt').reverse().toArray()

  const allWords = await db.savedWords.toArray()
  const allTags = Array.from(new Set(allWords.flatMap(w => w.tags))).sort()

  return { type: 'GET_WORDSAVER_RESULT', words, allTags }
}

async function handleDeleteWord(msg: DeleteWordMessage) {
  await db.savedWords.delete(msg.id as unknown as number)
  return { type: 'DELETE_WORD_RESULT', success: true }
}

async function handleUpdateTags(id: number, tags: string[]) {
  await db.savedWords.update(id, { tags })
  return { success: true }
}

// ─── 词典管理 ──────────────────────────────────────────────────────────────────

async function handleUploadDict(msg: {
  name: string
  format: 'txt' | 'csv' | 'tsv'
  content: string
}) {
  try {
    const { entries, warnings } = parseDict(msg.content, msg.format)
    if (!entries.length) return { success: false, error: '未解析到有效词条' }

    const dictId = await db.transaction('rw', db.dictionaries, db.dictEntries, async () => {
      const id = await db.dictionaries.add({
        name: msg.name,
        format: msg.format,
        entryCount: entries.length,
        uploadedAt: Date.now(),
        active: true,
      })
      await db.dictEntries.bulkAdd(
        entries.map(e => ({
          ...e,
          word: e.word.trim(),
          word_lower: e.word.trim().toLowerCase(),
          dictId: id as number
      }))
)
      return id
    })

    return { success: true, dictId, entryCount: entries.length, warnings }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function handleGetDicts() {
  return { dicts: await db.dictionaries.orderBy('uploadedAt').reverse().toArray() }
}

async function handleToggleDict(id: number, active: boolean) {
  await db.dictionaries.update(id, { active })
  return { success: true }
}

async function handleDeleteDict(id: number) {
  await db.transaction('rw', db.dictionaries, db.dictEntries, async () => {
    await db.dictEntries.where('dictId').equals(id).delete()
    await db.dictionaries.delete(id)
  })
  return { success: true }
}

// ─── Free Dictionary API ───────────────────────────────────────────────────────

async function fetchFreeDict(word: string): Promise<SavedWord> {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  )
  if (!res.ok) throw new Error(`API error: ${res.status}`)

  const json = await res.json()
  const entry = json[0]

  const translation = await fetchChineseTranslation(word);

  return {
    word: entry.word,
    phonetic: entry.phonetic ?? entry.phonetics?.[0]?.text,
    definitions: entry.meanings.flatMap((m: any) =>
      m.definitions.slice(0, 2).map((d: any) => ({
        partOfSpeech: m.partOfSpeech,
        meaning: d.definition,
      }))
    ),
    examples: entry.meanings
      .flatMap((m: any) => m.definitions.map((d: any) => d.example))
      .filter(Boolean)
      .slice(0, 3),
    translation: translation,
    tags: [],
    addedAt: Date.now(),
    reviewCount: 0,
    source: '',
  }
}

// ─── 从本地词典词条构造 SavedWord ─────────────────────────────────────────────

function buildFromLocal(word: string, local: any): SavedWord {
  return {
    word,
    phonetic: undefined,
    definitions: local.definition
      ? [{ partOfSpeech: '', meaning: local.definition }]
      : [],
    examples: local.example ? [local.example] : [],
    translation: '',
    tags: [],
    addedAt: Date.now(),
    reviewCount: 0,
    source: '',
  }
}

// ─── 备用免费中文翻译 (MyMemory API - 简单直接翻译) ──────────────────────────
async function fetchMyMemoryTranslation(word: string): Promise<string> {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`)
    if (!res.ok) return ''
    const data = await res.json()
    return data.responseData?.translatedText || ''
  } catch (err) {
    console.error("MyMemory 翻译获取失败:", err)
    return '' // 两条路都失败时，只显示英文释义
  }
}

// ─── 主力免费中文翻译 (Google Translate GTX API + 超时回退机制) ──────────────
async function fetchChineseTranslation(word: string): Promise<string> {
  // 1. 设置超时控制器（3000毫秒 = 3秒）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3000)

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&dt=bd&q=${encodeURIComponent(word)}`
    
    // 2. 发起带超时控制的请求
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId) // 请求成功，清除超时定时器
    
    if (!res.ok) throw new Error(`Google API 错误: ${res.status}`)
    
    const data = await res.json()
    const directTranslation = data[0]?.[0]?.[0] || ''

    // 同时支持中英文词性映射
    const posMap: Record<string, string> = {
      // 英文词性
      noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.',
      pronoun: 'pron.', preposition: 'prep.', conjunction: 'conj.',
      interjection: 'int.', abbreviation: 'abbr.',
      // 中文词性 (Google 翻译在 tl=zh-CN 时返回的值)
      '名词': 'n.',
      '动词': 'v.',
      '及物动词': 'vt.',
      '不及物动词': 'vi.',
      '形容词': 'adj.',
      '副词': 'adv.',
      '代词': 'pron.',
      '介词': 'prep.',
      '连词': 'conj.',
      '感叹词': 'int.',
      '缩写': 'abbr.'
    }

    if (data[1] && Array.isArray(data[1])) {
      const detailedTranslations = data[1].map((item: any) => {
        const rawPos = item[0] || ''
        const pos = posMap[rawPos.toLowerCase()] || rawPos
        const meanings = Array.isArray(item[1]) ? item[1].join('，') : ''
        return pos ? `${pos} ${meanings}` : meanings
      })

      if (detailedTranslations.length > 0) {
        return detailedTranslations.join('\n')
      }
    }
    return directTranslation

  } catch (err: any) {
    clearTimeout(timeoutId) // 发生错误或超时，清除定时器
    
    // 判断是否是我们主动触发的超时
    const reason = err.name === 'AbortError' ? '请求超时' : '请求失败'
    console.warn(`Google 翻译${reason}，正在无缝切换至 MyMemory 备用线路...`, err)
    
    // 3. 核心机制：Google 失败后，立刻调用 MyMemory 兜底
    return await fetchMyMemoryTranslation(word)
  }
}