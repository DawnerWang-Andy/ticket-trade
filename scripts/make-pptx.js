// 生成「票流转」作品展示 PPT
// 用法：node scripts/make-pptx.js（输出 docs/票流转-作品展示.pptx）
const path = require("path");
const pptxgen = require("/Users/dawnerwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs");

const ROOT = path.join(__dirname, "..");
const SHOT = (n) => path.join(ROOT, "scripts/shots", n);

// 配色：夜幕舞台深蓝 + 票面珊瑚红 + 金
const NAVY = "1E2348";
const NAVY2 = "2F3C7E";
const CORAL = "F96167";
const GOLD = "F9E795";
const BG = "FCF6F5";
const INK = "2B2B3A";
const GREY = "8A8A99";
const FONT = "PingFang SC";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
pres.author = "票流转项目组";
pres.title = "票流转 · Fans-to-Fans 票务交流平台";

// ---------- 通用版式 ----------
function contentSlide(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: BG };
  // 票根左竖条（视觉母题）
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.14, h: 7.5, fill: { color: CORAL } });
  s.addText(kicker || "", { x: 0.6, y: 0.32, w: 9, h: 0.35, fontFace: FONT, fontSize: 12, color: CORAL, bold: true, charSpacing: 4, margin: 0 });
  s.addText(title, { x: 0.6, y: 0.62, w: 11.5, h: 0.7, fontFace: FONT, fontSize: 30, color: NAVY, bold: true, margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 0.6, y: 1.42, w: 12.1, h: 0, line: { color: "E5DCDC", width: 1 } });
  return s;
}

function card(s, x, y, w, h, title, body, opts = {}) {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: "FFFFFF" }, line: { color: "EFE6E4", width: 1 }, shadow: { type: "outer", color: "1E2348", blur: 8, offset: 2, angle: 90, opacity: 0.12 } });
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.08, h, fill: { color: opts.bar || CORAL } });
  s.addText(title, { x: x + 0.3, y: y + 0.22, w: w - 0.5, h: 0.5, fontFace: FONT, fontSize: 17, bold: true, color: NAVY, margin: 0 });
  s.addText(body, { x: x + 0.3, y: y + 0.78, w: w - 0.55, h: h - 1.0, fontFace: FONT, fontSize: 12.5, color: INK, lineSpacing: 20, valign: "top", margin: 0 });
}

function shotFrame(s, img, x, y, w, h, label) {
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, fill: { color: "FFFFFF" }, line: { color: "E5DCDC", width: 1 } });
  s.addImage({ path: img, x, y, w, h, sizing: { type: "cover", w, h } });
  s.addShape(pres.shapes.RECTANGLE, { x, y: y + h - 0.42, w, h: 0.42, fill: { color: NAVY, transparency: 12 } });
  s.addText(label, { x: x + 0.15, y: y + h - 0.42, w: w - 0.3, h: 0.42, fontFace: FONT, fontSize: 12, color: "FFFFFF", bold: true, valign: "middle", margin: 0 });
}

// ---------- 1. 封面 ----------
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 7.1, w: 13.3, h: 0.4, fill: { color: CORAL } });
  // 票根母题：右侧虚线撕票卡
  s.addShape(pres.shapes.RECTANGLE, { x: 9.4, y: 1.5, w: 3.1, h: 4.4, fill: { color: NAVY2 } });
  s.addShape(pres.shapes.LINE, { x: 9.4, y: 3.6, w: 3.1, h: 0, line: { color: GOLD, width: 2, dashType: "dash" } });
  s.addText("ADMIT ONE", { x: 9.4, y: 2.6, w: 3.1, h: 0.5, fontFace: FONT, fontSize: 14, color: GOLD, align: "center", charSpacing: 6, margin: 0 });
  s.addText("¥ 原价封顶", { x: 9.4, y: 4.0, w: 3.1, h: 0.6, fontFace: FONT, fontSize: 22, color: "FFFFFF", bold: true, align: "center", margin: 0 });
  s.addText("已验真 · 强实名", { x: 9.4, y: 4.7, w: 3.1, h: 0.5, fontFace: FONT, fontSize: 13, color: "CADCFC", align: "center", margin: 0 });
  s.addText("FANS-TO-FANS TICKET COMMUNITY", { x: 0.9, y: 1.7, w: 8, h: 0.4, fontFace: FONT, fontSize: 13, color: CORAL, bold: true, charSpacing: 5, margin: 0 });
  s.addText("票流转", { x: 0.85, y: 2.1, w: 8, h: 1.6, fontFace: FONT, fontSize: 66, color: "FFFFFF", bold: true, margin: 0 });
  s.addText("合规优先的 Fans-to-Fans 二手票务交流平台", { x: 0.9, y: 3.75, w: 8.2, h: 0.6, fontFace: FONT, fontSize: 20, color: "CADCFC", margin: 0 });
  s.addText("全栈 MVP ｜ 粉丝社区 · 原价封顶 · 实名验真 · 经营后台", { x: 0.9, y: 4.5, w: 8.2, h: 0.45, fontFace: FONT, fontSize: 14, color: "8A8A99", margin: 0 });
  s.addText("项目组汇报 ｜ 2026-10", { x: 0.9, y: 6.4, w: 8, h: 0.4, fontFace: FONT, fontSize: 13, color: GREY, margin: 0 });
}

