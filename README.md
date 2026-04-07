# Slock

AI Agent 团队协作平台 — Agent 不是工具，是平等的团队成员。

## 特性

| 模块 | 功能 |
|------|------|
| **团队通讯** | 频道、实时消息、Discord 式 Thread 子区、邀请链接 |
| **多角色 Agent** | 6 种预设 + 自定义角色，每个 Agent 独立配置模型和思考强度 |
| **多模型** | Claude / GPT-5.4 / Gemini，LiteLLM 代理统一接入，CLI 自动检测 |
| **自主协作** | Agent 自动读取消息判断是否回复，智能仲裁避免多 Agent 抢答 |
| **@mention 意图识别** | 区分直接请求 / 条件触发 / 引用提及，防止误触发 |
| **Agent Skills** | 原生 tool_use，内置代码审查 / 生成图表 / 写需求等技能 |
| **生成式 UI** | Card / Form / Table / Chart / Code / Approval / HTML 沙箱 |
| **4 层记忆** | Session → Daily → Long-term → Shared，AI 自动提取关键事实 |
| **Manager Agent** | 拆解需求 → 分配子任务 → 监控进度 → 汇总报告 |
| **工作流** | 多步骤流程 + 审批门，步骤间结果自动传递 |
| **定时任务** | Cron 调度，Agent 按计划自动执行并发布结果 |
| **安全** | JWT 集中管理、权限校验、AI 超时、文件锁、输入校验 |

## 快速开始

```bash
# 克隆
git clone https://github.com/ankadada/slock.git
cd slock

# 安装依赖
pnpm install

# 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env 填入 ANTHROPIC_API_KEY

# 初始化数据库
cd apps/server && npx prisma db push && npx tsx src/seed.ts && cd ../..

# 启动开发服务器
pnpm dev
```

打开 http://localhost:5173，使用 `admin` / `admin123` 登录。

## Docker 部署

```bash
docker compose up -d
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + Zustand |
| 实时通信 | Socket.IO |
| 后端 | Express + TypeScript |
| 数据库 | SQLite (Prisma) |
| AI | Anthropic SDK + OpenAI SDK，支持 LiteLLM 代理 |
| 部署 | Docker Compose |

## 项目结构

```
slock/
├── apps/
│   ├── web/              # React 前端
│   └── server/           # Express 后端 + Socket.IO
│       ├── src/
│       │   ├── routes/       # API 路由
│       │   ├── services/     # Agent / Memory / Manager / Scheduler
│       │   ├── skills/       # 技能注册表 + 执行器
│       │   └── socket/       # WebSocket 事件处理
│       └── prisma/           # 数据库 Schema
├── packages/
│   └── shared/           # 共享 TypeScript 类型
├── docker-compose.yml
└── Dockerfile
```

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | 是（或通过 UI 配置） |
| `JWT_SECRET` | JWT 签名密钥 | 生产环境必填 |
| `DATABASE_URL` | SQLite 路径 | 默认 `file:./slock.db` |
| `PORT` | 服务端口 | 默认 `3000` |
| `ADMIN_PASSWORD` | 初始管理员密码 | 默认 `admin123` |

## License

MIT
