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

// 修改 queryWord 函数
async function queryWord(word: string, x: number, y: number) {
  // 设置一个 5 秒的保底超时
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('查询超时')), 5000)
  )

  try {
    const [result, checkResult] = await Promise.race([
      Promise.all([
        chrome.runtime.sendMessage({ type: 'LOOKUP_WORD', word }),
        chrome.runtime.sendMessage({ type: 'CHECK_WORD', word })
      ]),
      timeout
    ]) as [LookupWordResult, { exists: boolean }]

    if (result.success && result.data) {
      showPopup(result.data, checkResult.exists, x, y)
    } else {
      showError(word, result.error ?? '查询失败')
    }
  } catch (err) {
    showError(word, '连接插件后台超时，请刷新页面重试')
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

function showPopup(data: any, alreadySaved: boolean, x: number, y: number) {
  const el = getOrCreatePopup()
  el.dataset.word = data.word.toLowerCase()

 // 在 defsHtml map 里，兼容处理真实换行和字面量 \n
  const defsHtml = data.definitions
   .slice(0, 3)
   .map((d: any) => {
     // 增加 .replace(/\\n/g, '<br>') 来处理字面量 \n，并增加一点行高让排版更好看
     const meaning = d.meaning
        .replace(/\\n/g, '<br>') 
        .replace(/\n/g, '<br>')
     return `<li style="line-height: 1.6; margin-bottom: 6px;">${d.partOfSpeech ? `<em>${d.partOfSpeech}</em> ` : ''}${meaning}</li>`
   })
   .join('')

  const exampleHtml = data.examples[0]
    ? `<p class="wb-example">"${data.examples[0]}"</p>`
    : ''
  // 将含有 \n 的文本切分成多行 <div> 渲染
  const translationHtml = data.translation
    ? `<div class="wb-translation" style="color: #f9e2af; font-size: 13px; margin: 8px 0 4px 0; line-height: 1.6;">
         ${escapeHTML(data.translation) // 先转义安全字符
           .split('\n')                  // 再按真实换行符切割
           .map(line => `<div style="margin-bottom: 2px;">${line}</div>`)
           .join('')}
       </div>`
    : ''

      // 按钮根据 alreadySaved 初始状态渲染，避免"先显示可点击再变灰"的闪烁
  const btnHtml = alreadySaved
    ? `<button class="wb-add-btn" disabled>✓ 已在单词本中</button>`
    : `<button class="wb-add-btn">＋ 加入单词本</button>`

  el.innerHTML = `
    <div class="wb-header">
      <span class="wb-word">${escapeHTML(data.word)}</span>
      ${data.phonetic ? `<span class="wb-phonetic">${escapeHTML(data.phonetic)}</span>` : ''}
    </div>
    ${translationHtml} <ul class="wb-defs">${defsHtml}</ul>
    ${exampleHtml}
    ${btnHtml}
  `

  // 只有在单词不存在时才绑定点击事件
  if (!alreadySaved) {
    const btn = el.querySelector('.wb-add-btn') as HTMLButtonElement
    btn.addEventListener('click', async () => {
      btn.disabled = true
      btn.textContent = '…'
      await chrome.runtime.sendMessage({ type: 'ADD_WORD', word: data })
      btn.textContent = '✓ 已在单词本中'
      btn.classList.add('wb-added')
    })
  }

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