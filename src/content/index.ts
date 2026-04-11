// content/index.ts
// 运行在每个网页中，监听选词行为，注入浮层卡片

import type { LookupWordResult } from '@/word'

let popupEl: HTMLDivElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

// ─── 监听选中文字 ─────────────────────────────────────────────────────────────

document.addEventListener('mouseup', async (e: MouseEvent) => {
  // 如果点击的是弹窗内部，不触发查词/隐藏逻辑
  if (popupEl && popupEl.contains(e.target as Node)) return;

  const selected = window.getSelection()?.toString().trim()

  // 只响应单个英文单词（允许连字符，如 "well-known"）
  if (!selected || !/^[a-zA-Z][a-zA-Z-]*[a-zA-Z]$|^[a-zA-Z]$/.test(selected)) {
    scheduleHide()
    return
  }
  // 去硬盘里读取用户的设置
  // await 等一等，等数据拿出来再往下走
  const storageData = await chrome.storage.local.get('settings');
  const settings = storageData.settings; 
  
  // 如果设置存在，且用户选择了“双击触发”，那划词（mouseup）就不弹窗
  if (settings && settings.popupTrigger === 'doubleclick') {
    return;
  }
  // 防止重复查询同一个词
  if (popupEl?.dataset.word === selected.toLowerCase()) return
  showLoading(selected, e.clientX, e.clientY)
  queryWord(selected, e.clientX, e.clientY)
})

// 为了支持双击触发，需要单独监听一下 dblclick 事件
document.addEventListener('dblclick', async (e: MouseEvent) => {
  const selected = window.getSelection()?.toString().trim()
  if (!selected || !/^[a-zA-Z][a-zA-Z-]*[a-zA-Z]$|^[a-zA-Z]$/.test(selected)) return;

  const storageData = await chrome.storage.local.get('settings');
  const settings = storageData.settings;

  // 只有当用户真的选了“双击触发”时，才在双击时弹窗
  if (settings && settings.popupTrigger === 'doubleclick') {
    showLoading(selected, e.clientX, e.clientY)
    queryWord(selected, e.clientX, e.clientY)
  }
})


// 点击其他区域时收起弹窗
document.addEventListener('mousedown', (e: MouseEvent) => {
  if (popupEl && !popupEl.contains(e.target as Node)) {
    scheduleHide()
  }
})

// ─── 向 Background 查词 ───────────────────────────────────────────────────────

async function queryWord(word: string, x: number, y: number) {
  const result: LookupWordResult = await chrome.runtime.sendMessage({
    type: 'LOOKUP_WORD',
    word,
  })

  if (result.success && result.data) {
    showPopup(result.data, x, y)
  } else {
    showError(word, result.error ?? '查询失败，请检查网络')
  }
}

// ─── 弹窗渲染（后续会替换为 React 组件）──────────────────────────────────────

function showLoading(word: string, x: number, y: number) {
  const el = getOrCreatePopup()
  el.dataset.word = word.toLowerCase()
  el.innerHTML = `
    <div class="wb-loading">
      <span class="wb-spinner"></span>
      <span>查询「${word}」中…</span>
    </div>
  `
  positionPopup(el, x, y)
}

function showPopup(data: any, x: number, y: number) {
  const el = getOrCreatePopup()
  el.dataset.word = data.word.toLowerCase()

  const defsHtml = data.definitions
    .slice(0, 3)
    .map((d: any) => `<li><em>${d.partOfSpeech}</em> ${d.meaning}</li>`)
    .join('')

  const exampleHtml = data.examples[0]
    ? `<p class="wb-example">"${data.examples[0]}"</p>`
    : ''

  el.innerHTML = `
    <div class="wb-header">
      <span class="wb-word">${escapeHTML(data.word)}</span>
      ${data.phonetic ? `<span class="wb-phonetic">${escapeHTML(data.phonetic)}</span>` : ''}
    </div>
    <ul class="wb-defs">${defsHtml}</ul>
    ${exampleHtml}
    <button class="wb-add-btn" data-id="${data.id}">＋ 加入单词本</button>
  `

  el.querySelector('.wb-add-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ADD_WORD', word: data })
    const btn = el.querySelector('.wb-add-btn') as HTMLButtonElement
    btn.textContent = '✓ 已添加'
    btn.disabled = true
  })

  positionPopup(el, x, y)
}

function showError(word: string, msg: string) {
  const el = getOrCreatePopup()
  el.innerHTML = `<div class="wb-error">「${word}」${msg}</div>`
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function getOrCreatePopup(): HTMLDivElement {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }

  if (!popupEl) {
    popupEl = document.createElement('div')
    popupEl.id = 'wordsaver-popup'
    document.body.appendChild(popupEl)
  }
  popupEl.style.display = 'block'
  return popupEl
}

function positionPopup(el: HTMLDivElement, x: number, y: number) {
  const offset = 12

  // 先隐藏，用于计算真实宽高
  el.style.display = 'block'
  el.style.visibility = 'hidden'

  const rect = el.getBoundingClientRect()
  const popWidth = rect.width
  const popHeight = rect.height

  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = x + offset
  let top = y + offset

  // 防止右侧超出边界
  if (left + popWidth > vw - 10) {
    left = vw - popWidth - 10
  }
  // 防止左侧超出边界（防患于未然）
  if (left < 10) left = 10

  // 防止底部超出边界：放不下就翻转到上方
  if (top + popHeight > vh - 10) {
    top = y - popHeight - offset
  }

  // 防止顶部超出边界
  if (top < 10) {
    top = 10 // 强制吸顶，留出 10px 安全距离
    
    // 限制弹窗最大高度，让释义太长时在内部滚动，而不是跑出屏幕
    el.style.maxHeight = `${vh - 20}px`
    el.style.overflowY = 'auto'
  } else {
    // 如果没超出，恢复默认（避免上一次查长词遗留样式）
    el.style.maxHeight = 'none'
    el.style.overflowY = 'visible'
  }

  // 应用最终坐标
  el.style.left = `${left + window.scrollX}px`
  el.style.top  = `${top + window.scrollY}px`
  
  // 恢复显示
  el.style.visibility = 'visible'
}

function scheduleHide() {
  hideTimer = setTimeout(() => {
    if (popupEl) popupEl.style.display = 'none'
  }, 200)
}

// 将危险字符转换成安全的 HTML 实体
function escapeHTML(str: string): string {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}