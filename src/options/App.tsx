import { useEffect, useState } from 'react'
import type { AppSettings } from '@/word'
import { DEFAULT_SETTINGS } from '@/word'
import DictionaryManager from './dictionarymanager'

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  // 加载已保存的设置
  useEffect(() => {
    chrome.storage.local.get('settings', ({ settings: s }) => {
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s })
    })
  }, [])

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  function save() {
    chrome.storage.local.set({ settings }, () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

// --- src/options/App.tsx (修改 runWebdavAction) ---

  async function runWebdavAction(type: 'WEBDAV_FORCE_PUSH' | 'WEBDAV_FORCE_PULL' | 'WEBDAV_SMART_MERGE') {
    setSyncing(true)
    setSyncMessage('')
    try {
      await chrome.storage.local.set({ settings })
      const res = await chrome.runtime.sendMessage({ type })
      if (!res?.success) {
        throw new Error(res?.error ?? '操作失败')
      }
      
      // 根据不同的操作类型，给出精准的成功提示
      if (type === 'WEBDAV_FORCE_PUSH') {
        setSyncMessage(`✓ 强制推送成功：已覆盖云端，共 ${res.summary.savedWords} 个单词 (${new Date(res.exportedAt).toLocaleString()})`)
      } else if (type === 'WEBDAV_FORCE_PULL') {
        setSyncMessage(`✓ 强制拉取成功：本地已被云端覆盖，共 ${res.summary.savedWordsAdded} 个单词`)
      } else if (type === 'WEBDAV_SMART_MERGE') {
        setSyncMessage(`✓ 智能合并成功：多端数据已对齐，云端共 ${res.summary.savedWords} 个单词 (${new Date(res.exportedAt).toLocaleString()})`)
      }
      
    } catch (error) {
      setSyncMessage(`✗ WebDAV 操作失败：${String(error)}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold text-[#cba6f7]">Wordsaver 设置</h1>
        <p className="text-sm text-[#585b70] mt-1">配置词典 API、翻译接口和交互行为</p>
      </div>

      {/* ── 词典 API ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#89b4fa] uppercase tracking-widest">
          词典 API
        </h2>

        <Field label="API 提供商">
          <select
            value={settings.apiProvider}
            onChange={e => update('apiProvider', e.target.value as AppSettings['apiProvider'])}
            className="select-field"
          >
            <option value="free-dictionary">Free Dictionary API（免费，英文释义）</option>
            <option value="youdao">有道词典（需要 AppKey）</option>
            <option value="deepl">DeepL（需要 API Key）</option>
          </select>
        </Field>

        {settings.apiProvider === 'youdao' && (
          <>
            <Field label="有道 AppKey">
              <input
                type="text"
                value={settings.youdaoAppKey ?? ''}
                onChange={e => update('youdaoAppKey', e.target.value)}
                placeholder="请输入有道 AppKey"
                className="input-field"
              />
            </Field>
            <Field label="有道 AppSecret">
              <input
                type="password"
                value={settings.youdaoAppSecret ?? ''}
                onChange={e => update('youdaoAppSecret', e.target.value)}
                placeholder="请输入有道 AppSecret"
                className="input-field"
              />
            </Field>
            <p className="text-xs text-[#585b70]">
              前往{' '}
              <a
                href="https://ai.youdao.com"
                target="_blank"
                rel="noreferrer"
                className="text-[#89b4fa] underline"
              >
                ai.youdao.com
              </a>{' '}
              申请免费额度
            </p>
          </>
        )}

        {settings.apiProvider === 'deepl' && (
          <>
            <Field label="DeepL API Key">
              <input
                type="password"
                value={settings.deeplApiKey ?? ''}
                onChange={e => update('deeplApiKey', e.target.value)}
                placeholder="请输入 DeepL API Key"
                className="input-field"
              />
            </Field>
            <p className="text-xs text-[#585b70]">
              前往{' '}
              <a
                href="https://www.deepl.com/pro-api"
                target="_blank"
                rel="noreferrer"
                className="text-[#89b4fa] underline"
              >
                deepl.com/pro-api
              </a>{' '}
              申请（Free 计划每月 50 万字符免费）
            </p>
          </>
        )}
      </section>

      {/* ── 翻译与显示 ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#89b4fa] uppercase tracking-widest">
          显示选项
        </h2>

        <Field label="默认 Tag（可选）">
          <input
            type="text"
            value={settings.defaultTag}
            onChange={e => update('defaultTag', normalizeTag(e.target.value))}
            placeholder="例如：daily-reading"
            className="input-field"
          />
        </Field>
        <p className="text-xs text-[#585b70]">
          在网页浮窗中“加入单词本”时默认使用该 Tag；留空则默认不带 Tag。
        </p>

        <Toggle
          label="自动获取中文翻译"
          description="查词时同步请求翻译接口，显示中文释义"
          checked={settings.autoTranslate}
          onChange={v => update('autoTranslate', v)}
        />

        <Toggle
          label="显示音标"
          description="在弹窗卡片和单词本中展示国际音标"
          checked={settings.showPhonetic}
          onChange={v => update('showPhonetic', v)}
        />
      </section>

      {/* ── 触发方式 ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#89b4fa] uppercase tracking-widest">
          触发方式
        </h2>

        <Field label="弹窗触发">
          <div className="flex gap-3">
            {(['select', 'doubleclick'] as const).map(mode => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="trigger"
                  checked={settings.popupTrigger === mode}
                  onChange={() => update('popupTrigger', mode)}
                  className="accent-[#cba6f7]"
                />
                <span className="text-sm">
                  {mode === 'select' ? '选中即触发' : '双击触发'}
                </span>
              </label>
            ))}
          </div>
        </Field>
      </section>
      <DictionaryManager />

      {/* ── WebDAV 同步 ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#89b4fa] uppercase tracking-widest">
          WebDAV 同步（文件级 + 增量合并）
        </h2>
        <Field label="WebDAV 地址">
          <input
            type="url"
            value={settings.webdavUrl}
            onChange={e => update('webdavUrl', e.target.value.trim())}
            placeholder="例如：https://dav.example.com/remote.php/dav/files/your-name"
            className="input-field"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="用户名">
            <input
              type="text"
              value={settings.webdavUsername}
              onChange={e => update('webdavUsername', e.target.value)}
              placeholder="WebDAV 用户名"
              className="input-field"
            />
          </Field>
          <Field label="密码 / 应用专用密码">
            <input
              type="password"
              value={settings.webdavPassword}
              onChange={e => update('webdavPassword', e.target.value)}
              placeholder="WebDAV 密码"
              className="input-field"
            />
          </Field>
        </div>
        <Field label="备份文件路径">
          <input
            type="text"
            value={settings.webdavFilePath}
            onChange={e => update('webdavFilePath', e.target.value)}
            placeholder="/wordsaver-backup.json"
            className="input-field"
          />
        </Field>
        <p className="text-xs text-[#585b70]">
          支持双向智能增量合并（推荐使用，两边单词互不丢失）。如果多台设备数据产生严重冲突，也可使用强制覆盖策略。
        </p>
        
        <div className="flex flex-col gap-3">
          {/* 1. 推荐的合并操作：占据整行，使用微弱的绿色背景强调 */}
          <button
            onClick={() => runWebdavAction('WEBDAV_SMART_MERGE')}
            disabled={syncing}
            className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-[#a6e3a1]/10 text-[#a6e3a1] border border-[#a6e3a1]/30 rounded-lg text-sm font-medium hover:bg-[#a6e3a1]/20 transition-all disabled:opacity-50"
          >
            ✦ 智能增量合并 (推荐)
          </button>

          {/* 2. 危险的覆盖操作：并排显示 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                if (confirm('【危险】此操作将用当前的本地单词本，完全抹除并覆盖云端数据！\n\n是否继续？')) {
                  runWebdavAction('WEBDAV_FORCE_PUSH')
                }
              }}
              disabled={syncing}
              className="flex justify-center items-center gap-1.5 px-4 py-2 bg-[#313244] text-[#f38ba8] border border-[#313244] rounded-lg text-sm hover:bg-[#f38ba8]/15 hover:border-[#f38ba8]/30 transition-all disabled:opacity-50"
            >
              ↑ 强制推送到云端 (覆盖)
            </button>

            <button
              onClick={() => {
                if (confirm('【危险】此操作将清空当前的本地单词本，完全使用云端数据覆盖！\n\n是否继续？')) {
                  runWebdavAction('WEBDAV_FORCE_PULL')
                }
              }}
              disabled={syncing}
              className="flex justify-center items-center gap-1.5 px-4 py-2 bg-[#313244] text-[#fab387] border border-[#313244] rounded-lg text-sm hover:bg-[#fab387]/15 hover:border-[#fab387]/30 transition-all disabled:opacity-50"
            >
              ↓ 强制拉取到本地 (覆盖)
            </button>
          </div>
        </div>
        {syncMessage && <p className="text-xs text-[#bac2de]">{syncMessage}</p>}
      </section>

      {/* ── 数据管理 ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#89b4fa] uppercase tracking-widest">
          数据管理
        </h2>
        <div className="flex gap-3">
          <button
            onClick={clearWordsaver}
            className="px-4 py-2 bg-[#313244] text-[#f38ba8] rounded-lg text-sm
                       hover:bg-[#45475a] transition-colors"
          >
            清空单词本
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 bg-[#313244] text-[#585b70] rounded-lg text-sm
                       hover:bg-[#45475a] transition-colors"
          >
            清空全部数据
          </button>
        </div>
      </section>

      {/* ── 保存按钮 ─────────────────────────────────────────────────────── */}
      <button
        onClick={save}
        className="w-full py-2.5 bg-[#cba6f7] text-[#1e1e2e] font-bold rounded-xl
                   hover:opacity-85 transition-opacity text-sm"
      >
        {saved ? '已保存 ✓' : '保存设置'}
      </button>
    </div>
  )
}

// ─── 工具组件 ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[#a6adc8]">{label}</label>
      {children}
    </div>
  )
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-[#cdd6f4]">{label}</p>
        <p className="text-xs text-[#585b70]">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-[#cba6f7]' : 'bg-[#45475a]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow
                      transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

// ─── 数据操作 ─────────────────────────────────────────────────────────────────

function clearWordsaver() {
  if (confirm('确定要清空所有单词吗？此操作不可撤销。')) {
    chrome.storage.local.remove('wordsaver')
  }
}

function clearAll() {
  if (confirm('确定要清空所有数据（包括设置）吗？此操作不可撤销。')) {
    chrome.storage.local.clear()
  }
}
