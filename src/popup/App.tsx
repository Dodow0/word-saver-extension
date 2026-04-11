import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import type { WordEntry } from '@/word'

// ─── 顶部导航标签 ─────────────────────────────────────────────────────────────

type Tab = 'wordsaver' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('wordsaver')

  return (
    <div className="flex flex-col w-full h-full bg-[#1e1e2e] text-[#cdd6f4]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <span className="text-[#cba6f7] text-lg font-bold tracking-wide">Wordsaver</span>
          <span className="text-[#45475a] text-xs">单词本助手</span>
        </div>
        <nav className="flex gap-1">
          {(['wordsaver', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === t
                  ? 'bg-[#cba6f7] text-[#1e1e2e]'
                  : 'text-[#a6adc8] hover:text-[#cdd6f4]'
              }`}
            >
              {t === 'wordsaver' ? '单词本' : '设置'}
            </button>
          ))}
        </nav>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-hidden">
        {tab === 'wordsaver' ? <WordsaverTab /> : <SettingsTab />}
      </main>
    </div>
  )
}

// ─── 单词本主面板 ─────────────────────────────────────────────────────────────

function WordsaverTab() {
  const [words, setWords] = useState<WordEntry[]>([])
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // 从 storage 加载单词本
  useEffect(() => {
    chrome.storage.local.get('wordsaver', ({ wordsaver }) => {
      setWords(wordsaver ?? [])
    })
    // 监听 storage 变化（比如 content script 新增了单词）
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.wordsaver) setWords(changes.wordsaver.newValue ?? [])
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  const filtered = words.filter(w =>
    w.word.toLowerCase().includes(query.toLowerCase()) ||
    w.definitions.some(d => d.meaning.toLowerCase().includes(query.toLowerCase()))
  )

  function deleteWord(id: string) {
    chrome.runtime.sendMessage({ type: 'DELETE_WORD', id })
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  // ── 导出 Excel ──────────────────────────────────────────────────────────────
  function exportExcel() {
    if (!words.length) return showToast('单词本是空的')

    const rows = words.map(w => ({
      单词: w.word,
      音标: w.phonetic ?? '',
      词性与释义: w.definitions.map(d => `[${d.partOfSpeech}] ${d.meaning}`).join(' | '),
      例句: w.examples.join(' | '),
      中文翻译: w.translation ?? '',
      标签: w.tags.join(', '),
      添加时间: new Date(w.addedAt).toLocaleString('zh-CN'),
      来源页面: w.source ?? '',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)

    // 设置列宽
    ws['!cols'] = [
      { wch: 16 }, { wch: 12 }, { wch: 40 },
      { wch: 40 }, { wch: 20 }, { wch: 12 },
      { wch: 20 }, { wch: 30 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '我的单词本')
    XLSX.writeFile(wb, `Wordsaver_${formatDate()}.xlsx`)
    showToast('已导出 Excel ✓')
  }

  // ── 导出 TXT ────────────────────────────────────────────────────────────────
  function exportTxt() {
    if (!words.length) return showToast('单词本是空的')

    const lines = words.map(w => {
      const defs = w.definitions.map(d => `  [${d.partOfSpeech}] ${d.meaning}`).join('\n')
      const examples = w.examples.map(e => `  > ${e}`).join('\n')
      return [
        `━━ ${w.word} ${w.phonetic ?? ''} ━━`,
        defs,
        examples,
        w.translation ? `  译：${w.translation}` : '',
      ].filter(Boolean).join('\n')
    })

    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Wordsaver_${formatDate()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出 TXT ✓')
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 + 导出按钮 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#313244]">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索单词或释义…"
          className="flex-1 bg-[#313244] text-[#cdd6f4] placeholder-[#585b70] text-sm
                     rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#cba6f7]"
        />
        <button
          onClick={exportExcel}
          title="导出 Excel"
          className="px-2.5 py-1.5 bg-[#a6e3a1] text-[#1e1e2e] rounded-lg text-xs font-bold
                     hover:opacity-80 transition-opacity"
        >
          XLS
        </button>
        <button
          onClick={exportTxt}
          title="导出 TXT"
          className="px-2.5 py-1.5 bg-[#89b4fa] text-[#1e1e2e] rounded-lg text-xs font-bold
                     hover:opacity-80 transition-opacity"
        >
          TXT
        </button>
      </div>

      {/* 统计行 */}
      <div className="px-4 py-1.5 text-[11px] text-[#585b70]">
        共 {words.length} 个单词
        {query && ` · 匹配 ${filtered.length} 个`}
      </div>

      {/* 单词列表 */}
      <ul className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {filtered.length === 0 && (
          <li className="text-center text-[#585b70] text-sm py-12">
            {query ? '没有匹配的单词' : '单词本还是空的，去网页上选词吧 ✦'}
          </li>
        )}
        {filtered.map(word => (
          <WordCard
            key={word.id}
            word={word}
            expanded={expanded === word.id}
            onToggle={() => setExpanded(expanded === word.id ? null : word.id)}
            onDelete={() => deleteWord(word.id)}
          />
        ))}
      </ul>

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#cba6f7] text-[#1e1e2e]
                        text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── 单个单词卡片 ─────────────────────────────────────────────────────────────

interface WordCardProps {
  word: WordEntry
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}

function WordCard({ word, expanded, onToggle, onDelete }: WordCardProps) {
  return (
    <li className="rounded-xl border border-[#313244] hover:border-[#45475a] transition-colors">
      {/* 折叠头部 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[#cba6f7] font-semibold text-[15px]">{word.word}</span>
          {word.phonetic && (
            <span className="text-[#a6e3a1] text-[11px]">{word.phonetic}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#45475a] text-[11px]">
            {word.definitions[0]?.partOfSpeech}
          </span>
          <span className="text-[#585b70] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-[#313244]">
          {/* 释义 */}
          <ul className="mt-2 space-y-1">
            {word.definitions.slice(0, 3).map((d, i) => (
              <li key={i} className="text-sm text-[#cdd6f4]">
                <span className="text-[#89b4fa] text-xs mr-1">[{d.partOfSpeech}]</span>
                {d.meaning}
              </li>
            ))}
          </ul>

          {/* 例句 */}
          {word.examples[0] && (
            <p className="text-xs text-[#a6adc8] italic border-l-2 border-[#45475a] pl-2">
              {word.examples[0]}
            </p>
          )}

          {/* 中文翻译 */}
          {word.translation && (
            <p className="text-xs text-[#f9e2af]">译：{word.translation}</p>
          )}

          {/* 底部操作行 */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-[#45475a]">
              {new Date(word.addedAt).toLocaleDateString('zh-CN')}
            </span>
            <button
              onClick={onDelete}
              className="text-[#f38ba8] text-xs hover:underline"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// ─── 设置页（简版，完整版在 options 页） ──────────────────────────────────────

function SettingsTab() {
  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="px-4 py-6 space-y-4">
      <p className="text-sm text-[#a6adc8]">
        在设置页中配置词典 API、翻译接口和触发方式。
      </p>
      <button
        onClick={openOptions}
        className="w-full py-2 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm
                   hover:bg-[#45475a] transition-colors"
      >
        打开完整设置页 →
      </button>
    </div>
  )
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatDate() {
  return new Date().toISOString().slice(0, 10)
}
