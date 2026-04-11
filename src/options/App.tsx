import { useEffect, useState } from 'react'
import type { AppSettings } from '@/word'
import { DEFAULT_SETTINGS } from '@/word'

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

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
