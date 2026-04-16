// background/index.ts
// Service Worker —— 插件的"后台服务器"

import { db, lookupInDictionaries } from '@/db'
import { parseDict } from '@/dictParser'
import type {
  ExtensionMessage,
  LookupWordMessage,
  AddWordMessage,
  GetWordsaverMessage,
  DeleteWordMessage,
  AppSettings,
} from '@/word'
import type { SavedWord } from '@/db'

// ─── 消息路由 ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
   (message: any, _sender, sendResponse) => {
    const safe = (p: Promise<unknown>) =>
      p.then(sendResponse).catch(err =>
        sendResponse({ success: false, error: String(err) })
      )
 
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
      case 'INIT_DICT':           // 创建词典元数据，返回 dictId
        safe(handleInitDict(message as any))
        return true
      case 'WRITE_DICT_ENTRIES':  // 分批写入词条
        safe(handleWriteDictEntries(message as any))
        return true
      case 'GET_DICTS':
        safe(handleGetDicts())
        return true
      case 'TOGGLE_DICT':
        safe(handleToggleDict((message as any).id, (message as any).active))
        return true
      case 'DELETE_DICT':
        safe(handleDeleteDict(message.id))
        return true
      case 'WEBDAV_BACKUP':
        safe(handleWebdavBackup())
        return true
      case 'WEBDAV_RESTORE':
        safe(handleWebdavRestore())
        return true
 
      default:
        // 未知消息类型：立即回复，防止 sendMessage 对端永远等待
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` })
        return false
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
// 拆成两步：INIT_DICT 创建元数据 → WRITE_DICT_ENTRIES 分批写词条
// 避免把整个文件内容塞进一条消息（Chrome 限制 64MB）
 
async function handleInitDict(msg: {
  name: string
  format: 'txt' | 'csv' | 'tsv' | 'json'
  entryCount: number
}) {
  try {
    const dictId = await db.dictionaries.add({
      name: msg.name,
      format: msg.format,
      entryCount: msg.entryCount,
      uploadedAt: Date.now(),
      active: true,
    }) as number
    return { success: true, dictId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
 
async function handleWriteDictEntries(msg: {
  dictId: number
  entries: Array<{ word: string; definition: string; example?: string }>
}) {
  try {
    const rows = msg.entries.map(e => ({ ...e, dictId: msg.dictId }))
    await db.dictEntries.bulkAdd(rows)
    return { success: true }
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
 
// 修改 handleDeleteDict 函数
async function handleDeleteDict(id: number) {
  try {
    // 1. 先把词典状态设为“正在删除”或直接从列表中隐藏，防止用户重复操作
    // 这里我们先直接删除词典元数据，这样前端刷新后它就不会再出现了
    await db.dictionaries.delete(id);

    // 2. 开始分批删除词条，避免事务过载
    const CHUNK_SIZE = 10000;
    let deletedCount = 0;
    
    while (true) {
      // 每次只找 10000 个对应的词条 ID
      const keys = await db.dictEntries
        .where('dictId').equals(id)
        .limit(CHUNK_SIZE)
        .primaryKeys();

      if (keys.length === 0) break;

      // 执行这一小块的删除
      await db.dictEntries.bulkDelete(keys);
      deletedCount += keys.length;
      console.log(`[Wordsaver] 正在清理词典 ${id}: 已删除 ${deletedCount} 条...`);
      
      // 给事件循环一个空档，防止阻塞查询请求
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return { success: true };
  } catch (err) {
    console.error("删除词典失败:", err);
    return { success: false, error: String(err) };
  }
}

type SyncPayload = {
  version: 1
  exportedAt: number
  savedWords: SavedWord[]
}

// 修改 handleWebdavBackup 变身真正的“双向增量同步”
async function handleWebdavBackup() {
  const settings = await getSettingsWithDefaults()
  const targetUrl = buildWebdavFileUrl(settings)
  const auth = basicAuthHeader(settings.webdavUsername, settings.webdavPassword)

  // === 第一步：先尝试获取远程文件（Pull） ===
  try {
    const getRes = await fetch(targetUrl, {
      method: 'GET',
      headers: { Authorization: auth },
    })
    
    if (getRes.ok) {
      // 如果远程有文件，先解析并增量合并到本地数据库（Merge）
      const remotePayload = await getRes.json() as SyncPayload
      validateSyncPayload(remotePayload)
      await mergeSyncPayload(remotePayload) // 这里会执行 Tags 的合并和新词的追加
      console.log('[WebDAV Sync] 成功将远程增量数据合并至本地')
    } else if (getRes.status !== 404) {
      // 404 说明远程还没有文件（首次备份），属于正常情况。
      console.warn(`[WebDAV Sync] 获取远程文件失败: ${getRes.status}, 将执行首次覆盖`)
    }
  } catch (err) {
    console.warn('[WebDAV Sync] 远程文件不存在或网络异常，作为首次备份处理', err)
  }

  // === 第二步：从本地数据库读取合并后的最全数据 ===
  // 此时本地数据库已经融合了多台电脑的增量数据
  const savedWords = await db.savedWords.toArray()
  const payload: SyncPayload = {
    version: 1,
    exportedAt: Date.now(),
    savedWords: savedWords.map(({ id: _id, ...rest }) => rest), // 剔除本地自增ID
  }

  // === 第三步：将最全数据推送到远程（Push） ===
  const putRes = await fetch(targetUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: auth,
    },
    body: JSON.stringify(payload, null, 2),
  })

  if (!putRes.ok) {
    throw new Error(`WebDAV 上传失败: ${putRes.status} ${putRes.statusText}`)
  }

  return {
    success: true,
    exportedAt: payload.exportedAt,
    summary: {
      savedWords: payload.savedWords.length,
    },
  }
}

async function handleWebdavRestore() {
  const settings = await getSettingsWithDefaults()
  const targetUrl = buildWebdavFileUrl(settings)
  const auth = basicAuthHeader(settings.webdavUsername, settings.webdavPassword)
  const res = await fetch(targetUrl, {
    method: 'GET',
    headers: { Authorization: auth },
  })

  if (!res.ok) {
    throw new Error(`WebDAV 下载失败: ${res.status} ${res.statusText}`)
  }

  const payload = await res.json() as SyncPayload
  validateSyncPayload(payload)
  const result = await mergeSyncPayload(payload)
  return { success: true, ...result }
}

async function getSettingsWithDefaults(): Promise<AppSettings> {
  const { settings } = await chrome.storage.local.get('settings')
  const merged = {
    apiProvider: 'free-dictionary',
    autoTranslate: true,
    showPhonetic: true,
    defaultTag: '',
    popupTrigger: 'select',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    webdavFilePath: '/wordsaver-backup.json',
    ...(settings ?? {}),
  } as AppSettings

  if (!merged.webdavUrl || !merged.webdavUsername) {
    throw new Error('请先在设置页填写 WebDAV 地址与用户名')
  }
  return merged
}

function buildWebdavFileUrl(settings: AppSettings): string {
  const base = settings.webdavUrl.trim().replace(/\/+$/, '')
  const filePath = settings.webdavFilePath.trim() || '/wordsaver-backup.json'
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
  return `${base}${normalizedPath}`
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function validateSyncPayload(payload: SyncPayload) {
  if (!payload || payload.version !== 1) {
    throw new Error('不支持的备份格式版本')
  }
  if (!Array.isArray(payload.savedWords)) {
    throw new Error('备份文件结构不完整')
  }
}

async function mergeSyncPayload(payload: SyncPayload) {
  const localWords = await db.savedWords.toArray()
  const wordToLocal = new Map(localWords.map(w => [w.word.toLowerCase(), w] as const))
  let mergedWords = 0
  let addedWords = 0

  for (const incoming of payload.savedWords) {
    const key = incoming.word.toLowerCase()
    const existed = wordToLocal.get(key)
    if (existed?.id !== undefined) {
      const mergedTags = Array.from(new Set([...(existed.tags ?? []), ...(incoming.tags ?? [])]))
      const next = (incoming.addedAt ?? 0) >= (existed.addedAt ?? 0) ? incoming : existed
      await db.savedWords.update(existed.id, {
        ...next,
        tags: mergedTags,
        reviewCount: Math.max(existed.reviewCount ?? 0, incoming.reviewCount ?? 0),
      })
      mergedWords += 1
    } else {
      await db.savedWords.add({
        ...incoming,
        tags: incoming.tags ?? [],
        definitions: incoming.definitions ?? [],
        examples: incoming.examples ?? [],
        addedAt: incoming.addedAt ?? Date.now(),
        reviewCount: incoming.reviewCount ?? 0,
      })
      addedWords += 1
    }
  }

  return {
    importedAt: Date.now(),
    summary: {
      savedWordsAdded: addedWords,
      savedWordsMerged: mergedWords,
    },
  }
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
    translation: local.translation || undefined,
    examples: local.example ? [local.example] : [],
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
