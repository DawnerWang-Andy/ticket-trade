// API 路由：/api/* 买家卖家端 + /api/admin/* 平台经营后台
const crypto = require('node:crypto');
const { db, now } = require('./db');
const D = require('./domain');

// ---------- 会话 ----------
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?`).get(token) || null;
}
function requireUser(req) {
  const u = authUser(req);
  if (!u) throw D.httpError(401, '请先登录');
  return u;
}
function requireAdmin(req) {
  const u = requireUser(req);
  if (u.role !== 'admin') throw D.httpError(403, '需要平台管理员权限');
  return u;
}

const pubUser = (u) => ({
  id: u.id, phone: u.phone, name: u.name, role: u.role,
  real_name_verified: !!u.real_name_verified, id_card: u.id_card,
  seller_type: u.seller_type, business_license: u.business_license,
  performance_permit: u.performance_permit, merchant_status: u.merchant_status,
  balance: u.balance, created_at: u.created_at
});

const LISTING_SQL = `
  SELECT l.*, e.title AS event_title, e.artist, e.category, e.city, e.venue, e.event_date, e.image,
         u.name AS seller_name, u.seller_type, u.real_name_verified AS seller_verified, u.merchant_status
  FROM listings l JOIN events e ON e.id=l.event_id JOIN users u ON u.id=l.seller_id`;

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('POST', '/api/auth/login', (req, res, body) => {
  const { phone, name } = body;
  if (!D.validPhone(phone)) throw D.httpError(400, '请输入有效的 11 位手机号');
  if (!name || !String(name).trim()) throw D.httpError(400, '请输入昵称');
  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!user) {
    db.prepare('INSERT INTO users(phone,name) VALUES (?,?)').run(phone, String(name).trim());
    user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id) VALUES (?,?)').run(token, user.id);
  return { token, user: pubUser(user) };
});
route('POST', '/api/auth/logout', (req) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  return { ok: true };
});
route('GET', '/api/me', (req) => ({ user: pubUser(requireUser(req)) }));

route('PUT', '/api/me/realname', (req, res, body) => {
  const u = requireUser(req);
  const { real_name, id_card } = body;
  if (!real_name || String(real_name).trim().length < 2) throw D.httpError(400, '请输入真实姓名');
  if (!D.validIdCard(id_card)) throw D.httpError(400, '身份证号格式不正确（18 位）');
  const masked = D.maskIdCard(id_card);
  db.prepare('UPDATE users SET name=?, id_card=?, real_name_verified=1 WHERE id=?').run(String(real_name).trim(), masked, u.id);
  return { user: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)), note: '已通过实名核验（演示环境为模拟核验）' };
});

route('POST', '/api/me/merchant', (req, res, body) => {
  const u = requireUser(req);
  if (!u.real_name_verified) throw D.httpError(403, '请先完成实名认证');
  const { business_license, performance_permit } = body;
  if (!business_license || !performance_permit)
    throw D.httpError(400, '须提供《营业执照》统一社会信用代码与《营业性演出许可证》编号');
  db.prepare(`UPDATE users SET seller_type='business', business_license=?, performance_permit=?, merchant_status='pending' WHERE id=?`)
    .run(business_license, performance_permit, u.id);
  return { user: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)), note: '资质已提交，等待平台审核' };
});

route('GET', '/api/meta/settings', () => {
  const s = D.allSettings();
  return {
    platform_name: s.platform_name, disclaimer: s.disclaimer,
    commission_rate: +s.commission_rate, buyer_service_fee_rate: +s.buyer_service_fee_rate,
    price_cap_multiplier: +s.price_cap_multiplier, refund_tiers: JSON.parse(s.refund_tiers)
  };
});

route('GET', '/api/events', (req, res, body, q) => {
  let sql = 'SELECT * FROM events WHERE 1=1'; const args = [];
  if (q.get('category')) { sql += ' AND category=?'; args.push(q.get('category')); }
  if (q.get('city')) { sql += ' AND city=?'; args.push(q.get('city')); }
  if (q.get('q')) { sql += ' AND (title LIKE ? OR artist LIKE ?)'; args.push(`%${q.get('q')}%`, `%${q.get('q')}%`); }
  sql += ' ORDER BY event_date ASC';
  return { events: db.prepare(sql).all(...args).map(e => ({ ...e, face_values: JSON.parse(e.face_values) })) };
});
route('GET', '/api/listings', (req, res, body, q) => {
  let sql = LISTING_SQL + ` WHERE l.status='active'`; const args = [];
  if (q.get('category')) { sql += ' AND e.category=?'; args.push(q.get('category')); }
  if (q.get('city')) { sql += ' AND e.city=?'; args.push(q.get('city')); }
  if (q.get('q')) { sql += ' AND (e.title LIKE ? OR e.artist LIKE ?)'; args.push(`%${q.get('q')}%`, `%${q.get('q')}%`); }
  const sort = q.get('sort');
  sql += sort === 'price_asc' ? ' ORDER BY l.price ASC'
    : sort === 'price_desc' ? ' ORDER BY l.price DESC'
    : sort === 'date' ? ' ORDER BY e.event_date ASC'
    : ' ORDER BY l.created_at DESC';
  return { listings: db.prepare(sql).all(...args) };
});
route('GET', '/api/listings/:id', (req, res, body, q, params) => {
  const l = db.prepare(LISTING_SQL + ' WHERE l.id=?').get(params.id);
  if (!l) throw D.httpError(404, '票品不存在');
  const breakdown = D.priceOrder(l, 1);
  return { listing: l, fee_breakdown: breakdown };
});
route('POST', '/api/listings', (req, res, body) => {
  const u = requireUser(req);
  const { event_id, seat_info, face_value, price, quantity, ticket_type, transfer_method, source_channel, proof, declaration } = body;
  if (!declaration) throw D.httpError(400, '发布前须勾选《票源真实性与合规承诺》');
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(event_id);
  if (!event) throw D.httpError(404, '演出不存在');
  const qty = Math.max(1, Math.min(10, parseInt(quantity) || 1));
  const { premium_rate } = D.checkListing({ seller: u, face_value: +face_value, price: +price });
  const info = db.prepare(`INSERT INTO listings(event_id,seller_id,seat_info,face_value,price,premium_rate,quantity,ticket_type,transfer_method,source_channel,proof,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'active')`)
    .run(event_id, u.id, String(seat_info || ''), +face_value, +price, premium_rate, qty,
      String(ticket_type || ''), String(transfer_method || ''), String(source_channel || ''), String(proof || ''));
  return { id: info.lastInsertRowid, status: 'active', note: '票品已发布并进入平台公示' };
});

route('GET', '/api/orders', (req) => {
  const u = requireUser(req);
  const orders = db.prepare(`
    SELECT o.*, e.title AS event_title, e.event_date, e.city, e.venue, e.category,
           l.seat_info, l.face_value, l.ticket_type, l.transfer_method,
           bu.name AS buyer_name, su.name AS seller_name
    FROM orders o
    JOIN events e ON e.id=o.event_id JOIN listings l ON l.id=o.listing_id
    JOIN users bu ON bu.id=o.buyer_id JOIN users su ON su.id=o.seller_id
    WHERE o.buyer_id=? OR o.seller_id=? ORDER BY o.created_at DESC`).all(u.id, u.id);
  return { orders };
});
route('POST', '/api/orders', (req, res, body) => {
  const u = requireUser(req);
  if (!u.real_name_verified) throw D.httpError(403, '买家须先完成实名认证（强实名要求）');
  const { listing_id, quantity, attendee_name, attendee_id_card } = body;
  if (!attendee_name || String(attendee_name).trim().length < 2) throw D.httpError(400, '请填写观演人姓名');
  if (!D.validIdCard(attendee_id_card)) throw D.httpError(400, '观演人身份证号格式不正确（一人一证一票）');
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(listing_id);
  if (!l || l.status !== 'active') throw D.httpError(404, '票品不存在或已下架');
  if (l.seller_id === u.id) throw D.httpError(400, '不能购买自己发布的票品');
  const qty = Math.max(1, parseInt(quantity) || 1);
  if (qty > l.quantity) throw D.httpError(400, `库存不足（仅剩 ${l.quantity} 张）`);
  const p = D.priceOrder(l, qty);
  const info = db.prepare(`INSERT INTO orders(order_no,listing_id,event_id,buyer_id,seller_id,quantity,ticket_amount,buyer_fee,total_amount,commission,seller_income,attendee_name,attendee_id_card,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_payment')`)
    .run(D.newOrderNo(), l.id, l.event_id, u.id, l.seller_id, qty, p.ticket_amount, p.buyer_fee,
      p.total_amount, p.commission, p.seller_income, String(attendee_name).trim(), D.maskIdCard(attendee_id_card));
  return { id: info.lastInsertRowid, ...p, status: 'pending_payment' };
});

