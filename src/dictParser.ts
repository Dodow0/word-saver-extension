// src/dictParser.ts
// 解析用户上传的词典文件，支持 .txt / .csv / .tsv / .json
//
// 支持的格式：
//
//  TXT（每行一个单词或"单词\t释义"）：
//    apple
//    banana	A yellow fruit
//
//  CSV（逗号分隔，首行可选 header）：
//    word,definition,example
//    ephemeral,lasting a short time,"The ephemeral beauty of cherry blossoms"
//
//  TSV（Tab 分隔，同 CSV）：
//    word\tdefinition\texample
//
// JSON 支持两种结构：
//
//   格式 A：对象数组
//   [{ "word": "ephemeral", "definition": "lasting a short time", "example": "..." }]
//
//   格式 B：单词作为 key 的对象
//   { "ephemeral": "lasting a short time" }
//   { "ephemeral": { "definition": "lasting a short time", "example": "..." } }
//
// 大文件处理：parseDict 是同步的纯 CPU 操作，10 万词条在主线程会卡 UI。
// 改为异步 + 分块（每批 2000 条），通过 onProgress 回调上报进度，
// 调用方可据此更新进度条，UI 不会冻结。

import type { DictEntry } from './db'

export type DictFormat = 'txt' | 'csv' | 'tsv' | 'json'

export interface ParseResult {
  entries: Omit<DictEntry, 'id' | 'dictId'>[]
  warnings: string[]
}

export interface ParseOptions {
  /** 每处理 CHUNK_SIZE 条词条时触发，progress 为 0~1 */
  onProgress?: (progress: number) => void
  /** 每批处理的词条数，默认 2000 */
  chunkSize?: number
}

// ─── 主入口（异步，支持进度回调）────────────────────────────────────────────

export async function parseDict(
  content: string,
  format: DictFormat,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const { onProgress, chunkSize = 2000 } = options

  switch (format) {
    case 'json': return parseJson(content, onProgress, chunkSize)
    case 'csv':  return parseDelimited(content, ',', onProgress, chunkSize)
    case 'tsv':  return parseDelimited(content, '\t', onProgress, chunkSize)
    case 'txt':  return parseTxt(content, onProgress, chunkSize)
  }
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

async function parseJson(
  content: string,
  onProgress?: (p: number) => void,
  chunkSize = 2000
): Promise<ParseResult> {
  const entries: ParseResult['entries'] = []
  const warnings: string[] = []

  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return { entries, warnings: ['JSON 解析失败，请检查文件格式'] }
  }

  // 统一成 [{ word, definition?, example? }] 的形式
  let rows: Array<{ word: string; definition: string; example?: string }> = []

  if (Array.isArray(raw)) {
    // 格式 A：对象数组
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue
      const obj = item as Record<string, unknown>

      const word = str(obj.word ?? obj.Word ?? obj.term ?? obj.Term)
      const definition = str(
        obj.definition ?? obj.Definition ?? obj.meaning ??
        obj.Meaning ?? obj.translation ?? obj.Translation
      )
      const example = str(obj.example ?? obj.Example ?? obj.sentence ?? obj.Sentence)

      if (!word) { warnings.push(`跳过无效词条：${JSON.stringify(item)}`); continue }
      rows.push({ word, definition, example: example || undefined })
    }
  } else if (typeof raw === 'object' && raw !== null) {
    // 格式 B：{ word: definition } 或 { word: { definition, example } }
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (!key) continue
      if (typeof val === 'string') {
        rows.push({ word: key, definition: val })
      } else if (typeof val === 'object' && val !== null) {
        const obj = val as Record<string, unknown>
        rows.push({
          word: key,
          definition: str(obj.definition ?? obj.meaning ?? obj.translation ?? ''),
          example: str(obj.example ?? obj.sentence) || undefined,
        })
      }
    }
  } else {
    return { entries, warnings: ['不支持的 JSON 结构，请使用数组或对象格式'] }
  }

  // 分块处理，每批 yield 一次让浏览器喘气
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    for (const row of batch) {
      entries.push({ word: row.word.toLowerCase(), definition: row.definition, example: row.example })
    }
    onProgress?.((i + batch.length) / rows.length)
    await yieldToMain()   // 让浏览器处理其他任务，避免卡 UI
  }

  return { entries, warnings }
}

