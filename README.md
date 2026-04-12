# WordSaver ✦ 单词本助手

WordSaver 是一款基于 Chrome Manifest V3 的轻量级划词翻译与生词本扩展程序。

<p align="center"><b>划词翻译</b></p>
<p align="center"><img src="./ws1.png" width="260"></p>

<p align="center"><b>查看导出</b></p>
<p align="center"><img src="./ws2.png" width="260"></p>

<p align="center"><b>详细设置</b></p>
<p align="center"><img src="./ws3.png" width="260"></p>

## ✨ 核心特性

* **⚡️ 极速划词与双击查词**
    * 支持自定义触发方式（“选中即触发”或“双击触发”）。
    * 轻量级弹窗设计，自动计算边界位置，不遮挡阅读视线。
* **🌍 智能翻译与引擎回退**
    * **多源聚合**：默认集成 **Free Dictionary API** 提供权威英英释义与音标。
    * **高可用翻译**：内置 **Google Translate (GTX)** 接口提供精准中文解析。
    * **无缝容错**：当主力翻译接口请求超时（3秒）或受限时，系统会自动回退至 **MyMemory** 备用线路，确保查词“零卡顿”。
* **📚 强大的本地词典库 (Dexie.js)**
    * **海量导入**：支持分批异步导入 `.txt`, `.csv`, `.tsv`, `.json` 格式的大型词典文件（如 ECDICT），通过微任务调度避免界面卡顿。
    * **离线优先**：查词时优先检索本地已启用的第三方词典，未命中时自动转接在线 API。
* **🏷️ 高效的生词管理**
    * **Tag 标签系统**：支持为单词添加多个自定义标签，并提供基于标签的实时过滤功能。
    * **数据导出**：支持一键导出为 **Excel (.xlsx)** 或 **纯文本 (.txt)** 格式，完美适配 Anki 等记忆软件的导入要求。

## 🛠️ 技术栈

本项目采用现代化的前端工程流构建：

* **核心框架**: React 18 + TypeScript
* **存储引擎**: [Dexie.js](https://dexie.org/) (IndexedDB 封装)，处理高性能本地词库查询
* **构建工具**: Vite + CRXJS (Manifest V3 适配)
* **样式方案**: Tailwind CSS
* **数据处理**: SheetJS (XLSX) 导出

## 📦 如何安装与使用 (适合普通用户)

如果你只是想使用这款插件，请按照以下步骤操作：

1. **下载插件包**：获取最新版本的 `WordSaver.zip` 安装包并解压到一个固定的文件夹中（请不要删除该文件夹）。
2. **打开扩展页面**：在基于 Chrome 内核的浏览器地址栏输入 `chrome://extensions/` 并回车。
3. **开启开发者模式**：在页面右上角打开 **“开发者模式” (Developer mode)** 的开关。
4. **加载插件**：点击页面左上角的 **“加载已解压的扩展程序” (Load unpacked)** 按钮。
5. **选择文件夹**：选中你刚才解压出来的 `dist` 文件夹（或解压后的根目录），即可安装成功！
6. **固定到任务栏**：点击浏览器右上角的“拼图”图标，将 WordSaver 固定到工具栏。打开任意一个真实的网页刷新后，即可体验划词翻译。

## 🛠️ 本地开发与构建 (适合开发者)

### 1. 环境准备
确保您的环境中已安装 [Node.js](https://nodejs.org/) (>=18) 和 [pnpm](https://pnpm.io/)。

### 2. 运行项目
```bash
# 安装依赖
pnpm install

# 启动开发模式（监听文件改动并自动构建）
pnpm run dev

# 生产环境构建编译到 dist 目录
pnpm run build

# 构建并打包成 zip 压缩包
pnpm run build:zip
```

## ⚙️ 目录结构说明

```text
wordsaver/
├── public/        # 静态资源 (Manifest, CSS, 图标等)
├── src/
│   ├── background/ # Service Worker (处理 API 请求与数据调度)
│   ├── content/    # Content Script (注入网页的划词监听与 UI)
│   ├── options/    # 插件设置页 (配置 API Key、交互方式)
│   ├── popup/      # 插件弹窗页 (单词本列表、搜索、导出)
│   ├── types/      # TypeScript 类型定义
│   ├── db.ts       # IndexedDB 数据库 Schema 定义与查询方法
│   ├── dictParser  # 高性能、分块式的第三方词典文件解析器
│   └── word.ts     # 核心数据结构接口
├── popup.html      # 弹窗 HTML 骨架
├── options.html    # 设置页 HTML 骨架
├── vite.config.ts  # Vite 构建配置
└── tailwind.config.js # Tailwind CSS 配置
```

## 🔒 隐私与数据安全

所有生词数据及导入的第三方词库均存储在浏览器本地的 IndexedDB 中。

除了必要的词典查询 API 请求外，插件不会向任何第三方服务器上传您的阅读历史或单词偏好。


## TODO

1. ~~增加词典导入（支持json、txt、csv），没精力调试其他格式了，已验证 [ecdict.csv](https://github.com/skywind3000/ECDICT)~~
2. ~~识别重复单词~~
3. ~~采用tag的方式分类，可按tag导出~~
4. webdav
5. ~~中文翻译~~