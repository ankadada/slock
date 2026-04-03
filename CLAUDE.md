# Slock - Team Communication Platform with AI Agents

## Project Overview

类 Slack 的团队内部协作通讯平台，AI Agent 作为平等的团队成员参与频道对话。支持多模型（Claude/GPT/自定义）、Agent Skills、Discord 式子区会话、生成式 UI。

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | React 18 + TypeScript + Vite | SPA, Tailwind + shadcn/ui |
| State | Zustand | 按领域拆分 store |
| Real-time | Socket.IO | 双向通信 |
| Backend | Express + TypeScript | ESM, `.js` import extensions |
| Database | SQLite via Prisma | 单文件，零配置 |
| AI | Anthropic + OpenAI SDK | 多 provider, 自动检测 CLI 配置 |
| Monorepo | pnpm workspaces | apps/web, apps/server, packages/shared |

## Project Structure

```
slock/
├── apps/
│   ├── web/                    # React frontend
│   │   └── src/
│   │       ├── components/     # UI components (layout/, chat/, agent/, settings/)
│   │       ├── hooks/          # useSocket
│   │       ├── stores/         # auth, channel, message, agent, thread
│   │       ├── pages/          # chat, login, register, invite
│   │       └── lib/            # api, socket, utils
│   └── server/                 # Express backend
│       ├── src/
│       │   ├── routes/         # auth, channels, messages, agents, threads, workflows, invites, settings
│       │   ├── services/       # agent-service, workflow-service, provider-detector
│       │   ├── skills/         # skill-registry, executors/, preset-skills, convert-tools
│       │   ├── middleware/     # auth (JWT)
│       │   ├── socket/        # Socket.IO handlers
│       │   └── lib/           # prisma singleton
│       └── prisma/            # schema + SQLite DB
├── packages/
│   └── shared/                # TypeScript types (全部 export from types.ts)
├── docker-compose.yml
└── Dockerfile
```

---

## Development Workflow (Sub-Agent Pipeline)

所有非 trivial 改动必须遵循以下流程。主 agent 是协调者，不直接写复杂代码。

### 流程总览

```
用户需求
  │
  ▼
Phase 1: 架构 ──── 1-2 个 architect agent 并行研究
  │                 输出: 实现方案 + 文件所有权表
  ▼
用户确认方案
  │
  ▼
Phase 2: 开发 ──── N 个 dev agent 并行编码
  │                 规则: 文件所有权隔离, 不互相修改
  ▼
Phase 3: 测试 ──── 独立 test agent 验证
  │                 构建 + API 测试 + E2E 截图
  ▼
  ├─ 通过 → 完成
  └─ 失败 → 启动 fix agent → 回到 Phase 3 (新 test agent, 禁止自审)
```

### Phase 1: Architecture Agent

| 项目 | 说明 |
|------|------|
| 触发 | 新功能 / 重大重构 |
| Agent 类型 | `feature-dev:code-architect` |
| 并行数量 | 按功能域拆分, 最多 3 个 |
| 必须做 | 读现有代码 → 设计方案 → 定义文件所有权 |
| 输出格式 | 文件列表 + 数据流 + 构建顺序 + 关键实现细节 |

**文件所有权表模板**:
```
Agent A 拥有: services/foo.ts, routes/foo.ts
Agent B 拥有: components/foo.tsx, stores/foo.ts
共享禁区: index.ts, schema.prisma (串行修改)
```

### Phase 2: Development Agent(s)

| 项目 | 说明 |
|------|------|
| 触发 | 用户确认架构方案 |
| Agent 类型 | `general-purpose` |
| 并行规则 | 文件所有权隔离, 同一文件只能一个 agent 修改 |
| 代码要求 | 完整可运行, 禁止 TODO/placeholder |
| 完成条件 | 前端 `npx vite build` 通过 或 后端 server 启动无报错 |

**Prompt 模板要点**:
- 明确列出 "你拥有这些文件 / 不要碰这些文件"
- 给出完整的实现规格, 不要让 agent 自己设计
- 要求 agent 在完成前运行构建验证

### Phase 3: Test & Review Agent

| 项目 | 说明 |
|------|------|
| 触发 | 任何 dev agent 完成 |
| Agent 类型 | 测试: `general-purpose`, 审查: `feature-dev:code-reviewer` |
| 核心原则 | **测试 agent 必须和开发 agent 不同** (禁止自审) |

**测试清单** (test agent 必须逐项执行):