// ─── TXT ──────────────────────────────────────────────────────────────────────

async function parseTxt(
  content: string,
  onProgress?: (p: number) => void,
  chunkSize = 2000
): Promise<ParseResult> {
  const entries: ParseResult['entries'] = []
  const warnings: string[] = []

  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'))

  for (let i = 0; i < lines.length; i += chunkSize) {
    const batch = lines.slice(i, i + chunkSize)
    for (const line of batch) {
      const parts = line.split('\t')
      const word = parts[0].trim().toLowerCase()
      if (!word) { warnings.push(`跳过空行：${line}`); continue }
      entries.push({ 
        word, 
        definition: str(parts[1] ?? ''), 
        example: parts[2] ? str(parts[2]) : undefined 
      })
    }
    onProgress?.((i + batch.length) / lines.length)
    await yieldToMain()
  }

  return { entries, warnings }
}

// ─── CSV / TSV ────────────────────────────────────────────────────────────────

async function parseDelimited(
  content: string,
  sep: string,
  onProgress?: (p: number) => void,
  chunkSize = 2000
): Promise<ParseResult> {
  const entries: ParseResult['entries'] = []
  const warnings: string[] = []

  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'))

  if (!lines.length) return { entries, warnings }

  let startIdx = 0
  let wordCol = 0, defCol = 1, exCol = -1, transCol = -1

  const firstRow = splitRespectingQuotes(lines[0], sep)
  const headerLower = firstRow.map(h => h.toLowerCase().trim())

  if (headerLower.includes('word') || headerLower.includes('单词')) {
    startIdx = 1
    wordCol = headerLower.findIndex(h => h === 'word' || h === '单词')
    defCol  = headerLower.findIndex(h => ['definition', 'meaning', '释义', '解释'].includes(h))
    transCol = headerLower.findIndex(h => ['translation', '翻译', '中文'].includes(h))
    exCol   = headerLower.findIndex(h => ['example', 'sentence', '例句'].includes(h))
    if (defCol === -1) defCol = 1
  }

  const dataLines = lines.slice(startIdx)

  for (let i = 0; i < dataLines.length; i += chunkSize) {
    const batch = dataLines.slice(i, i + chunkSize)
    for (const line of batch) {
      const cols = splitRespectingQuotes(line, sep)
      const word = cols[wordCol]?.trim().toLowerCase()
      if (!word) { warnings.push(`跳过空词条：${line}`); continue }

      // 尝试合并中英文释义（针对 ECDICT 这种多列结构）
      const engDef = cols[defCol] ? str(cols[defCol]) : '';
      // 假设 translation 在第 3 列 (index 3)，或者再次动态查找 transCol
      const chiTrans = transCol >= 0 && cols[transCol] ? str(cols[transCol]) : ''
  
      const fullDef = chiTrans ? `${chiTrans}\n${engDef}` : engDef;
    entries.push({
        word,
        definition: engDef,      // 只存英文
        translation: chiTrans || undefined,  // 只存中文
        example: exCol >= 0 && cols[exCol] ? str(cols[exCol]) : undefined,
    })
    }
    onProgress?.((i + batch.length) / dataLines.length)
    await yieldToMain()
  }

  return { entries, warnings }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function splitRespectingQuotes(line: string, sep: string): string[] {
  if (sep !== ',') return line.split(sep)
  const result: string[] = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === sep && !inQuotes) {
      result.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

/** 把 unknown 转成干净的 string，null/undefined 返回空字符串 */
function str(v: unknown): string {
  if (v == null) return ''
  return String(v)
    .replace(/\\n/g, '\n')   // 字面量 \n → 真实换行
    .replace(/\\t/g, '\t')   // 字面量 \t → 真实 Tab
    .trim()
}

/**
 * 让出主线程控制权，让浏览器处理渲染/输入等任务。
 * setTimeout(0) 在 Service Worker 里不可用，改用 Promise 微任务 + MessageChannel。
 * MessageChannel 的 onmessage 是宏任务，比 setTimeout(0) 更可靠。
 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => resolve()
    port2.postMessage(null)
  })
}