function getOrderForUser(req, id, allow) {
  const u = requireUser(req);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) throw D.httpError(404, '订单不存在');
  const roles = [allow].flat();
  const ok = u.role === 'admin' || roles.some(r => (r === 'buyer' ? o.buyer_id === u.id : o.seller_id === u.id));
  if (!ok) throw D.httpError(403, '无权操作该订单');
  return { u, o };
}
route('POST', '/api/orders/:id/pay', (req, res, body, q, params) => {
  const { o } = getOrderForUser(req, params.id, 'buyer');
  if (o.status !== 'pending_payment') throw D.httpError(409, '订单状态不允许支付');
  // 支付时锁定并扣减库存，防止超卖；售罄自动标记
  const l = db.prepare('SELECT * FROM listings WHERE id=?').get(o.listing_id);
  if (!l || l.quantity < o.quantity || l.status !== 'active') {
    db.prepare(`UPDATE orders SET status='cancelled', closed_at=? WHERE id=?`).run(now(), o.id);
    throw D.httpError(409, '票品已售罄或下架，订单已自动取消');
  }
  const newQty = l.quantity - o.quantity;
  db.prepare('UPDATE listings SET quantity=?, status=? WHERE id=?').run(newQty, newQty === 0 ? 'sold' : 'active', l.id);
  db.prepare(`UPDATE orders SET status='paid_escrow', paid_at=? WHERE id=?`).run(now(), o.id);
  D.ledger(o.id, 'escrow', 'escrow_in', o.total_amount, 'in', '买家支付，资金进入第三方托管');
  return { status: 'paid_escrow', note: '支付成功，票款已由托管账户锁定，确认收票后才会结算给卖家' };
});
route('POST', '/api/orders/:id/transfer', (req, res, body, q, params) => {
  const { o } = getOrderForUser(req, params.id, 'seller');
  if (o.status !== 'paid_escrow') throw D.httpError(409, '订单状态不允许标记转赠');
  db.prepare(`UPDATE orders SET status='transferred', transferred_at=? WHERE id=?`).run(now(), o.id);
  return { status: 'transferred', note: '已标记完成官方转赠，等待买家确认收票' };
});
route('POST', '/api/orders/:id/confirm', (req, res, body, q, params) => {
  const { o } = getOrderForUser(req, params.id, 'buyer');
  if (o.status !== 'transferred') throw D.httpError(409, '卖家尚未完成转赠');
  D.settleOrder(o);
  return { status: 'completed', note: '已确认收票，托管资金完成结算' };
});
route('POST', '/api/orders/:id/refund', (req, res, body, q, params) => {
  const { o } = getOrderForUser(req, params.id, 'buyer');
  if (!['pending_payment', 'paid_escrow'].includes(o.status)) throw D.httpError(409, '当前状态不可退票（已进入转赠流程，如有问题请发起纠纷）');
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(o.event_id);
  if (o.status === 'pending_payment') {
    db.prepare(`UPDATE orders SET status='cancelled', closed_at=? WHERE id=?`).run(now(), o.id);
    db.prepare(`UPDATE listings SET quantity=quantity+?, status='active' WHERE id=?`).run(o.quantity, o.listing_id);
    return { status: 'cancelled', note: '未付款订单已取消' };
  }
  const tier = D.refundTierFor(event.event_date);
  if (tier.fee >= 1) throw D.httpError(422, '距开演不足可退期限（当前阶梯手续费率 100%），本场演出已不可退票');
  const fee = D.r2(o.ticket_amount * tier.fee);
  const refund = D.r2(o.total_amount - fee);
  db.prepare(`UPDATE orders SET status='refunded', refund_fee_rate=?, refund_fee=?, refund_amount=?, refund_reason=?, closed_at=? WHERE id=?`)
    .run(tier.fee, fee, refund, body.reason || '买家主动退票', now(), o.id);
  db.prepare(`UPDATE listings SET quantity=quantity+?, status='active' WHERE id=?`).run(o.quantity, o.listing_id);
  D.ledger(o.id, 'escrow', 'refund_out', refund, 'out', '退款返还买家');
  if (fee > 0) {
    D.ledger(o.id, 'platform_revenue', 'refund_fee', fee, 'in', `阶梯退票手续费（${(tier.fee * 100).toFixed(0)}%）`);
    D.ledger(o.id, 'escrow', 'escrow_out', fee, 'out', '退票手续费划转平台');
  }
  return { status: 'refunded', refund_fee_rate: tier.fee, refund_fee: fee, refund_amount: refund, days_left: tier.daysLeft };
});
route('POST', '/api/orders/:id/dispute', (req, res, body, q, params) => {
  const { u, o } = getOrderForUser(req, params.id, ['buyer', 'seller']);
  if (!['paid_escrow', 'transferred'].includes(o.status)) throw D.httpError(409, '当前状态不可发起纠纷');
  if (!body.reason || String(body.reason).trim().length < 5) throw D.httpError(400, '请描述纠纷原因（不少于 5 个字）');
  db.prepare('INSERT INTO disputes(order_id,opened_by,reason,status) VALUES (?,?,?,?)')
    .run(o.id, o.buyer_id === u.id ? 'buyer' : 'seller', String(body.reason).trim(), 'open');
  db.prepare(`UPDATE orders SET status='disputed' WHERE id=?`).run(o.id);
  return { status: 'disputed', note: '纠纷已提交，平台客服将在 24 小时内介入处理' };
});

