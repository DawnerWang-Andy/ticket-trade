# AI 使用说明：如何借助 AI 持续开发「票流转」

本文面向项目的后续维护者：说明如何用 AI 编程助手（Codex / Claude / Cursor 等）安全、高效地迭代这个平台。
核心原则：**先让 AI 读懂项目结构，再让它小步修改，最后用冒烟测试验证**。

---

## 1. 项目速览（给 AI 的上下文）

把下面这段贴给任意 AI 助手，它就能快速进入状态：

```
这是一个零依赖的 Node.js 全栈项目（Node >= 22.5，使用内置 node:sqlite 与 node:http，无 npm 依赖）。
当前阶段：Fans-to-Fans 粉丝社区已上线，线上支付暂缓（前端购买入口已替换为社区引导，交易 API 保留）。
- server/db.js      SQLite 建表 + 种子数据（node server/db.js --reset 可重建）
- server/domain.js  领域逻辑：计价、阶梯退票、结算分账、税务测算、合规校验
- server/api.js     全部 REST 路由（/api/* 买家卖家端 + /api/forum/* 社区，/api/admin/* 平台后台）
- server/index.js   HTTP 入口：静态文件服务 + API 分发，端口 8321
- public/index.html + app.js    买家/卖家端 SPA（hash 路由，含 #/community 社区三视图）
- public/admin.html + admin.js  平台经营后台 SPA（含 pageForum 社区管理）
- public/styles.css 设计系统（CSS 变量）｜ public/icons.js 内联 lucide 图标
- scripts/smoke.mjs 端到端冒烟测试（54 项断言，node scripts/smoke.mjs 运行）
- scripts/screenshot.py / forum-shots.py  Playwright 页面渲染验证 + 截图
前端是原生 JS 模板字符串渲染，无框架无构建。启动：npm start；测试：先启服务再跑 smoke。
```

## 2. 数据模型（改功能前必读）

| 表 | 作用 | 关键字段 |
|---|---|---|
| `users` | 用户/卖家/管理员 | `real_name_verified`（实名）、`seller_type`（personal/business）、`merchant_status`（资质审核）、`balance`（可提现货款） |
| `events` | 演出/赛事 | `category`、`city`、`event_date`、`face_values`（JSON 票档） |
| `listings` | 在售票品 | `face_value`/`price`/`premium_rate`（溢价率）、`status`（active/offline/sold）、`source_channel`（票源公示） |
| `orders` | 订单（状态机） | `status`：pending_payment→paid_escrow→transferred→completed；refunded/cancelled/disputed；金额五元组 `ticket_amount/buyer_fee/total_amount/commission/seller_income` |
| `ledger` | 平台资金流水（只增不改） | `account`：escrow/platform_revenue/seller_payable/compensation_fund；`entry_type` + `direction` |
| `disputes` | 纠纷 | `status`（open/resolved）、`compensation`（先行赔付额） |
| `posts` | 社区帖子 | `kind`（selling/wanted/swap/discuss）、`contact`（自愿公开的联系方式，仅实名登录用户经详情接口可见）、`verify_status`（none/pending/verified/rejected 凭证验真）、`risk_flag`（资金类高危话术标记）、`status`（open/done/hidden）、`price` ≤ 票面价（原价封顶） |
| `comments` | 社区留言 | `risk_flag`、`status`（visible/hidden），全实名留痕 |
| `reports` | 社区举报 | `post_id`/`comment_id`、`status`（open/resolved）、`resolution` |
| `costs` | 期间成本（税务用） | `period`（2026Q3）、`category`、`amount` |
| `settings` | 平台参数（键值） | 佣金率、服务费率、溢价上限、阶梯退票 JSON、三档税率 |

资金铁律：**所有资金变动只写 `ledger`（复式思路，append-only），不直接改余额字段**；`users.balance` 仅记录卖家可提现货款。

社区铁律：**发帖/评论必须实名**（`requireRealnamed`）；转票帖与票品复用同一价格上限（`price_cap_multiplier=1.0` 原价封顶，PUT /api/admin/settings 已加 0–1.0 硬约束）；资金类高危关键词（定金/收款码/私下转账）只做风险标记不拦截（避免误伤防骗科普帖），处置走举报+人工审核；联系方式允许自愿公开，但详情接口必须按 `authUser + real_name_verified` 门禁下发，列表接口不得输出。

