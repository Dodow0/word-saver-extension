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
  const [words, setWords] = useState<SavedWord[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [activeTag, setActiveTag] = useState<string>('')   // '' = 全部
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => { load(activeTag) }, [activeTag])
 
  async function load(tag: string) {
    const res = await chrome.runtime.sendMessage({ type: 'GET_WORDSAVER', tag: tag || undefined })
    setWords(res.words)
    setAllTags(res.allTags)
  }
 
  const filtered = words.filter(w =>
    !query || w.word.toLowerCase().includes(query.toLowerCase())
  )
 
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2200) }
 
  async function deleteWord(id: number) {
    await chrome.runtime.sendMessage({ type: 'DELETE_WORD', id })
    load(activeTag)
  }
 
  async function updateTags(id: number, tags: string[]) {
    await chrome.runtime.sendMessage({ type: 'UPDATE_TAGS', id, tags })
    load(activeTag)
  }
 
  // ── 导出（按当前 Tag 过滤的列表）────────────────────────────────────────────
  function exportExcel() {
    if (!filtered.length) return showToast('没有可导出的单词')
    const rows = filtered.map(w => ({
      单词: w.word, 音标: w.phonetic ?? '',
      释义: w.definitions.map(d => `[${d.partOfSpeech}] ${d.meaning}`).join(' | '),
      例句: w.examples.join(' | '), 翻译: w.translation ?? '',
      标签: w.tags.join(', '),
      添加时间: new Date(w.addedAt).toLocaleString('zh-CN'),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 20 }, { wch: 16 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, activeTag ? `#${activeTag}` : '全部单词')
    XLSX.writeFile(wb, `Wordsaver${activeTag ? `_${activeTag}` : ''}_${fmtDate()}.xlsx`)
    showToast('已导出 Excel ✓')
  }
 
  function exportTxt() {
    if (!filtered.length) return showToast('没有可导出的单词')
    const lines = filtered.map(w => [
      `━━ ${w.word} ${w.phonetic ?? ''} ━━`,
      ...w.definitions.map(d => `  [${d.partOfSpeech}] ${d.meaning}`),
      ...w.examples.map(e => `  > ${e}`),
      w.translation ? `  译：${w.translation}` : '',
      w.tags.length ? `  🏷 ${w.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n'))
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `Wordsaver${activeTag ? `_${activeTag}` : ''}_${fmtDate()}.txt`,
    })
    a.click(); URL.revokeObjectURL(a.href)
    showToast('已导出 TXT ✓')
  }
 
  return (
    <div className="flex flex-col h-full">
      {/* 搜索 + 导出 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#313244]">
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="搜索单词…"
          className="flex-1 bg-[#313244] text-[#cdd6f4] placeholder-[#585b70] text-sm
                     rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#cba6f7]" />
        <button onClick={exportExcel}
          className="px-2.5 py-1.5 bg-[#a6e3a1] text-[#1e1e2e] rounded-lg text-xs font-bold hover:opacity-80">
          XLS
        </button>
        <button onClick={exportTxt}
          className="px-2.5 py-1.5 bg-[#89b4fa] text-[#1e1e2e] rounded-lg text-xs font-bold hover:opacity-80">
          TXT
        </button>
      </div>
 
      {/* Tag 过滤栏 */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b border-[#313244] flex-shrink-0">
          <TagPill label="全部" active={activeTag === ''} onClick={() => setActiveTag('')} />
          {allTags.map(t => (
            <TagPill key={t} label={`#${t}`} active={activeTag === t} onClick={() => setActiveTag(t)} />
          ))}
        </div>
      )}
 
      {/* 统计行 */}
      <div className="px-4 py-1.5 text-[11px] text-[#585b70]">
        {activeTag ? `#${activeTag} · ` : ''}{filtered.length} 个单词
      </div>
 
      {/* 单词列表 */}
      <ul className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {filtered.length === 0 && (
          <li className="text-center text-[#585b70] text-sm py-12">
            {query ? '没有匹配的单词' : '单词本还是空的 ✦'}
          </li>
        )}
        {filtered.map(word => (
          <WordCard key={word.id} word={word}
            expanded={expanded === word.id}
            onToggle={() => setExpanded(expanded === word.id ? null : word.id!)}
            onDelete={() => deleteWord(word.id!)}
            onUpdateTags={tags => updateTags(word.id!, tags)}
            allTags={allTags}
          />
        ))}
      </ul>
 
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#cba6f7] text-[#1e1e2e]
                        text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
 
// ─── Tag 胶囊 ──────────────────────────────────────────────────────────────────
 
function TagPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-[#cba6f7] text-[#1e1e2e]' : 'bg-[#313244] text-[#a6adc8] hover:bg-[#45475a]'
      }`}>
      {label}
    </button>
  )
}
 
// ─── 单词卡片（含内联 Tag 编辑）──────────────────────────────────────────────
 
interface WordCardProps {
  word: SavedWord; expanded: boolean
  onToggle: () => void; onDelete: () => void
  onUpdateTags: (tags: string[]) => void; allTags: string[]
}
 
function WordCard({ word, expanded, onToggle, onDelete, onUpdateTags, allTags }: WordCardProps) {
  const [tagInput, setTagInput] = useState('')
 
  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!t || word.tags.includes(t)) { setTagInput(''); return }
    onUpdateTags([...word.tags, t])
    setTagInput('')
  }
 
  function removeTag(tag: string) {
    onUpdateTags(word.tags.filter(t => t !== tag))
  }
 
  return (
    <li className="rounded-xl border border-[#313244] hover:border-[#45475a] transition-colors">
      <div
        onClick={onToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer"
      >
       <div className="flex items-center gap-2">
          <span className="text-[#cba6f7] font-semibold text-[15px]">{word.word}</span>
          
          {/* 替换为 SVG 发音按钮 */}
          <button
            onClick={e => {
              e.stopPropagation()
              speakText(word.word)
            }}
            className="flex items-center justify-center p-1 rounded-md text-[#a6adc8] transition-all duration-150 ease-in-out hover:bg-[#313244] hover:text-[#cba6f7] hover:-translate-y-[1px] active:scale-90"
            title="朗读单词"
            aria-label={`朗读 ${word.word}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </button>

          {word.phonetic && <span className="text-[#a6e3a1] text-[11px]">{word.phonetic}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {word.tags.slice(0, 2).map(t => (
            <span key={t} className="text-[10px] bg-[#313244] text-[#a6adc8] px-1.5 py-0.5 rounded-full">
              #{t}
            </span>
          ))}
          <span className="text-[#585b70] text-xs ml-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
 
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-[#313244]">
          <ul className="mt-2 space-y-1">
            {word.definitions.slice(0, 3).map((d, i) => (
              <li key={i} className="text-sm text-[#cdd6f4]">
                <span className="text-[#89b4fa] text-xs mr-1">[{d.partOfSpeech}]</span>{d.meaning}
              </li>
            ))}
          </ul>
          {word.examples[0] && (
            <p className="text-xs text-[#a6adc8] italic border-l-2 border-[#45475a] pl-2">
              {word.examples[0]}
            </p>
          )}
          {word.translation && <p className="text-xs text-[#f9e2af]"> {word.translation}</p>}
 
          {/* Tag 编辑区 */}
          <div className="pt-1 space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {word.tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-[11px] bg-[#313244]
                                         text-[#cba6f7] px-2 py-0.5 rounded-full">
                  #{t}
                  <button onClick={() => removeTag(t)} className="text-[#585b70] hover:text-[#f38ba8]">×</button>
                </span>
              ))}
            </div>
            {/* 快速添加已有 Tag */}
            {allTags.filter(t => !word.tags.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allTags.filter(t => !word.tags.includes(t)).slice(0, 6).map(t => (
                  <button key={t} onClick={() => onUpdateTags([...word.tags, t])}
                    className="text-[10px] text-[#585b70] border border-[#313244] px-1.5 py-0.5
                               rounded-full hover:border-[#cba6f7] hover:text-[#cba6f7] transition-colors">
                    +#{t}
                  </button>
                ))}
              </div>
            )}
            {/* 新 Tag 输入 */}
            <div className="flex gap-1.5">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="新建 Tag…"
                className="flex-1 bg-[#181825] text-[#cdd6f4] placeholder-[#45475a] text-xs
                           rounded-lg px-2.5 py-1 outline-none focus:ring-1 focus:ring-[#cba6f7]" />
              <button onClick={addTag}
                className="px-2.5 py-1 bg-[#313244] text-[#a6adc8] rounded-lg text-xs hover:bg-[#45475a]">
                添加
              </button>
            </div>
          </div>
 
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[10px] text-[#45475a]">
              {new Date(word.addedAt).toLocaleDateString('zh-CN')}
            </span>
            <button onClick={onDelete} className="text-[#f38ba8] text-xs hover:underline">删除</button>
          </div>
        </div>
      )}
    </li>
  )
}
 
function SettingsTab() {
  return (
    <div className="px-4 py-6 space-y-4">
      <p className="text-sm text-[#a6adc8]">在设置页中配置词典、API 和触发方式。</p>
      <button onClick={() => chrome.runtime.openOptionsPage()}
        className="w-full py-2 bg-[#313244] text-[#cdd6f4] rounded-lg text-sm hover:bg-[#45475a]">
        打开完整设置页 →
      </button>
    </div>
  )
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmtDate() {
  return new Date().toISOString().slice(0, 10)
}


function speakText(text: string) {
  if (!text || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.95
  window.speechSynthesis.speak(utterance)
}