// ---------- 2. 调研背景 ----------
{
  const s = contentSlide("调研背景：三大痛点", "01 · MARKET RESEARCH");
  card(s, 0.6, 1.8, 3.9, 3.4, "黄牛加价倒卖", "热门演出溢价数倍，粉丝买不到原价票；加价倒卖已被《营业性演出管理条例实施细则》明确禁止，但二手平台仍是重灾区。");
  card(s, 4.7, 1.8, 3.9, 3.4, "假票与诈骗", "伪造票、一票多卖、收款后拉黑。私下转账无凭证，受害者维权困难，消协投诉量常年居高。", { bar: NAVY2 });
  card(s, 8.8, 1.8, 3.9, 3.4, "私下交易无保障", "粉丝间真实转票需求旺盛，但只能依赖社交群私聊，无验真、无留痕、无退出机制，信任成本极高。", { bar: GOLD });
  s.addText("调研素材：36氪 / 新华社 / 艾媒咨询 / 消协报道与监管文件（research/ 目录，由 AI 联网检索整理）", { x: 0.6, y: 5.5, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, color: GREY, margin: 0 });
  s.addText("结论：痛点真实且高频，但解法必须在监管框架内 —— 这决定了产品的形态选择。", { x: 0.6, y: 6.0, w: 12, h: 0.5, fontFace: FONT, fontSize: 15, color: NAVY, bold: true, margin: 0 });
}

// ---------- 3. 产品方案 ----------
{
  const s = contentSlide("产品方案：社区先行，合规写进代码", "02 · PRODUCT DESIGN");
  s.addText(" Fans-to-Fans 粉丝社区（支付暂缓，平台不经手资金）", { x: 0.6, y: 1.7, w: 12, h: 0.5, fontFace: FONT, fontSize: 17, color: CORAL, bold: true, margin: 0 });
  card(s, 0.6, 2.4, 6.0, 1.95, "原价封顶 · 锁死 1.0", "转让价 ≤ 票面价，服务端 422 硬拦截；上限在服务端 clamp 到 0–1.0，管理员也无法调高。");
  card(s, 6.8, 2.4, 6.0, 1.95, "全员实名 · 全程留痕", "发帖 / 评论 / 查看联系方式均需实名登录，依据《互联网跟帖评论服务管理规定》。", { bar: NAVY2 });
  card(s, 0.6, 4.55, 6.0, 1.95, "凭证验真 · 人工审核", "转票帖上传购票凭证，平台验真后展示「已验真」徽章；成交引导官方转赠通道。", { bar: GOLD });
  card(s, 6.8, 4.55, 6.0, 1.95, "法律提示 · 页面常驻", "治安法第 63 条等条文与平台规则对应关系，常驻社区列表 / 发帖页 / 详情页 / 发布页。");
}

// ---------- 4. 功能全景 ----------
{
  const s = contentSlide("功能全景：前台社区 + 经营后台", "03 · FEATURES");
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 1.75, w: 6.0, h: 4.9, fill: { color: "FFFFFF" }, line: { color: "EFE6E4", width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: 1.75, w: 6.0, h: 0.62, fill: { color: CORAL } });
  s.addText("用户前台（fans-to-fans）", { x: 0.85, y: 1.75, w: 5.5, h: 0.62, fontFace: FONT, fontSize: 16, color: "FFFFFF", bold: true, valign: "middle", margin: 0 });
  s.addText([
    { text: "社区首页：转票 / 求票 / 换票 / 讨论四类帖子", options: { bullet: true, breakLine: true } },
    { text: "帖子详情：原价封顶价签、已验真徽章、防骗指南", options: { bullet: true, breakLine: true } },
    { text: "联系方式仅实名可见，支持私聊沟通", options: { bullet: true, breakLine: true } },
    { text: "公开留言 + 一键举报，资金高危话术自动打标", options: { bullet: true, breakLine: true } },
    { text: "票品展示页：为担保交易预留的展示位", options: { bullet: true } },
  ], { x: 0.9, y: 2.6, w: 5.5, h: 3.8, fontFace: FONT, fontSize: 13.5, color: INK, lineSpacing: 26, valign: "top", margin: 0 });
  s.addShape(pres.shapes.RECTANGLE, { x: 6.8, y: 1.75, w: 6.0, h: 4.9, fill: { color: "FFFFFF" }, line: { color: "EFE6E4", width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 6.8, y: 1.75, w: 6.0, h: 0.62, fill: { color: NAVY } });
  s.addText("平台经营后台", { x: 7.05, y: 1.75, w: 5.5, h: 0.62, fontFace: FONT, fontSize: 16, color: "FFFFFF", bold: true, valign: "middle", margin: 0 });
  s.addText([
    { text: "仪表盘：GMV / 收入 / 托管资金 / 社区待办", options: { bullet: true, breakLine: true } },
    { text: "社区管理：验真审核 / 举报处理 / 帖子巡查", options: { bullet: true, breakLine: true } },
    { text: "票品 / 订单 / 用户 / 纠纷管理", options: { bullet: true, breakLine: true } },
    { text: "合规中心 + 平台设置（价格上限等）", options: { bullet: true, breakLine: true } },
    { text: "财税中心：增值税 / 附加税 / 企业所得税估算，810 号令涉税报送 CSV 导出", options: { bullet: true } },
  ], { x: 7.1, y: 2.6, w: 5.5, h: 3.8, fontFace: FONT, fontSize: 13.5, color: INK, lineSpacing: 26, valign: "top", margin: 0 });
}

