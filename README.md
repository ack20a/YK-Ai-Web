# YK AI · 私有部署对话工作台

一个简洁的中文 LLM 对话前端，参考 ChatGPT 的交互习惯但完全原创设计。
React + Vite 构建、Netlify Functions 提供后端代理与持久化。
所有密钥仅保存在服务端环境变量；浏览器无法读取。

---

## 功能

### 普通用户
- 流式对话；思考模型自动折叠 `<think>` / `<thinking>` 块并显示思考时长
- 模型选择（区分多模态、思考能力）
- 每条助手消息末尾显示 **tokens/sec、token 数、用时**
- 网络搜索开关（隐藏在「设置 → 搜索」中，前端保持极简）
- 上传图片：当前模型不支持图像时，自动用 OCR 模型转写并显示「OCR · 模型名」徽章
- 对话历史：置顶 / 重命名 / 删除 / 清空 / 导出
- 浅色 / 深色 / 自动主题，全中文界面

### 管理员
- 使用统计仪表盘（总用户、累计对话、累计 tokens、过去 7 天 token 消耗、活跃用户）
- 模型管理：增删改、启停、`vision` / `reasoning` 标记
- 用户管理：新建、改名、改角色、启停、删除、重置密码
- 系统提示词：全局 + 按模型覆盖（服务端注入，前端不可篡改）
- OCR 模型：选择哪一个多模态模型作为伪多模态备援
- Tavily 搜索：检索深度、结果数、抓取条数、Jina 抓取开关

### Agent 能力
- **Tavily 搜索/抓取**：服务端代理 `/api/search`，默认直接返回搜索结果与网页正文
- **Jina 抓取**：可选服务端代理 `/api/fetch?url=…`，开启后转发到 `https://r.jina.ai/<url>` 提取纯文本
- **OCR 备援**：仅文本模型收到图像时，先调用管理员配置的多模态模型识别，再把识别结果与原问题拼接送给目标模型

---

## 部署到 Netlify

1. 把仓库连接到 Netlify。`netlify.toml` 已配置好构建命令、Functions 目录与路由。
2. 在 **Site settings → Environment variables** 配置：

   | 变量 | 必填 | 说明 |
   | --- | --- | --- |
   | `JWT_SECRET` | ✅ | ≥ 32 字符的随机字符串，用于签发登录 JWT |
   | `INITIAL_ADMIN_EMAIL` | ✅ | 首次启动时自动创建的管理员邮箱 |
   | `INITIAL_ADMIN_PASSWORD` | ✅ | 首次启动时自动创建的管理员密码 |
   | `ONEAPI_KEY` | ✅ | OpenAI 兼容上游 API Key |
   | `ONEAPI_BASE` |   | 上游 BASE URL，默认 `https://one-api.ack20.eu.org/v1` |
   | `TAVILY_API_KEY` | ✅* | 启用网络搜索时必需 |
   | `JINA_API_KEY` |   | 可选，r.jina.ai 付费配额 |

   *未配置 `TAVILY_API_KEY` 时，关闭搜索仍能正常对话；启用搜索会返回明确错误。

3. 部署。首次访问 `/` 用 `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` 登录，
   即可在「管理员控制台 → 用户管理」中建立其他用户。完成后可以删除两个 `INITIAL_*`
   环境变量；用户列表存储在 Netlify Blobs，不会因为环境变量变化而失效。

> **持久化**：所有共享状态（用户、模型配置、提示词、Tavily 配置、用量统计）均通过
> [Netlify Blobs](https://docs.netlify.com/blobs/overview/) 持久化，无需额外数据库。
> 每个用户自己的对话历史保存在浏览器 LocalStorage（与原型一致；如需多端同步可后续替换）。

---

## 本地开发

```bash
npm install
cp .env.example .env       # 填入真实密钥
npx netlify dev             # 同时启动 Vite + Functions（推荐）
# 或者
npm run dev                 # 仅启 Vite，Functions 由 netlify dev 提供
```

`vite.config.js` 已配置 `/api` 代理到 `http://localhost:8888`（`netlify dev` 默认端口）。

打包：

```bash
npm run build
```

---

## 接入其他模型源

`/api/chat` 是一个透明 SSE 代理：

- 请求体 = OpenAI 标准 `chat.completions` 字段（`model`、`messages`、`stream`、`temperature`、`max_tokens`）
- 服务端会丢弃客户端传来的任何 `system` 消息，并按模型注入管理员配置的提示词
- 上游响应原样转发；前端从 `delta.content` 与 `delta.reasoning_content` 累计文本
  （`reasoning_content` 会被自动包裹为 `<think>…</think>`，与 `<think>` 内嵌格式统一处理）

只要上游兼容 OpenAI Chat Completions 流式协议（One-API、vLLM、Ollama 的 `openai` 端点等都满足），
把 `ONEAPI_BASE` 改掉即可。

---

## 安全要点

- 所有 API（除 `auth-login`）必须携带 `Authorization: Bearer <JWT>`，否则返回 401
- 管理员专用接口（`/api/users`、`/api/usage` GET、写入 `/api/config`）会再校验 `role=admin`
- 密码使用 `scrypt` + 16 字节随机盐存储；JWT 通过 HMAC-SHA256 签发，默认 7 天有效
- 所有上游密钥仅出现在 Netlify Functions 中，绝不下发到浏览器
- `/api/fetch` 仅允许 `http(s)` 协议，单次响应裁剪到 80 KB 以内

---

## 目录结构

```
.
├── index.html                # Vite 入口
├── vite.config.js
├── netlify.toml              # 构建 + 函数 + 路由
├── netlify/functions/
│   ├── _lib/
│   │   ├── auth.js           # JWT、scrypt、鉴权 helper
│   │   └── store.js          # Netlify Blobs 持久化（用户、配置、用量）
│   ├── auth-login.js
│   ├── auth-me.js
│   ├── config.js
│   ├── users.js
│   ├── chat.js               # SSE 透传
│   ├── search.js             # Tavily 搜索 + 正文代理
│   ├── fetch.js              # 可选 r.jina.ai 正文代理
│   └── usage.js              # 用量统计 GET/POST
└── src/
    ├── main.jsx
    ├── App.jsx               # 路由 + 鉴权状态
    ├── store.js              # 单用户客户端状态 reducer
    ├── icons.jsx
    ├── lib/
    │   ├── api.js            # fetch 封装 + JWT
    │   ├── engine.js         # search → fetch → OCR → SSE 流式
    │   └── utils.js          # markdown、parseStream、格式化
    ├── styles/
    │   ├── tokens.css
    │   └── app.css
    └── components/
        ├── Login.jsx
        ├── Sidebar.jsx
        ├── ChatView.jsx
        ├── Composer.jsx
        ├── Messages.jsx
        ├── Settings.jsx
        └── Admin.jsx
```