## 3. 典型任务的标准 AI 用法

### 3.1 新增一个 API
推荐提示词模板：
> 阅读 server/api.js 中 `/api/orders/:id/refund` 的实现方式，仿照它新增 `POST /api/orders/:id/reopen`。要求：参数校验抛 `D.httpError`、资金变动走 `D.ledger`、在 scripts/smoke.mjs 中补充对应断言，然后运行 `node --check` 和冒烟测试验证。

### 3.2 修改业务规则（如退票阶梯）
规则都在 `settings` 表，**优先改配置而非改代码**。让 AI 做的事是：
> 在后台「平台设置」页（public/admin.js 的 pageSettings）为 XXX 增加配置项，同步修改 server/api.js 的 PUT /api/admin/settings 白名单。

### 3.3 新增后台页面
> 仿照 public/admin.js 中 pageCompliance 的结构，新增 pageXxx：在 NAV 数组注册菜单项，编写 async 函数渲染到 #admin-main，数据从 /api/admin/xxx 获取（server/api.js 里同步新增路由，记得 requireAdmin）。

### 3.4 排查 Bug
> 运行 `node scripts/smoke.mjs`，把失败项输出贴给 AI，并说明期望行为。让 AI 先解释根因再改代码，改完必须重跑冒烟 + `npm run check`。

### 3.5 数据库变更
> 在 server/db.js 的 SCHEMA 中修改，并编写迁移逻辑（项目目前用 CREATE TABLE IF NOT EXISTS；新增列用 ALTER TABLE 包 try/catch）。改完执行 `npm run seed` 重建演示数据，再跑冒烟。

## 4. 给 AI 的硬性约束（建议贴在每次会话开头）

1. 不引入任何 npm 依赖；前端不加框架、不加构建步骤。
2. 所有 SQL 用预编译参数（`prepare` + `?`），禁止字符串拼接 SQL。
3. 管理端接口必须过 `requireAdmin`；用户接口必须过 `requireUser` 并校验资源归属。
4. 金额一律 `D.r2()` 保留两位；证件号必须脱敏存储（`D.maskIdCard`）。
5. 合规红线不可通过配置绕过：实名强制（含社区发帖/评论）、价格上限（≤票面价）、票源公示、阶梯退票。
6. 支付功能暂缓期间：不得在前端新增任何收款/付款入口；交易 API 保留但 UI 不暴露。
7. 改完必须过三关：`node --check`、`npm run seed && npm start`、`node scripts/smoke.mjs` 全绿。

## 5. 验证工作流

```bash
npm run check          # 1. 语法检查（4 个 server 文件）
npm run seed           # 2. 重建演示数据
npm start              # 3. 启动服务（保持运行）
node scripts/smoke.mjs # 4. 32 项端到端断言
/opt/anaconda3/envs/polymer/bin/python scripts/screenshot.py  # 5. 页面截图（可选）
```

## 6. 下一步可以让 AI 做的迭代（按优先级）

1. **真实支付托管对接**：把 `POST /api/orders/:id/pay` 换成微信支付/支付宝担保交易回调（合规要求见 docs/COMPLIANCE.md 第 3 节）。
2. **实名核验对接**：`/api/me/realname` 目前是模拟核验，接公安一所/阿里实人认证 API。
3. **官方转赠核验**：卖家标记转赠后，调用大麦/猫眼开放接口或让用户上传转赠截图，由客服或 OCR 核验后放款。
4. **演出结束自动结算**：定时任务扫描 `transferred` 且 `event_date` 已过的订单自动确认收货。
5. **搜索与推荐**：events 表加全文索引；按用户浏览行为做"折扣票"推荐位。
6. **消息通知**：订单状态变更发短信/微信模板消息（现在只有 toast）。
7. **涉税报送自动化**：CSV 导出 → 电子税务局接口直连（各地税局有报送通道）。

> 每个迭代都建议独立会话完成，提示词里附上本文件第 1、2、4 节。