// ---------- 5. 演示：社区 ----------
{
  const s = contentSlide("功能演示 ① 粉丝社区", "04 · DEMO");
  shotFrame(s, SHOT("10-community.png"), 0.8, 1.7, 5.6, 5.2, "首页即社区：四类帖子 + 法律提示常驻");
  shotFrame(s, SHOT("11-community-post.png"), 6.9, 1.7, 5.6, 5.2, "帖子详情：原价封顶 · 已验真 · 防骗指南");
}

// ---------- 6. 演示：发帖与私聊 ----------
{
  const s = contentSlide("功能演示 ② 发帖与私聊", "04 · DEMO");
  shotFrame(s, SHOT("12-community-new.png"), 0.8, 1.7, 5.6, 5.2, "发布新帖：关联演出 · 凭证上传 · 超限 422 拦截");
  shotFrame(s, SHOT("16-community-contact.png"), 6.9, 1.7, 5.6, 5.2, "联系方式：仅实名用户可见，游客锁定");
}

// ---------- 7. 演示：经营后台 ----------
{
  const s = contentSlide("功能演示 ③ 经营后台", "04 · DEMO");
  shotFrame(s, SHOT("05-admin-dashboard.png"), 0.8, 1.75, 5.9, 3.9, "仪表盘：GMV / 收入 / 待办一屏总览");
  shotFrame(s, SHOT("13-admin-forum-verify.png"), 6.9, 1.75, 5.9, 3.9, "社区管理：购票凭证人工验真");
  s.addText("另有：举报处理闭环 · 财税中心（三税估算 + 涉税报送 CSV）· 合规中心 · 平台设置", { x: 0.8, y: 6.1, w: 11.8, h: 0.45, fontFace: FONT, fontSize: 13.5, color: GREY, margin: 0 });
}

// ---------- 8. 合规设计 ----------
{
  const s = contentSlide("合规设计：先于功能的四条红线", "05 · COMPLIANCE");
  card(s, 0.6, 1.8, 6.0, 2.2, "不做「二清」", "无支付牌照不做资金托管 → 论坛阶段平台零资金经手，从机制上规避非法支付结算风险。");
  card(s, 6.8, 1.8, 6.0, 2.2, "不加价倒卖", "《营业性演出管理条例实施细则》禁止加价 → 原价封顶写死在服务端，非配置项可绕开。", { bar: NAVY2 });
  card(s, 0.6, 4.25, 6.0, 2.2, "内容治理责任", "实名发帖、举报处置闭环、日志留存 ≥6 个月（《网络安全法》第 49 条、跟帖评论规定）。", { bar: GOLD });
  card(s, 6.8, 4.25, 6.0, 2.2, "个人信息最小化", "联系方式仅实名可见；ICP 备案 / 公安联网备案列入上线前必办清单（docs/LEGAL.md）。");
}

