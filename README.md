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
* **🌍 智能多重翻译引擎**
    * **全方位释义**：提供国际音标、纯正的英英释义以及地道的例句。
    * **精准中文解析**：接入 Google Translate 服务，支持按词性（n., adj., v. 等）分行显示详细中文释义。
    * **无缝容错机制**：内置超时检测，在网络受限时自动无缝降级至备用翻译接口，确保查词“零卡顿”。
* **🏷️ 高效的单词本管理**
    * 一键将生词收入本地单词本，数据完全储存在浏览器本地，安全且保护隐私。
    * **Tag 标签系统**：支持为单词添加多个自定义标签，并在主面板通过标签进行快速过滤。
    * 内联编辑机制：支持在单词卡片中直接快速追加或删除标签。
* **💾 数据导出**
    * 支持将生词本导出为 **Excel (.xlsx)** 格式（支持分列展示释义、例句和标签）或 **纯文本 (.txt)**。
    * 完美适配 Anki 等第三方记忆软件的二次导入。

## 🛠️ 技术栈

本项目采用现代化的前端工程流构建：

* **框架**: React 18 + TypeScript
* **构建工具**: Vite + CRXJS (Manifest V3)
* **样式**: Tailwind CSS
* **数据导出**: SheetJS (xlsx)

## 📦 如何安装与使用 (适合普通用户)

如果你只是想使用这款插件，请按照以下步骤操作：

1. **下载插件包**：获取最新版本的 `WordSaver.zip` 安装包并解压到一个固定的文件夹中（请不要删除该文件夹）。
2. **打开扩展页面**：在基于 Chrome 内核的浏览器地址栏输入 `chrome://extensions/` 并回车。
3. **开启开发者模式**：在页面右上角打开 **“开发者模式” (Developer mode)** 的开关。
4. **加载插件**：点击页面左上角的 **“加载已解压的扩展程序” (Load unpacked)** 按钮。
5. **选择文件夹**：选中你刚才解压出来的 `dist` 文件夹（或解压后的根目录），即可安装成功！
6. **固定到任务栏**：点击浏览器右上角的“拼图”图标，将 WordSaver 固定到工具栏。打开任意一个真实的网页刷新后，即可体验划词翻译。

## 🛠️ 本地开发与构建 (适合开发者)

本项目采用现代化的前端工程流构建 (React + TypeScript + Tailwind CSS + Vite)。

### 1. 安装依赖
确保已安装 [Node.js](https://nodejs.org/) 和 pnpm。在项目根目录运行：
```bash
pnpm install
```

### 2. 编译打包
执行构建命令，Vite 会将 TypeScript 和 React 代码编译并输出到 `dist` 目录：
```bash
pnpm run build
```
打包完成后，`dist` 目录即为可被 Chrome 浏览器直接加载的插件本体。

### 3. 打包发布
如果想打包分享给其他人，只需将 `dist` 文件夹右键压缩为 `.zip` 文件即可。

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
│   └── word.ts     # 核心数据结构接口
├── popup.html      # 弹窗 HTML 骨架
├── options.html    # 设置页 HTML 骨架
├── vite.config.ts  # Vite 构建配置
└── tailwind.config.js # Tailwind CSS 配置
```

## 🔒 隐私与数据安全

WordSaver 秉持本地优先 (Local-First) 的原则，不会被上传至任何第三方服务器。

***
## TODO

1. 增加内置词典，按需自行导入（支持json、txt、csv）
2. ~~去重复~~
3. ~~多个单词本，分类保存（或者采用tag的方式）~~
4. webdav
5. ~~中文翻译~~