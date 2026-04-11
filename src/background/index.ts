// background/index.ts
// Service Worker —— 插件的"后台服务器"
// 职责：处理 API 请求、管理 storage、响应消息

import type {
  ExtensionMessage,
  LookupWordMessage,
  AddWordMessage,
  GetWordsaverMessage,
  DeleteWordMessage,
  WordEntry,
} from '@/word'

// ─── 监听来自 Content Script / Popup 的消息 ───────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    // 必须 return true，告知浏览器这是异步响应，保持通道开放
    switch (message.type) {
      case 'LOOKUP_WORD':
        handleLookup(message as LookupWordMessage).then(sendResponse)
        return true

      case 'ADD_WORD':
        handleAddWord(message as AddWordMessage).then(sendResponse)
        return true

      case 'GET_WORDSAVER':
        handleGetWordsaver().then(sendResponse)
        return true

      case 'DELETE_WORD':
        handleDeleteWord(message as DeleteWordMessage).then(sendResponse)
        return true
    }
  }
)

// ─── 右键菜单：选中文字后右键"查询单词" ──────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lookup-word',
    title: '查询「%s」',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'lookup-word' && info.selectionText) {
    // 发消息给当前 tab 的 content script
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

// ─── 业务逻辑函数 ─────────────────────────────────────────────────────────────

async function handleLookup(msg: LookupWordMessage) {
  try {
  // 【新增代码】获取设置
    const storageData = await chrome.storage.local.get('settings');
    // 给个兜底默认值
    const settings = storageData.settings || { apiProvider: 'free-dictionary' };

    let entry;

    // 【新增代码】根据用户的选择，走不同的逻辑
    if (settings.apiProvider === 'youdao') {
      // 这里应该写你调用有道 API 的逻辑
      // 例如：entry = await fetchYoudaoAPI(msg.word, settings.youdaoAppKey);
      console.log('用户选择了有道词典，AppKey是：', settings.youdaoAppKey);
      
      // 暂时如果没写好有道，就用免费的顶替一下，防止报错
      entry = await fetchDefinition(msg.word);
    } 
    else if (settings.apiProvider === 'deepl') {
      console.log('用户选择了DeepL，API Key是：', settings.deeplApiKey);
      entry = await fetchDefinition(msg.word);
    } 
    else {
      // 默认的 free-dictionary
      entry = await fetchDefinition(msg.word)
    }
    return { type: 'LOOKUP_WORD_RESULT', success: true, data: entry }
  } catch (err) {
    return { type: 'LOOKUP_WORD_RESULT', success: false, error: String(err) }
  }
}

async function handleAddWord(msg: AddWordMessage) {
  try {
    const { wordsaver = [] } = await chrome.storage.local.get('wordsaver')
    const exists = wordsaver.some((w: WordEntry) => w.word === msg.word.word)
    if (!exists) {
      wordsaver.unshift(msg.word) // 最新的排最前
      await chrome.storage.local.set({ wordsaver })
    }
    return { type: 'ADD_WORD_RESULT', success: true }
  } catch (err) {
    return { type: 'ADD_WORD_RESULT', success: false, error: String(err) }
  }
}

async function handleGetWordsaver(): Promise<object> {
  const { wordsaver = [] } = await chrome.storage.local.get('wordsaver')
  return { type: 'GET_WORDSAVER_RESULT', words: wordsaver }
}

async function handleDeleteWord(msg: DeleteWordMessage) {
  const { wordsaver = [] } = await chrome.storage.local.get('wordsaver')
  const updated = wordsaver.filter((w: WordEntry) => w.id !== msg.id)
  await chrome.storage.local.set({ wordsaver: updated })
  return { type: 'DELETE_WORD_RESULT', success: true }
}

// ─── 词典 API 调用（Free Dictionary API） ────────────────────────────────────

async function fetchDefinition(word: string): Promise<WordEntry> {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  )
  if (!res.ok) throw new Error(`API error: ${res.status}`)

  const json = await res.json()
  const entry = json[0]

  const definitions = entry.meanings.flatMap((m: any) =>
    m.definitions.slice(0, 2).map((d: any) => ({
      partOfSpeech: m.partOfSpeech,
      meaning: d.definition,
    }))
  )

  const examples = entry.meanings
    .flatMap((m: any) => m.definitions.map((d: any) => d.example))
    .filter(Boolean)
    .slice(0, 3)

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    word: entry.word,
    phonetic: entry.phonetic ?? entry.phonetics?.[0]?.text,
    definitions,
    examples,
    translation: '',   // 翻译 API 后续集成
    tags: [],
    addedAt: Date.now(),
    reviewCount: 0,
    source: '',
  }
}