// ---------- 9. AI 协作 ----------
{
  const s = contentSlide("AI 协作：工具、建议与人的取舍", "06 · AI COLLABORATION");
  s.addText("六个环节均由 Codex（GPT-5）协作完成", { x: 0.6, y: 1.65, w: 12, h: 0.45, fontFace: FONT, fontSize: 16, color: NAVY, bold: true, margin: 0 });
  s.addText([
    { text: "调研：anysearch 联网检索市场报道与监管文件 → 归纳三大痛点", options: { bullet: true, breakLine: true } },
    { text: "方案：AI 起草交易机制与合规文档，小组否决「支付先行」改为论坛先行", options: { bullet: true, breakLine: true } },
    { text: "开发：AI 生成全部前后端代码（约 60 个 API、20+ 页面）", options: { bullet: true, breakLine: true } },
    { text: "验证：AI 编写并执行 60 项冒烟测试 + 30 项渲染断言", options: { bullet: true, breakLine: true } },
    { text: "部署：Cloudflare 隧道一键脚本 + VPS 方案（systemd / Nginx）", options: { bullet: true, breakLine: true } },
    { text: "文档：README / 部署说明 / 作品说明，pandoc 转 PDF", options: { bullet: true } },
  ], { x: 0.6, y: 2.15, w: 6.1, h: 4.4, fontFace: FONT, fontSize: 13, color: INK, lineSpacing: 24, valign: "top", margin: 0 });
  card(s, 6.9, 2.15, 5.9, 2.1, "三次基于反馈的修改", "① 完整交易平台 → 论坛化转型（去支付）\n② 上限锁 1.0 + 法律条文四处常驻\n③ 页面加图（AI 生图无额度 → 改 Unsplash 免费图库）", { bar: GOLD });
  card(s, 6.9, 4.45, 5.9, 2.1, "关键取舍（人拍板）", "风险词从「微信/QQ」收窄为资金高危词（实测误伤）；联系方式改「仅实名可见」（个人信息保护法）；生图改免费图库（版权）。", { bar: NAVY2 });
}

// ---------- 10. 验证与交付 ----------
{
  const s = contentSlide("验证与交付", "07 · DELIVERY");
  const stat = (x, num, label) => {
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.9, w: 2.85, h: 1.9, fill: { color: "FFFFFF" }, line: { color: "EFE6E4", width: 1 } });
    s.addText(num, { x, y: 2.05, w: 2.85, h: 0.9, fontFace: FONT, fontSize: 34, color: CORAL, bold: true, align: "center", margin: 0 });
    s.addText(label, { x: x + 0.15, y: 3.0, w: 2.55, h: 0.7, fontFace: FONT, fontSize: 12.5, color: INK, align: "center", margin: 0 });
  };
  stat(0.6, "60 / 60", "端到端冒烟测试通过（含公网复测）");
  stat(3.6, "30 / 30", "页面渲染断言 + 自动截图");
  stat(6.6, "0", "npm 依赖（node:http + node:sqlite）");
  stat(9.6, "78", "GitHub 仓库文件数");
  s.addText([
    { text: "公网演示：Cloudflare 快速隧道，scripts/start-public.sh 一键拉起（演示环境）", options: { bullet: true, breakLine: true } },
    { text: "代码仓库：github.com/DawnerWang-Andy/ticket-trade（含全部文档与验证截图）", options: { bullet: true, breakLine: true } },
    { text: "文档：README · AI-GUIDE · COMPLIANCE · LEGAL · DEPLOY · WORK-REPORT", options: { bullet: true, breakLine: true } },
    { text: "生产化预案：VPS + systemd + Nginx + 自有域名，上线前先办 ICP 备案、换真实登录", options: { bullet: true } },
  ], { x: 0.6, y: 4.3, w: 12, h: 2.4, fontFace: FONT, fontSize: 13.5, color: INK, lineSpacing: 26, valign: "top", margin: 0 });
}

// ---------- 11. 结尾 ----------
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.3, h: 0.4, fill: { color: CORAL } });
  s.addText("能跑 ≠ 能上线", { x: 0.9, y: 1.6, w: 11, h: 1.0, fontFace: FONT, fontSize: 40, color: "FFFFFF", bold: true, margin: 0 });
  s.addText([
    { text: "AI 十分钟做完支付闭环，但「二清」红线意味着上线即违法 —— 合规判断必须由人承担", options: { bullet: true, breakLine: true } },
    { text: "风险词误伤、生图版权这类坑，只有真实使用场景才能暴露 —— 规则必须经真人实测", options: { bullet: true, breakLine: true } },
    { text: "AI 最大的价值是加速验证：每轮修改几分钟内全量回归 —— 而不是代替决策", options: { bullet: true } },
  ], { x: 0.9, y: 2.9, w: 11.4, h: 2.4, fontFace: FONT, fontSize: 15, color: "CADCFC", lineSpacing: 30, valign: "top", margin: 0 });
  s.addText("下一步：真实短信登录 · 内容机审 · ICP 备案 · 担保交易（持牌机构合作后恢复支付入口）", { x: 0.9, y: 5.6, w: 11.4, h: 0.5, fontFace: FONT, fontSize: 14, color: GOLD, margin: 0 });
  s.addText("票流转 ｜ 谢谢观看", { x: 0.9, y: 6.5, w: 11, h: 0.4, fontFace: FONT, fontSize: 13, color: GREY, margin: 0 });
}

pres.writeFile({ fileName: path.join(ROOT, "docs/票流转-作品展示.pptx") }).then((f) => console.log("已生成：" + f));