```bash
# 1. 构建验证
cd apps/web && npx vite build

# 2. 后端启动
cd apps/server && npx tsx src/index.ts &
sleep 3
curl -s http://localhost:3000/api/health

# 3. API 端到端
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 必测端点:
curl -s http://localhost:3000/api/channels -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/agents -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/settings/providers -H "Authorization: Bearer $TOKEN"

# 4. E2E 截图验证 (headless Chrome)
node /tmp/e2e-test.js  # 登录 → 截图 → 检查控制台错误

# 5. 截图审查
# Read /tmp/test-*.png 确认 UI 正常渲染

# 6. 测试完成后: 确保服务保持运行状态
# 测试 agent 完成后不要杀掉服务！
# 如果测试过程中启动了服务，必须保持运行让用户可以访问
# 主 agent 在测试 agent 完成后需检查端口是否仍在监听:
#   lsof -i:3000 -i:5173
# 如果没在运行，主 agent 必须重启: cd /Users/lfx/slock && pnpm dev &
```

**审查清单** (review agent 检查):
1. Type safety: 无 `any`, 正确的类型窄化
2. Security: 无硬编码密钥, API 边界有输入校验
3. Error handling: async 路由有 try/catch, Socket 错误被捕获
4. Performance: 无 N+1 查询, 有分页
5. Conventions: 符合本文件的编码规范

### 冲突预防

- Prisma schema 修改必须**串行** — 同一时刻只有一个 agent 改 schema
- `apps/server/src/index.ts` 是高冲突文件 — 尽量由一个 agent 统一修改
- `packages/shared/src/types.ts` 同理 — 类型定义修改需要协调
- 如果发生冲突, 主 agent 负责合并

### Quick Fix 例外

单文件 bug 修复 (< 20 行) 主 agent 可以直接改, **但仍需启动 test agent 验证**。

---

## Code Conventions

### 通用
- TypeScript strict mode
- `const` > `let`, 禁止 `var`
- 文件名: kebab-case (`message-list.tsx`)
- 组件名: PascalCase (`MessageList`)
- 前端用 `@/` 路径别名

### Frontend
- 函数组件, 禁止 class 组件
- Zustand 管理全局状态, React state 管理局部 UI 状态
- Tailwind 直接写 class, 不用 CSS modules
- Socket.IO 事件统一在 `useSocket` hook 处理
- Zustand selector 禁止在 selector 内创建新引用 (用模块级常量空数组)

### Backend
- ESM 模式, import 路径必须带 `.js` 后缀
- 路由按资源组织: `/api/auth`, `/api/channels`, `/api/agents`
- 统一响应格式: `{ data?, error?, message? }`
- Prisma 操作, 禁止原生 SQL
- Socket.IO 事件命名: `feature:action` (如 `message:send`, `agent:stream`)
- JWT 中间件应用于所有路由 (除 auth/login, auth/register, 公开的 invite/validate)

### AI Agent
- Agent 角色支持预设 + 自定义 (role 是 string, 不是 enum)
- 每个 Agent 可独立配置 provider + model
- Agent 自主参与: 有 `auto_respond` capability 的 agent 自动评估每条消息
- Agent 互相调用: 最多 3 轮, 链式去重 (同一 agent 不重复回复), 30 秒冷却
- Skills: 通过 AI tool_use/function_calling 原生能力, server 端执行
- Memory: AI 提取关键事实, 按 channel 存储, 50 条上限自动轮换
- Provider 检测: 自动读取 CLI 配置 (Claude CLI env, Codex OAuth token, Ollama)

### Database
- Prisma schema 变更后运行 `npx prisma db push`
- SQLite 文件: `apps/server/prisma/slock.db`
- Thread 复用 Channel 模型 (`type: "thread"`, `parentChannelId`)

---

## Key Architecture Decisions

| 决策 | 选择 | 原因 |
|------|------|------|
| Thread 模型 | 复用 Channel (type=thread) | 避免重复 ChannelMember/Message 基础设施 |
| Agent 触发 | 每条消息自动评估 + @mention 强制触发 | 平权参与, 用户体验自然 |
| 死循环防护 | 链式去重 + 3轮上限 + 30s冷却 | 三层防护避免 Agent 互相死循环 |
| Skills 执行 | Server 端 registry + AI 原生 tool_use | 安全可控, 支持自定义 |
| Provider 配置 | CLI 自动检测 > 环境变量 > 手动设置 | 零配置体验 |
| 生成式 UI | Agent 输出结构化 JSON, 前端渲染 | 沙箱安全, 可扩展 |

---

## Commands

```bash
# 开发
pnpm dev                          # 同时启动前后端
pnpm --filter web dev             # 只启动前端 (port 5173)
pnpm --filter server dev          # 只启动后端 (port 3000)

# 数据库
cd apps/server && npx prisma db push    # 同步 schema
cd apps/server && npx tsx src/seed.ts   # 初始化数据

# 构建
pnpm build                        # 构建所有
cd apps/web && npx vite build     # 只构建前端

# Docker
docker compose up -d              # 生产部署

# 默认账号
# admin / admin123
```
