// 领域逻辑：计价、阶梯退票、结算、税务测算、合规校验
const { db, now } = require('./db');

const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
const getNum = (key) => parseFloat(getSetting(key));
const setSetting = (key, value) =>
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
const allSettings = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));

const r2 = (n) => Math.round(n * 100) / 100;

// 证件号脱敏：保留前 3 后 4，中间打码（MVP 不落完整证件号）
function maskIdCard(id) {
  const s = String(id || '').replace(/\s/g, '');
  if (s.length < 8) return null;
  return s.slice(0, 3) + '*'.repeat(s.length - 7) + s.slice(-4);
}
const validIdCard = (id) => /^\d{17}[\dXx]$/.test(String(id || '').replace(/\s/g, ''));
const validPhone = (p) => /^1\d{10}$/.test(String(p || ''));

// 发布校验：实名、溢价上限、票档合理性
function checkListing({ seller, face_value, price }) {
  if (!seller.real_name_verified) throw httpError(403, '卖家须先完成实名认证后才能发布票品');
  if (seller.seller_type === 'business' && seller.merchant_status !== 'approved')
    throw httpError(403, '商家卖家须通过《营业执照》与《营业性演出许可证》资质审核');
  if (!(face_value > 0) || !(price > 0)) throw httpError(400, '票面价与售价必须为正数');
  const cap = getNum('price_cap_multiplier');
  if (price > face_value * cap)
    throw httpError(422, cap <= 1
      ? '售价不得超过票面价。依据《营业性演出管理条例实施细则》禁止加价倒卖演出票券，本平台仅允许原价或折价转让'
      : `售价超出平台价格上限（票面价 × ${cap} = ¥${r2(face_value * cap)}）。为维护市场秩序，平台对价格实行硬性管控`);
  return { premium_rate: +(price / face_value - 1).toFixed(4) };
}

// 下单计价
function priceOrder(listing, quantity) {
  const ticket_amount = r2(listing.price * quantity);
  const buyer_fee = r2(ticket_amount * getNum('buyer_service_fee_rate'));
  const commission = r2(ticket_amount * getNum('commission_rate'));
  return {
    ticket_amount,
    buyer_fee,
    total_amount: r2(ticket_amount + buyer_fee),
    commission,
    seller_income: r2(ticket_amount - commission)
  };
}

// 阶梯退票：按距开演天数取手续费率（文旅部要求建立梯次退票机制）
function refundTierFor(eventDateStr) {
  const tiers = JSON.parse(getSetting('refund_tiers') || '[]').sort((a, b) => b.min_days - a.min_days);
  const daysLeft = Math.floor((new Date(eventDateStr.replace(' ', 'T')) - Date.now()) / 86400000);
  for (const t of tiers) if (daysLeft >= t.min_days) return { ...t, daysLeft };
  return { min_days: 0, fee: 1.0, daysLeft };
}

function ledger(orderId, account, type, amount, direction, note) {
  db.prepare('INSERT INTO ledger(order_id,account,entry_type,amount,direction,note,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(orderId, account, type, r2(amount), direction, note || '', now());
}

// 交易完成结算：托管资金 -> 平台收入(佣金+服务费) + 卖家货款
function settleOrder(order) {
  ledger(order.id, 'escrow', 'escrow_out', order.total_amount, 'out', '交易完成，托管资金划出');
  ledger(order.id, 'platform_revenue', 'commission', order.commission, 'in', '卖家佣金收入');
  ledger(order.id, 'platform_revenue', 'buyer_fee', order.buyer_fee, 'in', '买家服务费收入');
  ledger(order.id, 'seller_payable', 'seller_payout', order.seller_income, 'out', '卖家货款结算');
  db.prepare('UPDATE users SET balance = balance + ? WHERE id=?').run(order.seller_income, order.seller_id);
  db.prepare(`UPDATE orders SET status='completed', completed_at=?, closed_at=? WHERE id=?`).run(now(), now(), order.id);
}

// 税务测算：价税分离 -> 增值税 -> 附加税费 -> 企业所得税估算
function taxReport(period) {
  const [year, q] = [+period.slice(0, 4), +period.slice(5)];
  const start = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  const endMonth = q * 3;
  const lastDay = new Date(year, endMonth, 0).getDate(); // 当月最后一天
  const end = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
  const rows = db.prepare(`
    SELECT entry_type, SUM(amount) AS total FROM ledger
    WHERE account='platform_revenue' AND date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY entry_type`).all(start, end);
  const byType = Object.fromEntries(rows.map(r => [r.entry_type, r.total]));
  const revenueGross = r2((byType.commission || 0) + (byType.buyer_fee || 0) + (byType.refund_fee || 0));
  const vatRate = getNum('vat_rate'), surRate = getNum('surcharge_rate'), citRate = getNum('cit_rate');
  const revenueNet = r2(revenueGross / (1 + vatRate));            // 不含税收入
  const vat = r2(revenueNet * vatRate);                            // 增值税
  const surcharges = r2(vat * surRate);                            // 附加税费
  const costRows = db.prepare(`SELECT category, SUM(amount) AS total FROM costs WHERE period=? GROUP BY category`).all(period);
  const costTotal = r2(costRows.reduce((s, c) => s + c.total, 0));
  const taxableIncome = Math.max(0, r2(revenueNet - surcharges - costTotal));
  const cit = r2(taxableIncome * citRate);                         // 企业所得税估算
  const gmvRow = db.prepare(`SELECT COALESCE(SUM(ticket_amount),0) AS gmv, COUNT(*) AS cnt FROM orders
    WHERE status IN ('completed','refunded') AND date(created_at) BETWEEN date(?) AND date(?)`).get(start, end);
  return {
    period, range: [start, end], gmv: r2(gmvRow.gmv), order_count: gmvRow.cnt,
    revenue_breakdown: { commission: r2(byType.commission || 0), buyer_fee: r2(byType.buyer_fee || 0), refund_fee: r2(byType.refund_fee || 0) },
    revenue_gross: revenueGross, revenue_net: revenueNet, vat, surcharges,
    costs: costRows.map(c => ({ category: c.category, total: r2(c.total) })), cost_total: costTotal,
    taxable_income: taxableIncome, cit,
    rates: { vat_rate: vatRate, surcharge_rate: surRate, cit_rate: citRate }
  };
}

// 《互联网平台企业涉税信息报送规定》：平台内经营者季度身份+收入信息
function sellerIncomeReport(period) {
  const [year, q] = [+period.slice(0, 4), +period.slice(5)];
  const start = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
  const endMonth = q * 3;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const end = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
  return db.prepare(`
    SELECT u.id, u.name, u.seller_type, u.id_card, u.business_license,
           COUNT(o.id) AS order_count,
           COALESCE(SUM(o.seller_income),0) AS income_total,
           COALESCE(SUM(o.commission),0) AS platform_fee_total
    FROM orders o JOIN users u ON u.id = o.seller_id
    WHERE o.status='completed' AND date(o.completed_at) BETWEEN date(?) AND date(?)
    GROUP BY u.id ORDER BY income_total DESC`).all(start, end);
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const newOrderNo = () => 'TT' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(Date.now()).slice(-6);

module.exports = {
  getSetting, getNum, setSetting, allSettings, r2, maskIdCard, validIdCard, validPhone,
  checkListing, priceOrder, refundTierFor, ledger, settleOrder, taxReport, sellerIncomeReport,
  httpError, newOrderNo
};
