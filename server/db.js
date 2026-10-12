// 数据库层：node:sqlite（Node >= 22.5 内置，零依赖）
// 直接运行 `node server/db.js --reset` 可重建并写入种子数据。
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'tickettrade.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  id_card TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  real_name_verified INTEGER NOT NULL DEFAULT 0,
  seller_type TEXT NOT NULL DEFAULT 'personal',
  business_license TEXT,
  performance_permit TEXT,
  merchant_status TEXT NOT NULL DEFAULT 'none',
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT NOT NULL,
  event_date TEXT NOT NULL,
  face_values TEXT NOT NULL DEFAULT '[]',
  image TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  seat_info TEXT NOT NULL DEFAULT '',
  face_value REAL NOT NULL,
  price REAL NOT NULL,
  premium_rate REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  ticket_type TEXT NOT NULL,
  transfer_method TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  proof TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  ticket_amount REAL NOT NULL,
  buyer_fee REAL NOT NULL,
  total_amount REAL NOT NULL,
  commission REAL NOT NULL,
  seller_income REAL NOT NULL,
  attendee_name TEXT NOT NULL,
  attendee_id_card TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  refund_fee_rate REAL, refund_fee REAL, refund_amount REAL, refund_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  paid_at TEXT, transferred_at TEXT, completed_at TEXT, closed_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  account TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount REAL NOT NULL,
  direction TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  opened_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  compensation REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  event_id INTEGER REFERENCES events(id),
  kind TEXT NOT NULL,                 -- selling 转票 / wanted 求票 / swap 换票 / discuss 讨论
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  face_value REAL,
  price REAL,
  quantity INTEGER NOT NULL DEFAULT 1,
  transfer_method TEXT NOT NULL DEFAULT '',
  proof TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',      -- 发帖人自愿公开的联系方式（仅实名登录用户可见）
  verify_status TEXT NOT NULL DEFAULT 'none', -- none / pending / verified / rejected
  risk_flag INTEGER NOT NULL DEFAULT 0,       -- 站外交易关键词风险标记
  status TEXT NOT NULL DEFAULT 'open',        -- open / done / hidden
  views INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',     -- visible / hidden
  risk_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER REFERENCES posts(id),
  comment_id INTEGER REFERENCES comments(id),
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',        -- open / resolved
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  resolved_at TEXT
);
`;

const DEFAULT_SETTINGS = {
  commission_rate: '0.08',
  buyer_service_fee_rate: '0.05',
  price_cap_multiplier: '1.0',
  refund_tiers: JSON.stringify([
    { min_days: 15, fee: 0 },
    { min_days: 8, fee: 0.1 },
    { min_days: 3, fee: 0.3 },
    { min_days: 2, fee: 0.5 },
    { min_days: 0, fee: 1.0 }
  ]),
  vat_rate: '0.06',
  surcharge_rate: '0.12',
  cit_rate: '0.25',
  platform_name: '票流转',
  disclaimer: '本平台为 Fans-to-Fans 票务交流社区，仅提供信息交流服务：不参与任何交易、不经手资金、不担保票品真实性。依据《营业性演出管理条例实施细则》禁止加价倒卖演出票券的规定，转让价不得超过票面价（仅原价/折价）。私下交易风险自担。'
};

function initSchema() {
  db.exec(SCHEMA);
  // 既有库的增量列迁移（新库由 SCHEMA 直接建好，ALTER 失败即忽略）
  try { db.exec(`ALTER TABLE posts ADD COLUMN contact TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE events ADD COLUMN image TEXT NOT NULL DEFAULT ''`); } catch {}
  const insert = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
}

function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS reports; DROP TABLE IF EXISTS comments; DROP TABLE IF EXISTS posts;
    DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS disputes; DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS listings; DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS costs; DROP TABLE IF EXISTS settings;
  `);
  initSchema();
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const days = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function seed() {
  const insUser = db.prepare(`INSERT INTO users(phone,name,id_card,role,real_name_verified,seller_type,business_license,performance_permit,merchant_status,balance,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  insUser.run('18800000000', '平台管理员', '110***********0011', 'admin', 1, 'business', '91110108MA0000000X', '京文演备[2016]0001号', 'approved', 0, '2026-01-01 09:00:00');
  const sellerA = insUser.run('13911112222', '王晓明', '310***********2233', 'user', 1, 'personal', null, null, 'none', 0, '2026-03-12 10:00:00').lastInsertRowid;
  const sellerB = insUser.run('13933334444', '星辉票务代理有限公司', '310***********4455', 'user', 1, 'business', '91310115MA1000000K', '沪文演备[2018]0213号', 'approved', 0, '2026-02-20 10:00:00').lastInsertRowid;
  const sellerC = insUser.run('13977778888', '陈晨', null, 'user', 0, 'personal', null, null, 'none', 0, '2026-08-01 10:00:00').lastInsertRowid;
  const buyerDemo = insUser.run('13955556666', '李晓', '440***********6677', 'user', 1, 'personal', null, null, 'none', 0, '2026-04-05 10:00:00').lastInsertRowid;

  const insEvent = db.prepare(`INSERT INTO events(title,artist,category,city,venue,event_date,face_values,image,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const ev = (t, a, c, city, v, d, f, img) => insEvent.run(t, a, c, city, v, d, JSON.stringify(f), img, '2026-09-01 10:00:00').lastInsertRowid;
  const e1 = ev('周杰伦「嘉年华」世界巡回演唱会 上海站', '周杰伦', '演唱会', '上海', '上海体育场', `${days(26)} 19:30`, [580, 880, 1280, 1680, 2080], '/img/events/e1.jpg');
  const e2 = ev('凤凰传奇「吉祥如意」巡回演唱会 北京站', '凤凰传奇', '演唱会', '北京', '国家体育场(鸟巢)', `${days(10)} 19:00`, [380, 680, 980, 1280], '/img/events/e2.jpg');
  const e3 = ev('2026 草莓音乐节 成都站', '多阵容', '音乐节', '成都', '成都露天音乐公园', `${days(33)} 14:00`, [360, 520, 680], '/img/events/e3.jpg');
  const e4 = ev('话剧《茶馆》 北京人民艺术剧院', '北京人艺', '话剧', '北京', '首都剧场', `${days(45)} 19:30`, [180, 380, 580, 780], '/img/events/e4.jpg');
  const e5 = ev('2026 江苏省城市足球联赛 南京队 vs 苏州队', '苏超', '体育赛事', '南京', '南京奥体中心体育场', `${days(17)} 19:35`, [10, 50, 80], '/img/events/e5.jpg');
  const e6 = ev('陈奕迅 FEAR and DREAMS 世界巡回演唱会 广州站', '陈奕迅', '演唱会', '广州', '广州宝能国际体育演艺中心', `${days(54)} 19:30`, [480, 780, 1080, 1480], '/img/events/e6.jpg');
  const e7 = ev('笑果脱口秀城市巡演 深圳站', '多阵容', '脱口秀', '深圳', '深圳保利剧院', `${days(40)} 20:00`, [180, 280, 380], '/img/events/e7.jpg');
  const e8 = ev('音乐剧《剧院魅影》中文版 上海站', '音乐剧剧组', '音乐剧', '上海', '上海大剧院', `${days(72)} 19:30`, [280, 480, 680, 880, 1080], '/img/events/e8.jpg');

  const insListing = db.prepare(`INSERT INTO listings(event_id,seller_id,seat_info,face_value,price,premium_rate,quantity,ticket_type,transfer_method,source_channel,proof,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const L = (e, s, seat, face, price, q, tt, tm, sc, status, created) =>
    insListing.run(e, s, seat, face, price, +(price / face - 1).toFixed(4), q, tt, tm, sc, 'order-screenshot.jpg', status, created).lastInsertRowid;

  const l1 = L(e1, sellerB, '内场 A2 区 12 排 8 座', 2080, 2080, 1, '电子票-官方转赠', '大麦 APP 官方转赠通道，过户后不可撤销', '主办方公开售票（授权代理）', 'active', '2026-09-18 11:00:00');
  const l2 = L(e1, sellerA, '看台 580 档 22 排 3 座', 580, 580, 2, '电子票-官方转赠', '大麦 APP 官方转赠通道', '个人自购（行程冲突转让）', 'active', '2026-09-19 15:30:00');
  const l3 = L(e2, sellerB, '内场 1280 档 5 排 1-2 座', 1280, 1280, 2, '电子票-官方转赠', '猫眼官方转赠', '主办方公开售票（授权代理）', 'active', '2026-09-15 09:20:00');
  L(e3, sellerA, '单日票 普通区', 520, 480, 3, '电子票-官方转赠', '纷玩岛转赠', '个人自购', 'active', '2026-09-20 20:10:00');
  const l5 = L(e4, sellerB, '一楼 8 排 6 座', 780, 700, 1, '纸质票', '顺丰保价邮寄，演出前 3 天发出', '剧院公开售票（授权代理）', 'active', '2026-09-12 14:00:00');
  const l6 = L(e5, sellerA, '东看台 12 区', 80, 80, 4, '实名录入', '卖家陪同现场录入观演人身份证信息', '个人自购（预约摇号中签）', 'active', '2026-09-19 08:40:00');
  const l7 = L(e6, sellerB, '看台 780 档 3 排 5 座', 780, 780, 1, '电子票-官方转赠', '大麦 APP 官方转赠通道', '主办方公开售票（授权代理）', 'active', '2026-09-17 18:00:00');
  const l8 = L(e7, sellerA, '一楼 5 排 9 座', 380, 340, 2, '电子票-官方转赠', '票星球转赠', '个人自购', 'active', '2026-09-16 12:30:00');
  const l9 = L(e8, sellerB, '一楼 2 排 4 座', 1080, 1080, 1, '纸质票', '顺丰保价邮寄', '主办方公开售票（授权代理）', 'active', '2026-09-10 10:00:00');
  L(e2, sellerC, '看台 380 档 9 排 11 座', 380, 800, 1, '电子票-官方转赠', '来源不明', '自称内部渠道', 'offline', '2026-09-14 16:00:00');

  const insOrder = db.prepare(`INSERT INTO orders(order_no,listing_id,event_id,buyer_id,seller_id,quantity,ticket_amount,buyer_fee,total_amount,commission,seller_income,attendee_name,attendee_id_card,status,created_at,paid_at,transferred_at,completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insLedger = db.prepare(`INSERT INTO ledger(order_id,account,entry_type,amount,direction,note,created_at) VALUES (?,?,?,?,?,?,?)`);
  const settle = (oid, t, fee, comm, at) => {
    insLedger.run(oid, 'escrow', 'escrow_in', t, 'in', '买家支付，资金托管', at);
    insLedger.run(oid, 'escrow', 'escrow_out', t, 'out', '交易完成，托管资金划出', at);
    insLedger.run(oid, 'platform_revenue', 'commission', comm, 'in', '卖家佣金收入', at);
    insLedger.run(oid, 'platform_revenue', 'buyer_fee', fee, 'in', '买家服务费收入', at);
    insLedger.run(oid, 'seller_payable', 'seller_payout', t - fee - comm, 'out', '卖家货款结算', at);
  };
  const done = (no, l, e, b, s, q, price, at) => {
    const t = price * q, fee = +(t * 0.05).toFixed(2), comm = +(t * 0.08).toFixed(2);
    insOrder.run(no, l, e, b, s, q, t, fee, t + fee, comm, t - comm, '李晓', '440***********6677', 'completed', at, at, at, at);
    settle(insOrderLastId(), t, fee, comm, at);
  };
  const insOrderLastId = () => db.prepare('SELECT last_insert_rowid() AS id').get().id;
  done('TT202606180001', l9, e8, buyerDemo, sellerB, 1, 1150, '2026-06-18 20:11:00');
  done('TT202607090002', l3, e2, buyerDemo, sellerB, 2, 1590, '2026-07-09 12:02:00');
  done('TT202608050003', l5, e4, buyerDemo, sellerB, 1, 700, '2026-08-05 09:45:00');
  done('TT202608270004', l8, e7, buyerDemo, sellerA, 2, 340, '2026-08-27 22:31:00');
  done('TT202609080005', l7, e6, buyerDemo, sellerB, 1, 950, '2026-09-08 19:20:00');

  const t = 1590, refundFee = +(t * 0.3).toFixed(2);
  insOrder.run('TT202609100006', l3, e2, buyerDemo, sellerB, 1, t, +(t * 0.05).toFixed(2), t + +(t * 0.05).toFixed(2), +(t * 0.08).toFixed(2), t - +(t * 0.08).toFixed(2), '李晓', '440***********6677', 'refunded', '2026-09-10 10:00:00', '2026-09-10 10:05:00', null, null);
  const rid = insOrderLastId();
  db.prepare(`UPDATE orders SET refund_fee_rate=0.3, refund_fee=?, refund_amount=?, refund_reason='行程冲突，距开演 5 天按 30% 阶梯退票', closed_at='2026-09-11 09:00:00' WHERE id=?`)
    .run(refundFee, +(t * 1.05 - refundFee).toFixed(2), rid);
  insLedger.run(rid, 'escrow', 'escrow_in', t * 1.05, 'in', '买家支付，资金托管', '2026-09-10 10:05:00');
  insLedger.run(rid, 'escrow', 'refund_out', +(t * 1.05 - refundFee).toFixed(2), 'out', '退款返还买家', '2026-09-11 09:00:00');
  insLedger.run(rid, 'platform_revenue', 'refund_fee', refundFee, 'in', '阶梯退票手续费', '2026-09-11 09:00:00');
  insLedger.run(rid, 'escrow', 'escrow_out', refundFee, 'out', '退票手续费划转平台', '2026-09-11 09:00:00');

  insOrder.run('TT202609190007', l2, e1, buyerDemo, sellerA, 1, 660, 33, 693, 52.8, 607.2, '李晓', '440***********6677', 'disputed', '2026-09-19 16:00:00', '2026-09-19 16:02:00', null, null);
  const did = insOrderLastId();
  insLedger.run(did, 'escrow', 'escrow_in', 693, 'in', '买家支付，资金托管', '2026-09-19 16:02:00');
  db.prepare(`INSERT INTO disputes(order_id,opened_by,reason,status,created_at) VALUES (?,?,?,?,?)`)
    .run(did, 'buyer', '卖家承诺 24 小时内转赠，已超过 48 小时仍未收到票，要求平台介入。', 'open', '2026-09-21 09:30:00');

  const insCost = db.prepare(`INSERT INTO costs(period,category,amount,note,created_at) VALUES (?,?,?,?,?)`);
  insCost.run('2026Q2', '赔付支出', 1200, 'TT202605 订单先行赔付（卖家未履约）', '2026-06-30 18:00:00');
  insCost.run('2026Q2', '运营成本', 8600, '服务器、短信、客服人力', '2026-06-30 18:00:00');
  insCost.run('2026Q3', '运营成本', 12800, '服务器、短信、客服人力、推广', '2026-09-20 18:00:00');
  insCost.run('2026Q3', '赔付支出', 693, '纠纷订单 TT202609190007 拟先行赔付', '2026-09-21 09:40:00');
  insLedger.run(null, 'compensation_fund', 'fund_in', 50000, 'in', '平台划拨先行赔付基金初始资金', '2026-01-01 09:00:00');

  // ---------- 粉丝社区种子数据 ----------
  const sellerD = insUser.run('13988889999', '张大力', '320***********8899', 'user', 1, 'personal', null, null, 'none', 0, '2026-09-18 10:00:00').lastInsertRowid;
  const insPost = db.prepare(`INSERT INTO posts(user_id,event_id,kind,title,content,face_value,price,quantity,transfer_method,proof,contact,verify_status,risk_flag,status,views,comment_count,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insComment = db.prepare(`INSERT INTO comments(post_id,user_id,content,risk_flag,created_at) VALUES (?,?,?,?,?)`);

  const p1 = insPost.run(sellerA, e1, 'selling', '周杰伦上海站内场 A2 区 1 张，大麦官方转赠过户',
    '行程冲突转让。大麦 APP 内官方转赠通道直接过户到你名下，转赠完成你在自己大麦账户里能查到票，确认无误再说别的。不走任何私下转账，可全程录屏。',
    2080, 2080, 1, '大麦 APP 官方转赠', 'damai-order-20260918.jpg', '微信：jay-fan-0927（备注"票流转"）', 'verified', 0, 'open', 126, 2, '2026-09-19 14:20:00', '2026-09-20 10:00:00').lastInsertRowid;
  const p2 = insPost.run(buyerDemo, e2, 'wanted', '求凤凰传奇北京站连座 2 张，接受小幅溢价',
    '带爸妈去看，需要连座。只接受官方转赠通道过户（大麦/猫眼均可），当面核验后再付。有票的朋友留言，我看到会回。',
    null, null, 2, '官方转赠', '', 'QQ：88552211', 'none', 0, 'open', 89, 1, '2026-09-20 09:15:00', '2026-09-20 09:15:00').lastInsertRowid;
  const p3 = insPost.run(sellerA, e3, 'swap', '成都草莓单日票换其他城市场次，可补差价',
    '手上有成都草莓 10.24 单日票 1 张（520 档），临时要出差，想换其他城市的音乐节，差价好商量。只走官方转赠互换，各自在自己账户收票。',
    520, null, 1, '官方转赠互换', 'order-caomei.jpg', '微信：caomei-swap-cd', 'none', 0, 'open', 45, 0, '2026-09-20 21:05:00', '2026-09-20 21:05:00').lastInsertRowid;
  const p4 = insPost.run(buyerDemo, null, 'discuss', '提醒：最近有人冒充大麦客服私信卖票，别私下转账！',
    '昨天收到私信自称"大麦内部客服"，说有周杰伦内场票，让我先付 500 定金锁票，尾款转微信。我让他走官方转赠，对方立马拉黑我。大家记住：客服不会私信卖票，官方票只在大麦 APP 内流转。',
    null, null, 1, '', '', '', 'none', 1, 'open', 342, 2, '2026-09-21 08:40:00', '2026-09-21 08:40:00').lastInsertRowid;
  insPost.run(sellerB, e6, 'selling', '陈奕迅广州站看台 780 档 2 张，猫眼官方转赠（凭证审核中）',
    '公司客户答谢剩余票，猫眼官方转赠通道过户，支持进场后确认。购票凭证已提交平台验真，徽章下来之前大家也可以先看座位图。',
    780, 780, 2, '猫眼官方转赠', 'maoyan-order-e6.pdf', '微信：xinghui-ticket（工作时间在线）', 'pending', 0, 'open', 37, 0, '2026-09-21 10:10:00', '2026-09-21 10:10:00').lastInsertRowid;
  const p6 = insPost.run(sellerD, e5, 'selling', '苏超南京 vs 苏州东看台 2 张，先到先得',
    '票不多，要的抓紧。先付 50 定金锁票，加微信发收款码，尾款见面给。不方便走官方渠道，懂的都懂。',
    80, 80, 2, '线下面交', '', '', 'none', 1, 'open', 210, 1, '2026-09-21 11:30:00', '2026-09-21 11:30:00').lastInsertRowid;

  insComment.run(p1, buyerDemo, '请问是几张连座？转赠是大麦"转赠"入口直接操作吗，想确认下流程。', 0, '2026-09-19 16:00:00');
  insComment.run(p1, sellerA, '单张。对，大麦 APP 订单详情里点"转赠"，输你手机号就行，你在自己票夹里能看到。', 0, '2026-09-19 16:20:00');
  insComment.run(p2, sellerB, '我们这边有 1280 档连座，已走平台在售，可官方转赠。', 0, '2026-09-20 11:00:00');
  insComment.run(p4, sellerA, '顶一下，上周也遇到同样话术，一说官方转赠对面就消失了。', 0, '2026-09-21 09:00:00');
  insComment.run(p4, buyerDemo, '对，识别方法很简单：不肯走官方转赠通道的，百分百有问题。', 0, '2026-09-21 09:12:00');
  insComment.run(p6, buyerDemo, '提醒：此帖要求先付定金+加微信，涉嫌站外交易，已举报。大家不要私下转账。', 1, '2026-09-21 12:00:00');

  db.prepare(`INSERT INTO reports(post_id,reporter_id,reason,status,created_at) VALUES (?,?,?,?,?)`)
    .run(p6, buyerDemo, '该帖要求先付定金并引导加微信私下交易，疑似诈骗话术，请平台核查处理。', 'open', '2026-09-21 12:05:00');
}

initSchema();

if (require.main === module && process.argv.includes('--reset')) {
  resetDatabase();
  seed();
  console.log('数据库已重建并写入种子数据：', DB_PATH);
}

module.exports = { db, initSchema, resetDatabase, seed, now };