// ---------- 粉丝社区（Fans-to-Fans，无在线交易） ----------
const POST_KINDS = ['selling', 'wanted', 'swap', 'discuss'];
// 资金类高危话术：命中仅做风险标记与提示，不直接拦截（避免误伤防骗科普帖）。
// 联系方式（微信/QQ/电话）本身不算风险——社区允许发帖人自愿公开联系方式私聊。
const SCAM_PATTERN = /(先付定金|付定金|定金锁|私下转账|先款后票|收款码|先打款|押金)/i;
const riskOf = (text) => (SCAM_PATTERN.test(String(text || '')) ? 1 : 0);

function requireRealnamed(req) {
  const u = requireUser(req);
  if (!u.real_name_verified) throw D.httpError(403, '社区实行全实名制，请先完成实名认证');
  return u;
}
const postAuthor = (p) => db.prepare('SELECT id,name,seller_type,real_name_verified,merchant_status,created_at FROM users WHERE id=?').get(p.user_id);

route('GET', '/api/forum/posts', (req, res, body, q) => {
  let sql = `SELECT p.*, e.title AS event_title, e.event_date, e.city, e.category,
             e.image,
             u.name AS author_name, u.seller_type, u.merchant_status, u.real_name_verified AS author_verified
             FROM posts p LEFT JOIN events e ON e.id=p.event_id JOIN users u ON u.id=p.user_id
             WHERE p.status='open'`;
  const args = [];
  if (q.get('kind')) { sql += ' AND p.kind=?'; args.push(q.get('kind')); }
  if (q.get('event_id')) { sql += ' AND p.event_id=?'; args.push(+q.get('event_id')); }
  if (q.get('q')) { sql += ' AND (p.title LIKE ? OR p.content LIKE ? OR e.title LIKE ?)'; args.push(`%${q.get('q')}%`, `%${q.get('q')}%`, `%${q.get('q')}%`); }
  sql += q.get('sort') === 'hot' ? ' ORDER BY p.comment_count DESC, p.views DESC'
    : q.get('sort') === 'date' ? ' ORDER BY e.event_date ASC'
    : ' ORDER BY p.created_at DESC';
  sql += ' LIMIT 100';
  return { posts: db.prepare(sql).all(...args) };
});
route('GET', '/api/forum/posts/:id', (req, res, body, q, params) => {
  db.prepare('UPDATE posts SET views=views+1 WHERE id=?').run(params.id);
  const p = db.prepare(`SELECT p.*, e.title AS event_title, e.event_date, e.city, e.venue, e.category, e.image
    FROM posts p LEFT JOIN events e ON e.id=p.event_id WHERE p.id=?`).get(params.id);
  if (!p || p.status === 'hidden') throw D.httpError(404, '帖子不存在或已被隐藏');
  // 联系方式仅对"已登录且已实名"的用户公开，其余访客只见占位提示（保护发帖人隐私、留痕可追溯）
  const viewer = authUser(req);
  if (p.contact && !(viewer && viewer.real_name_verified)) {
    p.contact_locked = true;
    p.contact = '';
  }
  const author = postAuthor(p);
  const comments = db.prepare(`SELECT c.*, u.name AS author_name, u.seller_type, u.merchant_status, u.real_name_verified AS author_verified
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND c.status='visible' ORDER BY c.created_at ASC`).all(p.id);
  return { post: p, author, comments };
});
route('POST', '/api/forum/posts', (req, res, body) => {
  const u = requireRealnamed(req);
  const { kind, event_id, title, content, face_value, price, quantity, transfer_method, proof, contact, declaration } = body;
  if (!POST_KINDS.includes(kind)) throw D.httpError(400, '帖子类型不正确');
  if (!title || String(title).trim().length < 4) throw D.httpError(400, '标题至少 4 个字');
  if (!content || String(content).trim().length < 10) throw D.httpError(400, '正文至少 10 个字，请把交易条件写清楚');
  if (kind !== 'discuss') {
    const ev = db.prepare('SELECT * FROM events WHERE id=?').get(event_id);
    if (!ev) throw D.httpError(400, '转票/求票/换票必须关联演出');
  }
  let verify = 'none';
  if (kind === 'selling') {
    if (!(+face_value > 0) || !(+price > 0)) throw D.httpError(400, '转票须填写票面价与转让价');
    const cap = D.getNum('price_cap_multiplier');
    if (+price > +face_value * cap)
      throw D.httpError(422, cap <= 1
        ? '转让价不得超过票面价。依据《营业性演出管理条例实施细则》禁止加价倒卖演出票券，社区仅允许原价或折价转让'
        : `转让价超出社区价格上限（票面价 × ${cap}）。社区不允许高价倒票`);
    if (!declaration) throw D.httpError(400, '转票须勾选《真实性与合规承诺》');
    verify = proof ? 'pending' : 'none';
  }
  const risk = riskOf(title + ' ' + content);
  const info = db.prepare(`INSERT INTO posts(user_id,event_id,kind,title,content,face_value,price,quantity,transfer_method,proof,contact,verify_status,risk_flag)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(u.id, kind === 'discuss' ? null : +event_id, kind, String(title).trim(), String(content).trim(),
      +face_value || null, +price || null, Math.max(1, parseInt(quantity) || 1),
      String(transfer_method || ''), String(proof || ''), String(contact || '').slice(0, 60), verify, risk);
  return {
    id: info.lastInsertRowid, verify_status: verify, risk_flag: risk,
    note: verify === 'pending' ? '已发布。购票凭证已提交平台验真，通过后展示"已验真"徽章'
      : risk ? '已发布。检测到定金/私下转账类表述，已标记供平台巡查；私下付款无担保，请谨慎'
      : '发布成功'
  };
});
route('POST', '/api/forum/posts/:id/status', (req, res, body, q, params) => {
  const u = requireUser(req);
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(params.id);
  if (!p) throw D.httpError(404, '帖子不存在');
  if (p.user_id !== u.id && u.role !== 'admin') throw D.httpError(403, '只有发帖人可以操作');
  const status = u.role === 'admin' && body.status === 'hidden' ? 'hidden' : body.status;
  if (!['open', 'done', 'hidden'].includes(status)) throw D.httpError(400, '非法状态');
  db.prepare('UPDATE posts SET status=?, updated_at=? WHERE id=?').run(status, now(), p.id);
  return { ok: true, status };
});
route('POST', '/api/forum/posts/:id/comments', (req, res, body, q, params) => {
  const u = requireRealnamed(req);
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(params.id);
  if (!p || p.status !== 'open') throw D.httpError(404, '帖子不存在或已关闭');
  const content = String(body.content || '').trim();
  if (content.length < 2) throw D.httpError(400, '评论至少 2 个字');
  if (content.length > 500) throw D.httpError(400, '评论最多 500 字');
  const risk = riskOf(content);
  const info = db.prepare('INSERT INTO comments(post_id,user_id,content,risk_flag) VALUES (?,?,?,?)').run(p.id, u.id, content, risk);
  db.prepare('UPDATE posts SET comment_count=comment_count+1, updated_at=? WHERE id=?').run(now(), p.id);
  return { id: info.lastInsertRowid, risk_flag: risk, note: risk ? '已发布。提醒：私下转账、先付定金均无担保，请谨慎甄别，谨防诈骗' : '已发布' };
});
route('POST', '/api/forum/reports', (req, res, body) => {
  const u = requireUser(req);
  const { post_id, comment_id, reason } = body;
  if (!post_id && !comment_id) throw D.httpError(400, '缺少举报对象');
  if (!reason || String(reason).trim().length < 5) throw D.httpError(400, '请描述举报原因（不少于 5 个字）');
  if (post_id && !db.prepare('SELECT id FROM posts WHERE id=?').get(post_id)) throw D.httpError(404, '帖子不存在');
  const info = db.prepare('INSERT INTO reports(post_id,comment_id,reporter_id,reason) VALUES (?,?,?,?)')
    .run(post_id || null, comment_id || null, u.id, String(reason).trim());
  return { id: info.lastInsertRowid, note: '举报已提交，平台将在 24 小时内核查处理' };
});

// 社区管理（后台）
route('GET', '/api/admin/forum/overview', (req) => {
  requireAdmin(req);
  return {
    pending_verify: db.prepare(`SELECT COUNT(*) v FROM posts WHERE verify_status='pending'`).get().v,
    open_reports: db.prepare(`SELECT COUNT(*) v FROM reports WHERE status='open'`).get().v,
    total_posts: db.prepare('SELECT COUNT(*) v FROM posts').get().v,
    risk_flagged: db.prepare(`SELECT COUNT(*) v FROM posts WHERE risk_flag=1 AND status='open'`).get().v
  };
});
route('GET', '/api/admin/forum/posts', (req, res, body, q) => {
  requireAdmin(req);
  let sql = `SELECT p.*, e.title AS event_title, u.name AS author_name, u.real_name_verified AS author_verified,
    (SELECT COUNT(*) FROM reports r WHERE r.post_id=p.id AND r.status='open') AS open_reports
    FROM posts p LEFT JOIN events e ON e.id=p.event_id JOIN users u ON u.id=p.user_id WHERE 1=1`;
  const args = [];
  const filter = q.get('filter');
  if (filter === 'pending_verify') sql += ` AND p.verify_status='pending'`;
  if (filter === 'reported') sql += ` AND EXISTS (SELECT 1 FROM reports r WHERE r.post_id=p.id AND r.status='open')`;
  if (filter === 'risk') sql += ' AND p.risk_flag=1';
  sql += ' ORDER BY p.created_at DESC LIMIT 200';
  return { posts: db.prepare(sql).all(...args) };
});
route('POST', '/api/admin/forum/posts/:id/verify', (req, res, body, q, params) => {
  requireAdmin(req);
  const action = body.action;
  if (!['verified', 'rejected'].includes(action)) throw D.httpError(400, 'action 须为 verified / rejected');
  db.prepare('UPDATE posts SET verify_status=?, updated_at=? WHERE id=?').run(action, now(), params.id);
  return { ok: true, verify_status: action };
});
route('GET', '/api/admin/forum/reports', (req) => {
  requireAdmin(req);
  return {
    reports: db.prepare(`SELECT r.*, p.title AS post_title, p.id AS pid, u.name AS reporter_name,
      pu.name AS post_author FROM reports r
      LEFT JOIN posts p ON p.id=r.post_id LEFT JOIN users pu ON pu.id=p.user_id
      JOIN users u ON u.id=r.reporter_id ORDER BY r.status='open' DESC, r.created_at DESC`).all()
  };
});
route('POST', '/api/admin/forum/reports/:id/resolve', (req, res, body, q, params) => {
  requireAdmin(req);
  const r = db.prepare('SELECT * FROM reports WHERE id=?').get(params.id);
  if (!r || r.status !== 'open') throw D.httpError(404, '举报不存在或已处理');
  if (body.hide_post && r.post_id) db.prepare(`UPDATE posts SET status='hidden', updated_at=? WHERE id=?`).run(now(), r.post_id);
  if (body.hide_comment && r.comment_id) db.prepare(`UPDATE comments SET status='hidden' WHERE id=?`).run(r.comment_id);
  db.prepare(`UPDATE reports SET status='resolved', resolution=?, resolved_at=? WHERE id=?`)
    .run(String(body.resolution || ''), now(), params.id);
  return { ok: true };
});

// ---------- 平台经营后台 ----------
route('GET', '/api/admin/dashboard', (req) => {
  requireAdmin(req);
  const kpi = {
    gmv: db.prepare(`SELECT COALESCE(SUM(ticket_amount),0) v FROM orders WHERE status IN ('completed','refunded')`).get().v,
    order_total: db.prepare('SELECT COUNT(*) v FROM orders').get().v,
    completed: db.prepare(`SELECT COUNT(*) v FROM orders WHERE status='completed'`).get().v,
    revenue: db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM ledger WHERE account='platform_revenue' AND direction='in'`).get().v,
    escrow: db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM ledger WHERE account='escrow'`).get().v,
    fund: db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM ledger WHERE account='compensation_fund'`).get().v,
    refund_total: db.prepare(`SELECT COALESCE(SUM(refund_amount),0) v FROM orders WHERE status='refunded'`).get().v,
    active_listings: db.prepare(`SELECT COUNT(*) v FROM listings WHERE status='active'`).get().v,
    users: db.prepare('SELECT COUNT(*) v FROM users').get().v,
    open_disputes: db.prepare(`SELECT COUNT(*) v FROM disputes WHERE status='open'`).get().v,
    forum_posts: db.prepare(`SELECT COUNT(*) v FROM posts WHERE status='open'`).get().v,
    forum_pending_verify: db.prepare(`SELECT COUNT(*) v FROM posts WHERE verify_status='pending'`).get().v,
    forum_open_reports: db.prepare(`SELECT COUNT(*) v FROM reports WHERE status='open'`).get().v
  };
  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', o.created_at) AS month, COALESCE(SUM(o.ticket_amount),0) AS gmv,
           COALESCE((SELECT SUM(l.amount) FROM ledger l JOIN orders oo ON oo.id=l.order_id
             WHERE l.account='platform_revenue' AND l.direction='in' AND strftime('%Y-%m', oo.created_at)=strftime('%Y-%m', o.created_at)),0) AS revenue
    FROM orders o WHERE o.status IN ('completed','refunded')
    GROUP BY month ORDER BY month ASC`).all();
  const byCategory = db.prepare(`
    SELECT e.category, COALESCE(SUM(o.ticket_amount),0) AS gmv, COUNT(o.id) AS cnt
    FROM orders o JOIN events e ON e.id=o.event_id
    WHERE o.status IN ('completed','refunded') GROUP BY e.category ORDER BY gmv DESC`).all();
  return { kpi, monthly, byCategory };
});
route('GET', '/api/admin/orders', (req, res, body, q) => {
  requireAdmin(req);
  let sql = `SELECT o.*, e.title AS event_title, e.event_date, bu.name AS buyer_name, su.name AS seller_name
    FROM orders o JOIN events e ON e.id=o.event_id JOIN users bu ON bu.id=o.buyer_id JOIN users su ON su.id=o.seller_id WHERE 1=1`;
  const args = [];
  if (q.get('status')) { sql += ' AND o.status=?'; args.push(q.get('status')); }
  if (q.get('q')) { sql += ' AND (o.order_no LIKE ? OR e.title LIKE ?)'; args.push(`%${q.get('q')}%`, `%${q.get('q')}%`); }
  sql += ' ORDER BY o.created_at DESC LIMIT 200';
  return { orders: db.prepare(sql).all(...args) };
});
route('GET', '/api/admin/users', (req, res, body, q) => {
  requireAdmin(req);
  let sql = `SELECT u.*, (SELECT COUNT(*) FROM listings l WHERE l.seller_id=u.id) AS listing_count,
    (SELECT COALESCE(SUM(o.seller_income),0) FROM orders o WHERE o.seller_id=u.id AND o.status='completed') AS income_total
    FROM users u WHERE 1=1`;
  const args = [];
  if (q.get('q')) { sql += ' AND (u.name LIKE ? OR u.phone LIKE ?)'; args.push(`%${q.get('q')}%`, `%${q.get('q')}%`); }
  if (q.get('merchant') === 'pending') sql += ` AND u.merchant_status='pending'`;
  if (q.get('unverified') === '1') sql += ' AND u.real_name_verified=0';
  sql += ' ORDER BY u.created_at DESC LIMIT 200';
  return { users: db.prepare(sql).all(...args) };
});
route('POST', '/api/admin/users/:id/merchant', (req, res, body, q, params) => {
  requireAdmin(req);
  const action = body.action;
  if (!['approved', 'rejected'].includes(action)) throw D.httpError(400, 'action 须为 approved / rejected');
  db.prepare('UPDATE users SET merchant_status=? WHERE id=?').run(action, params.id);
  return { ok: true, merchant_status: action };
});
route('POST', '/api/admin/users/:id/kyc', (req, res, body, q, params) => {
  requireAdmin(req);
  const v = body.action === 'revoke' ? 0 : 1;
  db.prepare('UPDATE users SET real_name_verified=? WHERE id=?').run(v, params.id);
  return { ok: true, real_name_verified: !!v };
});
route('GET', '/api/admin/listings', (req, res, body, q) => {
  requireAdmin(req);
  let sql = LISTING_SQL + ' WHERE 1=1'; const args = [];
  if (q.get('status')) { sql += ' AND l.status=?'; args.push(q.get('status')); }
  sql += ' ORDER BY l.created_at DESC LIMIT 200';
  return { listings: db.prepare(sql).all(...args), cap: D.getNum('price_cap_multiplier') };
});
route('POST', '/api/admin/listings/:id/status', (req, res, body, q, params) => {
  requireAdmin(req);
  const status = body.status;
  if (!['active', 'offline', 'rejected'].includes(status)) throw D.httpError(400, '非法状态');
  db.prepare('UPDATE listings SET status=? WHERE id=?').run(status, params.id);
  return { ok: true, status };
});
route('GET', '/api/admin/disputes', (req) => {
  requireAdmin(req);
  return {
    disputes: db.prepare(`
      SELECT d.*, o.order_no, o.total_amount, o.status AS order_status, e.title AS event_title,
             bu.name AS buyer_name, su.name AS seller_name
      FROM disputes d JOIN orders o ON o.id=d.order_id JOIN events e ON e.id=o.event_id
      JOIN users bu ON bu.id=o.buyer_id JOIN users su ON su.id=o.seller_id
      ORDER BY d.status='open' DESC, d.created_at DESC`).all()
  };
});
route('POST', '/api/admin/disputes/:id/resolve', (req, res, body, q, params) => {
  requireAdmin(req);
  const d = db.prepare('SELECT * FROM disputes WHERE id=?').get(params.id);
  if (!d || d.status !== 'open') throw D.httpError(404, '纠纷不存在或已处理');
  const { resolution, compensate, compensation } = body;
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(d.order_id);
  if (compensate) {
    D.ledger(o.id, 'escrow', 'refund_out', o.total_amount, 'out', '纠纷判定：全额退款买家（先行赔付）');
    const comp = Math.max(0, +compensation || 0);
    if (comp > 0) D.ledger(o.id, 'compensation_fund', 'compensation_out', comp, 'out', `先行赔付支出（订单 ${o.order_no}）`);
    db.prepare(`UPDATE orders SET status='refunded', refund_amount=?, refund_reason='纠纷判定全额退款', closed_at=? WHERE id=?`).run(o.total_amount, now(), o.id);
    db.prepare(`UPDATE listings SET quantity=quantity+?, status='active' WHERE id=? AND status IN ('active','sold')`).run(o.quantity, o.listing_id);
  } else {
    D.settleOrder(o);
  }
  db.prepare(`UPDATE disputes SET status='resolved', resolution=?, compensation=?, resolved_at=? WHERE id=?`)
    .run(String(resolution || ''), +compensation || 0, now(), params.id);
  return { ok: true };
});
route('GET', '/api/admin/compliance', (req) => {
  requireAdmin(req);
  const cap = D.getNum('price_cap_multiplier');
  const overCap = db.prepare(LISTING_SQL + ' WHERE l.premium_rate > ? - 1 ORDER BY l.premium_rate DESC').all(cap);
  const unverifiedSellers = db.prepare(`
    SELECT u.id, u.name, u.phone, COUNT(l.id) AS active_listings FROM users u
    JOIN listings l ON l.seller_id=u.id AND l.status='active'
    WHERE u.real_name_verified=0 GROUP BY u.id`).all();
  const pendingMerchant = db.prepare(`SELECT COUNT(*) v FROM users WHERE merchant_status='pending'`).get().v;
  return {
    cap, over_cap: overCap, unverified_sellers: unverifiedSellers, pending_merchant: pendingMerchant,
    refund_tiers: JSON.parse(D.getSetting('refund_tiers'))
  };
});
route('GET', '/api/admin/tax', (req, res, body, q) => {
  requireAdmin(req);
  const period = q.get('period') || `${new Date().getFullYear()}Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  return { report: D.taxReport(period), sellers: D.sellerIncomeReport(period), period };
});
route('GET', '/api/admin/tax/report.csv', (req, res, body, q) => {
  requireAdmin(req);
  const period = q.get('period') || `${new Date().getFullYear()}Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const rows = D.sellerIncomeReport(period);
  const head = '平台内经营者名称,经营者类型,证件号码(脱敏),统一社会信用代码,订单数,收入总额(元),支付平台费用(元),收入性质,报送周期';
  const lines = rows.map(r => [
    r.name, r.seller_type === 'business' ? '企业/个体' : '个人', r.id_card || '', r.business_license || '',
    r.order_count, r.income_total.toFixed(2), r.platform_fee_total.toFixed(2), '票务转让经营所得', period
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="tax-report-${period}.csv"`
  });
  res.end('﻿' + head + '\n' + lines.join('\n'));
  return null;
});
route('GET', '/api/admin/costs', (req, res, body, q) => {
  requireAdmin(req);
  let sql = 'SELECT * FROM costs'; const args = [];
  if (q.get('period')) { sql += ' WHERE period=?'; args.push(q.get('period')); }
  sql += ' ORDER BY created_at DESC';
  return { costs: db.prepare(sql).all(...args) };
});
route('POST', '/api/admin/costs', (req, res, body) => {
  requireAdmin(req);
  const { period, category, amount, note } = body;
  if (!/^\d{4}Q[1-4]$/.test(period || '')) throw D.httpError(400, 'period 格式如 2026Q3');
  if (!(+amount > 0)) throw D.httpError(400, '金额必须为正数');
  db.prepare('INSERT INTO costs(period,category,amount,note) VALUES (?,?,?,?)')
    .run(period, String(category || '其他'), +amount, String(note || ''));
  return { ok: true };
});
route('GET', '/api/admin/settings', (req) => { requireAdmin(req); return { settings: D.allSettings() }; });
route('PUT', '/api/admin/settings', (req, res, body) => {
  requireAdmin(req);
  const allowed = ['commission_rate', 'buyer_service_fee_rate', 'price_cap_multiplier', 'refund_tiers', 'vat_rate', 'surcharge_rate', 'cit_rate', 'disclaimer'];
  for (const k of allowed) {
    if (body[k] === undefined) continue;
    // 合规硬约束：价格上限不得超过票面价（细则禁止加价倒卖），管理端不可调高
    if (k === 'price_cap_multiplier' && !(+body[k] > 0 && +body[k] <= 1))
      throw D.httpError(400, '依据平台合规策略，价格上限不得超过票面价（price_cap_multiplier 取值范围 0–1.0）');
    if (k === 'refund_tiers') {
      const tiers = typeof body[k] === 'string' ? JSON.parse(body[k]) : body[k];
      if (!Array.isArray(tiers) || tiers.some(t => typeof t.min_days !== 'number' || typeof t.fee !== 'number'))
        throw D.httpError(400, 'refund_tiers 格式不正确');
      D.setSetting(k, JSON.stringify(tiers));
    } else if (k !== 'disclaimer' && !(+body[k] >= 0)) {
      throw D.httpError(400, `${k} 必须为数字`);
    } else {
      D.setSetting(k, body[k]);
    }
  }
  return { settings: D.allSettings() };
});

// ---------- 分发 ----------
async function handleApi(req, res, pathname, query) {
  const method = req.method;
  const match = routes.find(r => {
    if (r.method !== method) return false;
    const a = r.pattern.split('/'), b = pathname.split('/');
    if (a.length !== b.length) return false;
    return a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
  });
  if (!match) { json(res, 404, { error: '接口不存在' }); return; }
  const params = {};
  match.pattern.split('/').forEach((seg, i) => { if (seg.startsWith(':')) params[seg.slice(1)] = pathname.split('/')[i]; });
  let body = {};
  if (method === 'POST' || method === 'PUT') {
    body = await new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
      req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    });
  }
  try {
    const result = match.handler(req, res, body, query, params);
    if (result !== null && result !== undefined) json(res, 200, result);
  } catch (e) {
    json(res, e.status || 500, { error: e.message || '服务器错误' });
  }
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

module.exports = { handleApi };
