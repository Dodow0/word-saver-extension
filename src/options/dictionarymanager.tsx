// src/options/DictionaryManager.tsx
// 词典管理面板：上传 / 启用切换 / 删除
import { useEffect, useRef, useState } from 'react'
import type { Dictionary } from '../db'
import { parseDict } from '../dictParser'

type UploadPhase = 'idle' | 'reading' | 'parse' | 'write' | 'done' | 'error'

interface UploadState {
  phase: UploadPhase
  progress: number     // 0~1
  message: string
}

export default function DictionaryManager() {
  const [dicts, setDicts] = useState<Dictionary[]>([])
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle', progress: 0, message: '' })
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadDicts() }, [])

  // 监听来自 background 的进度推送
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type !== 'UPLOAD_PROGRESS') return
      const pct = Math.round(msg.progress * 100)
      if (msg.phase === 'parse') {
        setUpload({ phase: 'parse', progress: msg.progress, message: `解析中… ${pct}%` })
      } else if (msg.phase === 'write') {
        setUpload({ phase: 'write', progress: msg.progress, message: `写入词库… ${pct}%` })
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  async function loadDicts() {
    const res = await chrome.runtime.sendMessage({ type: 'GET_DICTS' })
    setDicts(res.dicts)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ── 上传 ────────────────────────────────────────────────────────────────────
  // 解析在 options 页（前台）完成，只把解析后的词条分批传给 background 写库
  // 这样彻底避免了 sendMessage 64MB 的消息体限制
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
 
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['txt', 'csv', 'tsv', 'json'].includes(ext ?? '')) {
      showToast('仅支持 .txt / .csv / .tsv / .json 格式')
      return
    }
 
    // 阶段 1：读取文件内容
    setUpload({ phase: 'reading', progress: 0, message: '读取文件…' })
    let text: string
    try {
      text = await readFileAsText(file, (p) =>
        setUpload({ phase: 'reading', progress: p, message: `读取文件… ${Math.round(p * 100)}%` })
      )
    } catch {
      setUpload({ phase: 'error', progress: 0, message: '文件读取失败' })
      return
    }
 
    // 阶段 2：在前台解析（parseDict 是异步分块的，不会卡 UI）
    setUpload({ phase: 'parse', progress: 0, message: '解析中… 0%' })
    let entries: any[], warnings: string[]
    try {
      const result = await parseDict(text, ext as any, {
        onProgress: (p) =>
          setUpload({ phase: 'parse', progress: p, message: `解析中… ${Math.round(p * 100)}%` }),
      })
      entries  = result.entries
      warnings = result.warnings
    } catch (err) {
      setUpload({ phase: 'error', progress: 0, message: '解析失败' })
      showToast(`✗ 解析失败：${err}`)
      return
    }
 
    if (!entries.length) {
      setUpload({ phase: 'error', progress: 0, message: '未解析到有效词条' })
      showToast('✗ 未解析到有效词条，请检查文件格式')
      setTimeout(() => setUpload({ phase: 'idle', progress: 0, message: '' }), 1500)
      return
    }
 
    // 阶段 3：先在 background 创建词典元数据，拿到 dictId
    setUpload({ phase: 'write', progress: 0, message: '写入词库… 0%' })
    const initRes = await chrome.runtime.sendMessage({
      type: 'INIT_DICT',
      name: file.name,
      format: ext,
      entryCount: entries.length,
    })
    if (!initRes.success) {
      setUpload({ phase: 'error', progress: 0, message: initRes.error })
      showToast(`✗ ${initRes.error}`)
      return
    }
    const dictId: number = initRes.dictId
 
    // 阶段 4：分批发送词条给 background 写入 Dexie
    // 每批 2000 条，约 200~400KB，远低于 64MB 限制
    const BATCH = 2000; // 增大批次减少通信频率
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH)
      const writeRes = await chrome.runtime.sendMessage({
        type: 'WRITE_DICT_ENTRIES',
        dictId,
        entries: batch,
      })
      if (!writeRes.success) {
        setUpload({ phase: 'error', progress: 0, message: '写入失败' })
        showToast(`✗ 写入失败：${writeRes.error}`)
        // 回滚：删掉已创建的词典
        await chrome.runtime.sendMessage({ type: 'DELETE_DICT', id: dictId })
        return
      }
      const progress = (i + batch.length) / entries.length
      setUpload({ phase: 'write', progress, message: `写入词库… ${Math.round(progress * 100)}%` })
      //如果一次性导入超大词库，每 5 批让出一次主线程，防止 Service Worker 假死
      if (i % (BATCH * 5) === 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  
    setUpload({ phase: 'done', progress: 1, message: '' })
    showToast(`✓ 导入成功：${entries.length.toLocaleString()} 条${warnings.length ? `（${warnings.length} 条跳过）` : ''}`)
    loadDicts()
    setTimeout(() => setUpload({ phase: 'idle', progress: 0, message: '' }), 1500)
    if (fileRef.current) fileRef.current.value = ''
  }
 
  async function toggleDict(id: number, active: boolean) {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_DICT', id, active })
    loadDicts()
  }
 
  async function deleteDict(id: number, name: string) {
  if (!confirm(`确定要删除词典「${name}」吗？`)) return;

  // 1. 立即从 UI 状态中移除（乐观更新）
  setDicts(prev => prev.filter(d => d.id !== id));
  showToast('正在从后台清理大量数据，请稍候...');

  try {
    // 2. 发送请求，注意：对于超大词典，这个请求可能会在数据完全删完前就结束（因为我们先删了元数据）
    const res = await chrome.runtime.sendMessage({ type: 'DELETE_DICT', id });
    
    if (res.success) {
      showToast('词典元数据已移除，后台正在清理剩余词条 ✓');
    } else {
      showToast('删除遇到问题：' + res.error);
      loadDicts(); // 失败了再加载回来
    }
  } catch (e) {
    // 即使通讯断开，由于后台先删了元数据，刷新后也不会看到了
    showToast('删除命令已发出');
    loadDicts();
  }
}
 
  const isUploading = ['reading', 'parse', 'write'].includes(upload.phase)
 
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#89b4fa] uppercase tracking-widest">
          自定义词典
        </h2>
        <label className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-opacity
          ${isUploading ? 'bg-[#45475a] text-[#585b70] cursor-not-allowed' : 'bg-[#cba6f7] text-[#1e1e2e] hover:opacity-80'}`}>
          {isUploading ? upload.message : '＋ 上传词典'}
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.tsv,.json"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </label>
      </div>
 
      {/* 进度条 */}
      {isUploading && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-[#a6adc8]">
            <span>{upload.message}</span>
            <span>{Math.round(upload.progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-[#313244] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#cba6f7] rounded-full transition-all duration-200"
              style={{ width: `${upload.progress * 100}%` }}
            />
          </div>
          {/* 分两段显示：解析 / 写入 */}
          <div className="flex gap-2 text-[10px] text-[#45475a]">
            <span className={upload.phase === 'parse' ? 'text-[#cba6f7]' : ''}>① 解析文件</span>
            <span>→</span>
            <span className={upload.phase === 'write' ? 'text-[#cba6f7]' : ''}>② 写入词库</span>
          </div>
        </div>
      )}
 
      {/* 格式说明 */}
      <div className="text-xs text-[#585b70] bg-[#181825] rounded-lg p-3 space-y-1">
        <p className="text-[#a6adc8] font-medium mb-1">支持的格式：</p>
        <p><span className="text-[#cba6f7]">TXT</span> — 每行一词，或「单词[Tab]释义」</p>
        <p><span className="text-[#cba6f7]">CSV / TSV</span> — 列：word, definition, example</p>
        <p><span className="text-[#cba6f7]">JSON</span> — 数组 <code className="text-[#a6e3a1]">[{`{"word","definition"}`}]</code> 或对象 <code className="text-[#a6e3a1]">{`{"word":"definition"}`}</code></p>
      </div>
 
      {/* 词典列表 */}
      {dicts.length === 0 ? (
        <p className="text-sm text-[#585b70] text-center py-6">
          还没有上传词典，选词时将直接查询在线 API
        </p>
      ) : (
        <ul className="space-y-2">
          {dicts.map(dict => (
            <li key={dict.id}
              className="flex items-center justify-between bg-[#181825] rounded-xl px-4 py-3 border border-[#313244]">
              <div className="flex items-center gap-3">
                <button
                  role="switch"
                  aria-checked={dict.active}
                  onClick={() => toggleDict(dict.id!, !dict.active)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0
                    ${dict.active ? 'bg-[#a6e3a1]' : 'bg-[#45475a]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow
                                   transition-transform ${dict.active ? 'translate-x-4' : ''}`} />
                </button>
                <div>
                  <p className={`text-sm font-medium ${dict.active ? 'text-[#cdd6f4]' : 'text-[#585b70]'}`}>
                    {dict.name}
                  </p>
                  <p className="text-[11px] text-[#45475a]">
                    {dict.entryCount.toLocaleString()} 词条 · {dict.format.toUpperCase()} · {new Date(dict.uploadedAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              </div>
              <button onClick={() => deleteDict(dict.id!, dict.name)}
                className="text-[#f38ba8] text-xs hover:underline ml-4">
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
 
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#313244] text-[#cdd6f4]
                        text-xs px-4 py-2 rounded-full shadow-xl border border-[#45475a]">
          {toast}
        </div>
      )}
    </section>
  )
}
// ─── FileReader 封装成 Promise，支持进度回调 ──────────────────────────────────
function readFileAsText(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}