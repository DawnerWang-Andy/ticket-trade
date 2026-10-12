// 票流转 - 买家/卖家端 SPA
const state = {
  token: localStorage.getItem('tt_token') || '',
  user: JSON.parse(localStorage.getItem('tt_user') || 'null'),
  settings: null,
  filters: { category: '', city: '', q: '', sort: '' },
  forumFilters: { kind: '', event_id: '', sort: '', q: '' }
};
const CATEGORIES = ['演唱会', '音乐节', '话剧', '音乐剧', '脱口秀', '体育赛事', '其他'];
const STATUS_TEXT = {
  pending_payment: '待付款', paid_escrow: '托管中', transferred: '待确认收票',
  completed: '已完成', refunded: '已退款', cancelled: '已取消', disputed: '纠纷处理中'
};

// ---------- 基础 ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || '请求失败'); e.status = res.status; throw e; }
  return data;
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const fmtDate = (s) => (s || '').slice(0, 16);
function saveSession(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('tt_token', token);
  localStorage.setItem('tt_user', JSON.stringify(user));
}
function clearSession() {
  state.token = ''; state.user = null;
  localStorage.removeItem('tt_token'); localStorage.removeItem('tt_user');
}
function premiumBadge(l) {
  const p = l.premium_rate;
  if (p > 0.0001) return `<span class="badge badge-premium">${icon('alert-triangle')}溢价 ${(p * 100).toFixed(0)}%</span>`;
  if (p < -0.0001) return `<span class="badge badge-discount">折扣 ${(-p * 100).toFixed(0)}%</span>`;
  return `<span class="badge badge-flat">原价</span>`;
}
function sellerBadge(l) {
  if (l.seller_type === 'business' && l.merchant_status === 'approved')
    return `<span class="badge badge-seller">${icon('shield-check')}持证商家</span>`;
  return `<span class="badge badge-verified">${icon('check-circle')}实名个人</span>`;
}

// ---------- 法律依据提示（展示在发帖/社区/发布等提醒位置） ----------
const LEGAL_REFS = [
  '《治安管理处罚法》第六十三条：倒卖文艺演出票、体育比赛入场券的，处 5–15 日拘留并处罚款',
  '《营业性演出管理条例实施细则》：禁止伪造、加价倒卖演出票券',
  '《互联网跟帖评论服务管理规定》：发帖、留言实行"后台实名、前台自愿"',
  '文旅部、公安部《关于进一步加强大型营业性演出活动规范管理的通知》：大型演出实名购票、实名入场，一证一票'
];
const legalNote = (items = LEGAL_REFS, style = '') => `
  <div class="legal-note" style="${style}">
    <div class="legal-note-title">${icon('scale')}法律依据与平台规则</div>
    <ul>${items.map(t => `<li>${t}</li>`).join('')}</ul>
    <div class="legal-note-foot">据此本平台实行：全实名发帖 ｜ 转让价不超过票面价（仅原价/折价）｜ 过户走官方转赠通道 ｜ 风险话术标记与举报处置</div>
  </div>`;
const capText = () => {
  const cap = state.settings?.price_cap_multiplier ?? 1;
  return cap <= 1 ? '不得超过票面价（仅允许原价或折价转让）' : `不得超过票面价的 ${Math.round(cap * 100)}%`;
};

// ---------- 头像（首字符 + 稳定配色） ----------
const AVATAR_COLORS = ['#0d9488', '#1d4ed8', '#b45309', '#7c3aed', '#be185d', '#15803d'];
const avatar = (name, size = 26) => {
  const n = String(name || '客').trim() || '客';
  const c = AVATAR_COLORS[(n.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return `<span class="avatar" style="background:${c};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px">${esc(n[0])}</span>`;
};

// ---------- 导航与登录 ----------
function renderNav() {
  const el = document.getElementById('nav-links');
  if (state.user) {
    el.innerHTML = `
      <a class="nav-link" href="#/">${icon('users')}粉丝社区</a>
      <a class="nav-link" href="#/tickets">${icon('ticket')}票品展示</a>
      <a class="nav-link" href="#/publish">${icon('plus')}我要卖票</a>
      <a class="nav-link" href="#/orders">${icon('receipt')}我的订单</a>
      <a class="nav-link" href="#/me">${icon('user')}${esc(state.user.name)}</a>
      ${state.user.role === 'admin' ? `<a class="nav-link" href="/admin" target="_blank">${icon('chart')}经营后台</a>` : ''}
      <button class="nav-link" id="btn-logout">${icon('log-out')}退出</button>`;
    document.getElementById('btn-logout').onclick = async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
      clearSession(); renderNav(); location.hash = '#/'; toast('已退出登录');
    };
  } else {
    el.innerHTML = `
      <a class="nav-link" href="#/">${icon('users')}粉丝社区</a>
      <a class="nav-link" href="#/tickets">${icon('ticket')}票品展示</a>
      <button class="btn btn-primary btn-sm" id="btn-login" style="height:32px">${icon('user')}登录 / 注册</button>`;
    document.getElementById('btn-login').onclick = showLogin;
  }
}
function showLogin(after) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-mask"><div class="modal">
      <div class="modal-head">登录 / 注册<button class="modal-close" id="m-close">×</button></div>
      <div class="modal-body">
        <div class="notice notice-info" style="margin-bottom:14px">${icon('info')}演示环境：输入手机号即完成注册登录，不发送短信验证码。</div>
        <div class="form-row"><label>手机号</label><input class="input" id="login-phone" maxlength="11" placeholder="11 位手机号"></div>
        <div class="form-row"><label>昵称</label><input class="input" id="login-name" maxlength="20" placeholder="怎么称呼你"></div>
        <button class="btn btn-primary" style="width:100%" id="login-submit">进入平台</button>
        <div class="form-hint" style="margin-top:10px">演示账号：管理员 18800000000 ｜ 商家卖家 13933334444 ｜ 个人卖家 13911112222 ｜ 买家 13955556666</div>
      </div>
    </div></div>`;
  document.getElementById('m-close').onclick = () => (root.innerHTML = '');
  root.querySelector('.modal-mask').onclick = (e) => { if (e.target.classList.contains('modal-mask')) root.innerHTML = ''; };
  document.getElementById('login-submit').onclick = async () => {
    try {
      const phone = document.getElementById('login-phone').value.trim();
      const name = document.getElementById('login-name').value.trim();
      const data = await api('/api/auth/login', { method: 'POST', body: { phone, name: name || '用户' + phone.slice(-4) } });
      saveSession(data.token, data.user);
      root.innerHTML = ''; renderNav(); toast('欢迎，' + data.user.name, 'ok');
      if (after) after(); else route();
    } catch (e) { toast(e.message, 'err'); }
  };
}
function requireLogin(action) {
  if (state.user) return true;
  showLogin(() => { location.hash = action; });
  return false;
}

// ---------- 视图：首页 ----------
async function viewHome() {
  const app = document.getElementById('app');
  const f = state.filters;
  app.innerHTML = `
    <div class="filterbar">
      <div class="tabs" id="cat-tabs">
        <button class="tab ${!f.category ? 'active' : ''}" data-c="">全部</button>
        ${CATEGORIES.map(c => `<button class="tab ${f.category === c ? 'active' : ''}" data-c="${c}">${c}</button>`).join('')}
      </div>
      <select class="select" id="f-city">
        <option value="">全部城市</option>
        ${['北京', '上海', '广州', '深圳', '成都', '南京', '杭州'].map(c => `<option ${f.city === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <select class="select" id="f-sort">
        <option value="">最新发布</option>
        <option value="date" ${f.sort === 'date' ? 'selected' : ''}>临近开演</option>
        <option value="price_asc" ${f.sort === 'price_asc' ? 'selected' : ''}>价格从低到高</option>
        <option value="price_desc" ${f.sort === 'price_desc' ? 'selected' : ''}>价格从高到低</option>
      </select>
    </div>
    <div class="notice notice-info" style="margin-bottom:14px">${icon('shield-check')}<span><b>Fans-to-Fans 粉丝社区已上线</b>：先与票友实名沟通，成交走官方转赠通道；平台担保交易功能即将开通（资金托管、验票收货、先行赔付）。全场票价${capText()}。</span></div>
    <div class="grid" id="listing-grid"><div class="empty">${icon('clock')}加载中…</div></div>`;
  document.getElementById('cat-tabs').onclick = (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    state.filters.category = t.dataset.c; viewHome();
  };
  document.getElementById('f-city').onchange = (e) => { state.filters.city = e.target.value; viewHome(); };
  document.getElementById('f-sort').onchange = (e) => { state.filters.sort = e.target.value; viewHome(); };
  try {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const { listings } = await api('/api/listings' + (qs ? '?' + qs : ''));
    const grid = document.getElementById('listing-grid');
    if (!listings.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('ticket')}暂无符合条件的票品</div>`; return; }
    grid.innerHTML = listings.map(l => `
      <div class="card listing-card" data-id="${l.id}">
        ${l.image ? `<img class="card-img" src="${esc(l.image)}" alt="${esc(l.event_title)}" loading="lazy">` : ''}
        <div class="card-body">
          <div class="listing-top">
            <div class="listing-title">${esc(l.event_title)}</div>
            ${premiumBadge(l)}
          </div>
          <div class="listing-meta">
            <span>${icon('calendar')}${fmtDate(l.event_date)}</span>
            <span>${icon('map-pin')}${esc(l.city)} · ${esc(l.venue)}</span>
          </div>
          <div class="listing-meta">
            <span>${icon('ticket')}${esc(l.seat_info || '座位以票面为准')}</span>
            <span>${icon('refresh')}${esc(l.ticket_type)}</span>
          </div>
          <div class="listing-bottom">
            <div>
              <span class="price">${money(l.price)}<small>/ 张</small></span>
              <span class="face">票面 ${money(l.face_value)}</span>
            </div>
            ${sellerBadge(l)}
          </div>
        </div>
      </div>`).join('');
    grid.querySelectorAll('.listing-card').forEach(c => (c.onclick = () => (location.hash = '#/listing/' + c.dataset.id)));
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- 视图：票品详情 ----------
async function viewListing(id) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="empty">${icon('clock')}加载中…</div>`;
  let data;
  try { data = await api('/api/listings/' + id); } catch (e) { app.innerHTML = `<div class="empty">${icon('x-circle')}${esc(e.message)}</div>`; return; }
  const l = data.listing;
  app.innerHTML = `
    <div class="page-head">
      <a href="#/" class="btn btn-ghost btn-sm">${icon('chevron-right')}返回列表</a>
      <span class="page-sub">票品编号 #${l.id} ｜ 发布于 ${fmtDate(l.created_at)}</span>
    </div>
    <div class="detail-layout">
      <div>
        <div class="panel">
          ${l.image ? `<img class="event-banner" src="${esc(l.image)}" alt="${esc(l.event_title)}">` : ''}
          <h3>${icon('ticket')}${esc(l.event_title)}</h3>
          <dl class="kv">
            <dt>艺人/阵容</dt><dd>${esc(l.artist || '-')}</dd>
            <dt>时间</dt><dd>${fmtDate(l.event_date)}</dd>
            <dt>地点</dt><dd>${esc(l.city)} · ${esc(l.venue)}</dd>
            <dt>座位</dt><dd>${esc(l.seat_info || '以票面为准')}</dd>
            <dt>票种</dt><dd>${esc(l.ticket_type)}</dd>
            <dt>流转方式</dt><dd>${esc(l.transfer_method)}</dd>
            <dt>票源公示</dt><dd>${esc(l.source_channel)}</dd>
            <dt>购票凭证</dt><dd>${icon('file-text')}${esc(l.proof || '已备案')}</dd>
          </dl>
        </div>
        <div class="panel">
          <h3>${icon('shield-check')}平台交易保障</h3>
          <ul class="list-plain">
            <li>${icon('check-circle')}<span><b>资金托管</b>：买家支付的票款由托管账户锁定，确认收票后才结算给卖家。</span></li>
            <li>${icon('check-circle')}<span><b>验票收货</b>：通过官方转赠通道完成过户后再确认收货，从源头避免"空头票"。</span></li>
            <li>${icon('check-circle')}<span><b>先行赔付</b>：卖家未履约或票品无法入场，平台全额退款并启用赔付基金。</span></li>
            <li>${icon('check-circle')}<span><b>阶梯退票</b>：按距开演时间收取 0%–50% 手续费，规则公开透明。</span></li>
            <li>${icon('check-circle')}<span><b>价格管控</b>：全场售价${capText()}，超限无法发布。</span></li>
          </ul>
        </div>
      </div>
      <div>
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="price" style="font-size:24px">${money(l.price)}</span>
            ${premiumBadge(l)}
          </div>
          <div class="form-hint">票面价 ${money(l.face_value)} ｜ 剩余 ${l.quantity} 张</div>
          <div class="divider"></div>
          <dl class="kv">
            <dt>卖家</dt><dd>${esc(l.seller_name)} ${sellerBadge(l)}</dd>
          </dl>
          <div class="divider"></div>
          <div class="notice notice-info">${icon('info')}<span>平台担保交易功能<b>即将上线</b>。现阶段如需此票，请到粉丝社区与票友实名沟通（可互留联系方式私聊），私下交易无担保，票品过户建议通过<b>官方转赠通道</b>完成。</span></div>
          <button class="btn btn-primary" style="width:100%;height:42px;margin-top:12px" id="btn-go-community">${icon('users')}去社区沟通这张票</button>
          <div class="form-hint" style="margin-top:8px">交易功能上线后，此处将开放"立即购买（资金托管）"。</div>
        </div>
      </div>
    </div>`;
  document.getElementById('btn-go-community').onclick = () => {
    state.forumFilters.event_id = l.event_id || '';
    state.forumFilters.kind = '';
    location.hash = '#/community';
  };
}

// ---------- 视图：发布 ----------
async function viewPublish() {
  if (!requireLogin('#/publish')) return;
  const app = document.getElementById('app');
  const { events } = await api('/api/events');
  const cap = state.settings?.price_cap_multiplier || 1.3;
  app.innerHTML = `
    <div class="page-head"><span class="page-title">发布票品</span><span class="page-sub">发布即代表同意《票源真实性与合规承诺》</span></div>
    <div class="detail-layout">
      <div class="panel">
        <div class="form-row"><label>选择演出</label>
          <select class="select" id="p-event">${events.map(e => `<option value="${e.id}">${esc(e.title)} ｜ ${esc(e.city)} ${fmtDate(e.event_date)}</option>`).join('')}</select>
          <div class="form-hint">未收录的演出请先联系平台客服录入（保证演出信息真实可核验）。</div>
        </div>
        <div class="form-row"><label>座位信息</label><input class="input" id="p-seat" placeholder="如：内场 A2 区 12 排 8 座"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div class="form-row"><label>票面价（元）</label><input class="input" id="p-face" type="number" min="1" placeholder="官方票档"></div>
          <div class="form-row"><label>挂售价（元/张）</label><input class="input" id="p-price" type="number" min="1" placeholder="含溢价上限"></div>
          <div class="form-row"><label>数量（张）</label><input class="input" id="p-qty" type="number" min="1" max="10" value="1"></div>
        </div>
        <div class="form-hint" id="p-premium-hint"></div>
        <div class="form-row" style="margin-top:10px"><label>票种</label>
          <select class="select" id="p-type">
            <option>电子票-官方转赠</option><option>纸质票</option><option>实名录入</option>
          </select>
        </div>
        <div class="form-row"><label>流转方式说明</label><textarea class="input" id="p-transfer" placeholder="如：大麦 APP 官方转赠通道，付款后 24 小时内完成转赠"></textarea></div>
        <div class="form-row"><label>票源渠道（将向买家公示）</label>
          <select class="select" id="p-source">
            <option>个人自购（行程冲突转让）</option><option>主办方公开售票（授权代理）</option><option>剧院/场馆公开售票</option>
          </select>
        </div>
        <div class="form-row"><label>购票凭证</label><input class="input" id="p-proof" type="file" accept="image/*,.pdf">
          <div class="form-hint">上传官方订单截图或发票，平台备案核验（演示环境仅存文件名）。</div>
        </div>
        <div class="form-row checkbox-row">
          <input type="checkbox" id="p-decl">
          <label for="p-decl" style="font-weight:400">我承诺：票源真实合法、非盗抢骗所得；知晓倒卖伪造票证的法律责任；同意平台对溢价、票源与交易行为的审核与处置规则。</label>
        </div>
        <button class="btn btn-primary" id="p-submit" style="height:40px;padding:0 26px">${icon('plus')}发布并公示</button>
      </div>
      <div>
        <div class="panel">
          <h3>${icon('scale')}发布合规要求</h3>
          <ul class="list-plain">
            <li>${icon('check-circle')}<span>卖家须完成<b>实名认证</b>；商家另须通过《营业执照》与《营业性演出许可证》审核。</span></li>
            <li>${icon('check-circle')}<span>挂售价${capText()}（细则禁止加价倒卖演出票券，平台价格硬管控）。</span></li>
            <li>${icon('check-circle')}<span>优先使用<b>官方转赠通道</b>完成过户；禁止录入他人身份信息代拍转售。</span></li>
            <li>${icon('check-circle')}<span>禁止发布工作票、赠票、内部渠道票（主办方未公开销售的票品）。</span></li>
            <li>${icon('check-circle')}<span>平台按成交额向卖家收取 ${(state.settings?.commission_rate * 100 || 8).toFixed(0)}% 佣金，成交后结算。</span></li>
          </ul>
          ${legalNote()}
        </div>
      </div>
    </div>`;
  const updHint = () => {
    const face = +document.getElementById('p-face').value, price = +document.getElementById('p-price').value;
    const hint = document.getElementById('p-premium-hint');
    if (face > 0 && price > 0) {
      const p = price / face - 1;
      if (price > face * cap) { hint.textContent = `超出平台价格上限：最高可售 ${(face * cap).toFixed(0)} 元（仅允许原价或折价）`; hint.className = 'form-hint warn'; }
      else if (p > 0) { hint.textContent = `溢价 ${(p * 100).toFixed(1)}%（超出价格上限，请调整至票面价以内）`; hint.className = 'form-hint warn'; }
      else if (p < 0) { hint.textContent = `折扣 ${(-p * 100).toFixed(1)}%（折扣票将获得更多曝光）`; hint.className = 'form-hint'; }
      else { hint.textContent = '原价转让'; hint.className = 'form-hint'; }
    } else hint.textContent = '';
  };
  document.getElementById('p-face').oninput = updHint;
  document.getElementById('p-price').oninput = updHint;
  document.getElementById('p-submit').onclick = async () => {
    try {
      const body = {
        event_id: +document.getElementById('p-event').value,
        seat_info: document.getElementById('p-seat').value,
        face_value: +document.getElementById('p-face').value,
        price: +document.getElementById('p-price').value,
        quantity: +document.getElementById('p-qty').value,
        ticket_type: document.getElementById('p-type').value,
        transfer_method: document.getElementById('p-transfer').value,
        source_channel: document.getElementById('p-source').value,
        proof: document.getElementById('p-proof').files[0]?.name || '',
        declaration: document.getElementById('p-decl').checked
      };
      await api('/api/listings', { method: 'POST', body });
      toast('发布成功，已进入平台公示', 'ok');
      location.hash = '#/';
    } catch (e) {
      if (e.status === 403) { toast(e.message, 'err'); location.hash = '#/me'; }
      else toast(e.message, 'err');
    }
  };
}

// ---------- 视图：我的订单 ----------
async function viewOrders() {
  if (!requireLogin('#/orders')) return;
  const app = document.getElementById('app');
  app.innerHTML = `<div class="page-head"><span class="page-title">我的订单</span></div><div class="empty">${icon('clock')}加载中…</div>`;
  const { orders } = await api('/api/orders');
  if (!orders.length) { app.innerHTML = `<div class="page-head"><span class="page-title">我的订单</span></div><div class="empty">${icon('receipt')}还没有订单</div>`; return; }
  const myId = state.user.id;
  app.innerHTML = `
    <div class="page-head"><span class="page-title">我的订单</span><span class="page-sub">票款全程托管，确认收票后才结算给卖家</span></div>
    <div class="grid" style="grid-template-columns:1fr">
      ${orders.map(o => {
        const isBuyer = o.buyer_id === myId;
        return `
        <div class="card order-card" data-id="${o.id}">
          <div class="order-head">
            <div>
              <b>${esc(o.event_title)}</b>
              <span class="order-no" style="margin-left:10px">${o.order_no}</span>
            </div>
            <span class="chip st-${o.status}">${STATUS_TEXT[o.status] || o.status}</span>
          </div>
          <div class="order-body">
            <div class="listing-meta">
              <span>${icon('calendar')}${fmtDate(o.event_date)}</span>
              <span>${icon('map-pin')}${esc(o.city)} · ${esc(o.venue)}</span>
              <span>${icon('ticket')}${esc(o.seat_info)} × ${o.quantity}</span>
              <span>${icon('user')}${isBuyer ? '卖家：' + esc(o.seller_name) : '买家：' + esc(o.buyer_name)}</span>
            </div>
            <div style="text-align:right">
              <div class="price">${money(o.total_amount)}</div>
              <div class="form-hint">${isBuyer ? `含服务费 ${money(o.buyer_fee)}` : `到手 ${money(o.seller_income)}（已扣佣金 ${money(o.commission)}）`}</div>
            </div>
          </div>
          ${o.status === 'refunded' ? `<div class="notice notice-info">${icon('info')}已退款 ${money(o.refund_amount)}${o.refund_fee ? `，按阶梯扣除手续费 ${money(o.refund_fee)}（${(o.refund_fee_rate * 100).toFixed(0)}%）` : ''}。</div>` : ''}
          <div class="order-actions">
            ${isBuyer && o.status === 'pending_payment' ? `<button class="btn btn-primary btn-sm" data-act="pay">${icon('wallet')}去支付（托管）</button><button class="btn btn-ghost btn-sm" data-act="refund">取消订单</button>` : ''}
            ${isBuyer && o.status === 'paid_escrow' ? `<button class="btn btn-ghost btn-sm" data-act="refund">${icon('refresh')}申请退票</button><button class="btn btn-ghost btn-sm" data-act="dispute">${icon('alert-triangle')}发起纠纷</button>` : ''}
            ${isBuyer && o.status === 'transferred' ? `<button class="btn btn-primary btn-sm" data-act="confirm">${icon('check-circle')}确认收票</button><button class="btn btn-ghost btn-sm" data-act="dispute">${icon('alert-triangle')}发起纠纷</button>` : ''}
            ${!isBuyer && o.status === 'paid_escrow' ? `<button class="btn btn-primary btn-sm" data-act="transfer">${icon('refresh')}我已完成官方转赠</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  app.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.closest('.order-card').dataset.id;
      const act = btn.dataset.act;
      try {
        if (act === 'dispute') {
          const reason = prompt('请描述纠纷原因（如：卖家超时未转赠 / 票品无法入场）：');
          if (!reason) return;
          await api(`/api/orders/${id}/dispute`, { method: 'POST', body: { reason } });
        } else if (act === 'refund') {
          if (!confirm('确认申请退票？将按阶梯规则收取手续费。')) return;
          const r = await api(`/api/orders/${id}/refund`, { method: 'POST', body: {} });
          if (r.status === 'refunded') toast(`已退款 ${money(r.refund_amount)}（手续费 ${money(r.refund_fee)}）`, 'ok');
        } else {
          const r = await api(`/api/orders/${id}/${act}`, { method: 'POST', body: {} });
          toast(r.note || '操作成功', 'ok');
        }
        viewOrders();
      } catch (e) { toast(e.message, 'err'); }
    };
  });
}

// ---------- 视图：我的 ----------
async function viewMe() {
  if (!requireLogin('#/me')) return;
  const app = document.getElementById('app');
  const { user: u } = await api('/api/me');
  saveSession(state.token, u); renderNav();
  app.innerHTML = `
    <div class="page-head"><span class="page-title">账户与资质</span></div>
    <div class="detail-layout">
      <div>
        <div class="panel">
          <h3>${icon('user')}实名认证 ${u.real_name_verified ? '<span class="badge badge-verified">已实名</span>' : '<span class="badge badge-danger">未实名</span>'}</h3>
          ${u.real_name_verified ? `
            <dl class="kv"><dt>姓名</dt><dd>${esc(u.name)}</dd><dt>证件号</dt><dd>${esc(u.id_card || '-')}</dd><dt>手机号</dt><dd>${esc(u.phone)}</dd></dl>
            <div class="notice notice-ok" style="margin-top:12px">${icon('check-circle')}强实名要求下，买卖双方均须实名后才能交易。</div>
          ` : `
            <div class="form-row"><label>真实姓名</label><input class="input" id="rn-name" placeholder="与身份证一致"></div>
            <div class="form-row"><label>身份证号</label><input class="input" id="rn-id" maxlength="18" placeholder="18 位，平台脱敏存储"></div>
            <button class="btn btn-primary" id="rn-submit">提交实名核验</button>
            <div class="form-hint">演示环境为模拟核验，仅校验证件格式。</div>
          `}
        </div>
        <div class="panel">
          <h3>${icon('shield-check')}商家资质 ${u.seller_type === 'business' ? `<span class="chip st-${u.merchant_status}">${{ none: '未申请', pending: '审核中', approved: '已通过', rejected: '已驳回' }[u.merchant_status]}</span>` : '<span class="badge badge-grey">个人卖家</span>'}</h3>
          ${u.seller_type === 'business' ? `
            <dl class="kv"><dt>营业执照</dt><dd>${esc(u.business_license || '-')}</dd><dt>演出许可证</dt><dd>${esc(u.performance_permit || '-')}</dd></dl>
          ` : `
            <div class="form-hint" style="margin-bottom:10px">以商家身份售票需提交《营业执照》与《营业性演出许可证》，审核通过后方可发布。</div>
            <div class="form-row"><label>统一社会信用代码</label><input class="input" id="m-license" placeholder="91xxxxxxxxxxxxxxxx"></div>
            <div class="form-row"><label>营业性演出许可证编号</label><input class="input" id="m-permit" placeholder="如：沪文演备[2018]0000号"></div>
            <button class="btn btn-ghost" id="m-submit">申请商家资质</button>
          `}
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>${icon('wallet')}我的钱包</h3>
          <div class="kpi" style="border:none;padding:0">
            <div class="k-label">可提现货款（元）</div>
            <div class="k-value accent">${Number(u.balance || 0).toFixed(2)}</div>
            <div class="k-sub">交易完成结算后可提现（演示环境）</div>
          </div>
        </div>
        <div class="panel">
          <h3>${icon('scale')}交易须知</h3>
          <ul class="list-plain">
            <li>${icon('check-circle')}<span>平台按成交额向卖家收取佣金、向买家收取服务费，规则在结算页公示。</span></li>
            <li>${icon('check-circle')}<span>依据《互联网平台企业涉税信息报送规定》，平台将按季度向税务机关报送经营者身份与收入信息。</span></li>
          </ul>
        </div>
      </div>
    </div>`;
  if (!u.real_name_verified) {
    document.getElementById('rn-submit').onclick = async () => {
      try {
        const r = await api('/api/me/realname', { method: 'PUT', body: { real_name: document.getElementById('rn-name').value, id_card: document.getElementById('rn-id').value } });
        saveSession(state.token, r.user); toast('实名认证通过', 'ok'); viewMe();
      } catch (e) { toast(e.message, 'err'); }
    };
  }
  if (u.seller_type !== 'business') {
    document.getElementById('m-submit').onclick = async () => {
      try {
        const r = await api('/api/me/merchant', { method: 'POST', body: { business_license: document.getElementById('m-license').value, performance_permit: document.getElementById('m-permit').value } });
        toast(r.note, 'ok'); viewMe();
      } catch (e) { toast(e.message, 'err'); }
    };
  }
}

// ---------- 视图：粉丝社区 ----------
const POST_KIND_LABEL = { selling: '转票', wanted: '求票', swap: '换票', discuss: '讨论' };
const kindBadge = (k) => `<span class="badge badge-kind-${k}">${POST_KIND_LABEL[k] || k}</span>`;
function verifyBadge(p) {
  if (p.verify_status === 'verified') return `<span class="badge badge-verified">${icon('shield-check')}平台已验真</span>`;
  if (p.verify_status === 'pending') return `<span class="badge badge-pending">${icon('clock')}验真审核中</span>`;
  if (p.verify_status === 'rejected') return `<span class="badge badge-danger">凭证未通过</span>`;
  return '';
}
function userTag(u) {
  if (u.seller_type === 'business' && u.merchant_status === 'approved')
    return `<span class="badge badge-seller">${icon('shield-check')}持证商家</span>`;
  if (u.real_name_verified || u.author_verified) return `<span class="badge badge-verified">${icon('check-circle')}已实名</span>`;
  return '';
}

async function viewCommunity() {
  const app = document.getElementById('app');
  const f = state.forumFilters;
  app.innerHTML = `
    <div class="community-hero">
      <img src="/img/banner.jpg" alt="">
      <div class="community-hero-text">
        <h1>票流转 · 粉丝社区</h1>
        <p>Fans to Fans —— 实名交流、原价转让、官方转赠，和真正的票友聊演出、换好票</p>
      </div>
    </div>
    <div class="page-head">
      <span class="page-title">粉丝社区</span>
      <button class="btn btn-primary btn-sm" id="btn-newpost">${icon('plus')}发布新帖</button>
    </div>
    <div class="notice notice-warn" style="margin-bottom:14px">${icon('alert-triangle')}<span>社区仅提供票务交流，<b>平台暂未开通线上付款</b>。可通过帖子中的联系方式私聊沟通（仅实名用户可见）；私下交易无担保，<b>未验票前切勿转账或付定金</b>，票品过户建议走官方转赠通道。</span></div>
    ${legalNote(LEGAL_REFS, 'margin:0 0 14px')}
    <div class="filterbar">
      <div class="tabs" id="kind-tabs">
        <button class="tab ${!f.kind ? 'active' : ''}" data-k="">全部</button>
        ${Object.entries(POST_KIND_LABEL).map(([k, v]) => `<button class="tab ${f.kind === k ? 'active' : ''}" data-k="${k}">${v}</button>`).join('')}
      </div>
      <select class="select" id="f-event"><option value="">全部演出</option></select>
      <select class="select" id="f-sort2">
        <option value="">最新发布</option>
        <option value="hot" ${f.sort === 'hot' ? 'selected' : ''}>最多讨论</option>
        <option value="date" ${f.sort === 'date' ? 'selected' : ''}>临近开演</option>
      </select>
    </div>
    <div id="post-list"><div class="empty">${icon('clock')}加载中…</div></div>`;
  document.getElementById('btn-newpost').onclick = () => {
    if (!requireLogin('#/community/new')) return;
    location.hash = '#/community/new';
  };
  document.getElementById('kind-tabs').onclick = (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    f.kind = t.dataset.k; viewCommunity();
  };
  document.getElementById('f-sort2').onchange = (e) => { f.sort = e.target.value; viewCommunity(); };
  try {
    const { events } = await api('/api/events');
    const sel = document.getElementById('f-event');
    sel.innerHTML = `<option value="">全部演出</option>` + events.map(ev => `<option value="${ev.id}" ${String(f.event_id) === String(ev.id) ? 'selected' : ''}>${esc(ev.title)}</option>`).join('');
    sel.onchange = () => { f.event_id = sel.value; viewCommunity(); };
  } catch {}
  try {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const { posts } = await api('/api/forum/posts' + (qs ? '?' + qs : ''));
    const list = document.getElementById('post-list');
    if (!posts.length) { list.innerHTML = `<div class="empty">${icon('users')}还没有帖子，来发第一帖吧</div>`; return; }
    list.innerHTML = posts.map(p => `
      <div class="card post-card" data-id="${p.id}">
        ${p.image ? `<img class="post-thumb" src="${esc(p.image)}" alt="${esc(p.event_title || '')}" loading="lazy">` : ''}
        <div class="post-main">
          <div class="post-head">
            ${kindBadge(p.kind)}
            <span class="post-title">${esc(p.title)}</span>
            ${p.risk_flag ? `<span class="badge badge-risk">${icon('alert-triangle')}风险提示</span>` : ''}
          </div>
          <div class="post-meta">
            ${p.event_title ? `<span>${icon('ticket')}${esc(p.event_title)}</span>` : ''}
            ${p.event_date ? `<span>${icon('calendar')}${fmtDate(p.event_date)}</span>` : ''}
            ${p.city ? `<span>${icon('map-pin')}${esc(p.city)}</span>` : ''}
          </div>
          ${p.kind === 'selling' ? `<div class="post-price">转让价 <b>${money(p.price)}</b><span class="face">/ 票面 ${money(p.face_value)}</span>${p.quantity > 1 ? `<span class="face">· ${p.quantity} 张</span>` : ''}${verifyBadge(p)}</div>`
            : p.verify_status !== 'none' ? `<div class="post-price">${verifyBadge(p)}</div>` : ''}
          <div class="post-foot">
            <span class="post-author">${avatar(p.author_name, 22)}${esc(p.author_name)} ${userTag({ seller_type: p.seller_type, merchant_status: p.merchant_status, author_verified: p.author_verified })}</span>
            <span class="post-stats">${icon('message-circle')}${p.comment_count}${icon('eye')}${p.views}<span>${fmtDate(p.created_at)}</span></span>
          </div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.post-card').forEach(c => (c.onclick = () => (location.hash = '#/community/post/' + c.dataset.id)));
  } catch (e) { toast(e.message, 'err'); }
}

async function viewCommunityPost(id) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="empty">${icon('clock')}加载中…</div>`;
  let data;
  try { data = await api('/api/forum/posts/' + id); }
  catch (e) { app.innerHTML = `<div class="empty">${icon('x-circle')}${esc(e.message)}</div>`; return; }
  const p = data.post, a = data.author, comments = data.comments;
  const isOwner = state.user && state.user.id === p.user_id;
  app.innerHTML = `
    <div class="page-head">
      <a href="#/community" class="btn btn-ghost btn-sm">${icon('chevron-right')}返回社区</a>
      <span class="page-sub">帖子 #${p.id} ｜ ${fmtDate(p.created_at)}</span>
    </div>
    <div class="detail-layout">
      <div>
        <div class="panel">
          ${p.image ? `<img class="event-banner" src="${esc(p.image)}" alt="${esc(p.event_title || '')}">` : ''}
          <div class="post-head" style="margin-bottom:10px">
            ${kindBadge(p.kind)}
            <h3 style="margin:0;flex:1">${esc(p.title)}</h3>
            ${p.status === 'done' ? '<span class="badge badge-flat">已完结</span>' : ''}
          </div>
          <div class="post-meta" style="margin-bottom:12px">
            ${p.event_title ? `<span>${icon('ticket')}${esc(p.event_title)}</span>` : ''}
            ${p.event_date ? `<span>${icon('calendar')}${fmtDate(p.event_date)}</span>` : ''}
            ${p.city ? `<span>${icon('map-pin')}${esc(p.city)}${p.venue ? ' · ' + esc(p.venue) : ''}</span>` : ''}
          </div>
          ${p.risk_flag ? `<div class="notice notice-warn" style="margin-bottom:12px">${icon('alert-triangle')}<span>平台检测到该帖含站外交易相关表述。请勿添加私人联系方式、勿私下转账，谨防诈骗。</span></div>` : ''}
          <div class="post-content">${esc(p.content)}</div>
          ${p.kind === 'selling' ? `
            <div class="divider"></div>
            <dl class="kv">
              <dt>票面价</dt><dd class="num">${money(p.face_value)}</dd>
              <dt>转让价</dt><dd class="num" style="font-weight:700">${money(p.price)}（${p.price > p.face_value ? '溢价 ' + Math.round((p.price / p.face_value - 1) * 100) + '%' : p.price < p.face_value ? '低于票面' : '原价'}）</dd>
              <dt>数量</dt><dd>${p.quantity} 张</dd>
              <dt>意向流转方式</dt><dd>${esc(p.transfer_method || '双方协商，建议官方转赠')}</dd>
              <dt>凭证验真</dt><dd>${verifyBadge(p) || '<span class="badge badge-grey">未提交凭证</span>'}</dd>
              ${p.proof ? `<dt>购票凭证</dt><dd>${icon('file-text')}${esc(p.proof)}</dd>` : ''}
            </dl>` : ''}
          <div class="divider"></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${isOwner && p.status === 'open' ? `<button class="btn btn-ghost btn-sm" id="btn-done">${icon('check-circle')}标记为已完结</button>` : ''}
            ${isOwner && p.status === 'done' ? `<button class="btn btn-ghost btn-sm" id="btn-reopen">重新开放</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="btn-report">${icon('flag')}举报</button>
          </div>
          <div id="report-box"></div>
        </div>
        <div class="panel">
          <h3>${icon('message-circle')}留言交流（${comments.length}）</h3>
          <div id="comment-list">
            ${comments.length ? comments.map(c => `
              <div class="comment">
                <div class="comment-head">
                  <span class="comment-avatar">${avatar(c.author_name, 24)}</span>
                  <b>${esc(c.author_name)}</b> ${userTag({ seller_type: c.seller_type, merchant_status: c.merchant_status, author_verified: c.author_verified })}
                  ${c.risk_flag ? `<span class="badge badge-risk">风险提示</span>` : ''}
                  <span class="comment-time">${fmtDate(c.created_at)}</span>
                </div>
                <div class="comment-body">${esc(c.content)}</div>
              </div>`).join('') : `<div class="empty" style="padding:24px">还没有留言，来抢沙发</div>`}
          </div>
          <div class="comment-form">
            <textarea class="input" id="comment-input" rows="3" maxlength="500" placeholder="公开留言沟通（全实名，留言公开留痕）。也可留下联系方式私聊；过户建议走官方转赠通道，未验票前勿转账。"></textarea>
            <button class="btn btn-primary" id="btn-comment">${icon('send')}发表留言</button>
          </div>
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>${icon('user')}发帖人</h3>
          <dl class="kv">
            <dt>昵称</dt><dd><span class="post-author">${avatar(a.name, 24)}${esc(a.name)}</span> ${userTag(a)}</dd>
            <dt>注册时间</dt><dd>${fmtDate(a.created_at)}</dd>
          </dl>
          <div class="divider"></div>
          <h3>${icon('message-circle')}联系方式（私聊）</h3>
          ${p.contact ? `
            <div class="contact-box">${esc(p.contact)}</div>
            <div class="form-hint" style="margin-top:8px">私下沟通与交易<b>风险自担</b>，平台未托管资金；未验票前请勿转账或付定金。</div>
          ` : p.contact_locked ? `
            <div class="notice notice-info">${icon('info')}<span>发帖人留有联系方式，<b>登录并完成实名认证</b>后可见。</span></div>
            ${!state.user ? `<button class="btn btn-primary btn-sm" style="margin-top:10px" id="btn-login-contact">登录查看</button>` : `<a class="btn btn-ghost btn-sm" style="margin-top:10px" href="#/me">去实名认证</a>`}
          ` : `<div class="form-hint">发帖人未留联系方式，可在下方留言区沟通。</div>`}
        </div>
        <div class="panel">
          <h3>${icon('shield-check')}保真与防骗指南</h3>
          <ul class="list-plain">
            <li>${icon('check-circle')}<span><b>只认官方转赠</b>：大麦 / 猫眼 / 纷玩岛 / 票星球 App 内的"转赠"功能是唯一可追溯的过户方式，转赠记录官方可查。</span></li>
            <li>${icon('check-circle')}<span><b>先验票再付款</b>：要求对方提供官方订单截图（敏感信息可打码），并拨打官方客服核实订单真伪。</span></li>
            <li>${icon('check-circle')}<span><b>人证票一致</b>：强实名场次须确认票可转赠或可改绑为你的身份信息，否则无法入场。</span></li>
            <li>${icon('alert-triangle')}<span><b>私聊可以，转账要慢</b>：联系方式私聊没问题，但没拿到票并核验前，任何"先付定金""收款码"都要拒绝并举报。</span></li>
            <li>${icon('alert-triangle')}<span><b>警惕内部票</b>："内部渠道""录入信息""代拍包中"基本是骗局话术。</span></li>
          </ul>
        </div>
        <div class="panel">
          <h3>${icon('info')}社区公约</h3>
          <ul class="list-plain">
            <li>${icon('check-circle')}<span>全员实名发帖，发言公开留痕，依据《互联网跟帖评论服务管理规定》管理。</span></li>
            <li>${icon('check-circle')}<span>联系方式自愿公开、仅实名用户可见；私下交易纠纷平台难以介入，请自行甄别。</span></li>
            <li>${icon('check-circle')}<span>转票帖转让价${capText()}。</span></li>
            <li>${icon('check-circle')}<span>担保交易功能上线后，"社区沟通 + 平台托管"将成为推荐成交路径。</span></li>
          </ul>
          ${legalNote()}
        </div>
      </div>
    </div>`;
  const doneBtn = document.getElementById('btn-done');
  if (doneBtn) doneBtn.onclick = async () => {
    try { await api(`/api/forum/posts/${id}/status`, { method: 'POST', body: { status: 'done' } }); toast('已标记完结', 'ok'); viewCommunityPost(id); }
    catch (e) { toast(e.message, 'err'); }
  };
  const loginContactBtn = document.getElementById('btn-login-contact');
  if (loginContactBtn) loginContactBtn.onclick = () => showLogin(() => viewCommunityPost(id));
  const reopenBtn = document.getElementById('btn-reopen');
  if (reopenBtn) reopenBtn.onclick = async () => {
    try { await api(`/api/forum/posts/${id}/status`, { method: 'POST', body: { status: 'open' } }); toast('已重新开放', 'ok'); viewCommunityPost(id); }
    catch (e) { toast(e.message, 'err'); }
  };
  document.getElementById('btn-report').onclick = () => {
    if (!requireLogin(`#/community/post/${id}`)) return;
    const box = document.getElementById('report-box');
    box.innerHTML = `
      <div class="report-form">
        <textarea class="input" id="report-reason" rows="2" placeholder="请描述举报原因（不少于 5 个字），如：引导站外交易 / 疑似假票 / 溢价超限"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-danger btn-sm" id="report-submit">提交举报</button>
          <button class="btn btn-ghost btn-sm" id="report-cancel">取消</button>
        </div>
      </div>`;
    document.getElementById('report-cancel').onclick = () => (box.innerHTML = '');
    document.getElementById('report-submit').onclick = async () => {
      try {
        const r = await api('/api/forum/reports', { method: 'POST', body: { post_id: +id, reason: document.getElementById('report-reason').value.trim() } });
        toast(r.note, 'ok'); box.innerHTML = '';
      } catch (e) { toast(e.message, 'err'); }
    };
  };
  document.getElementById('btn-comment').onclick = async () => {
    if (!requireLogin(`#/community/post/${id}`)) return;
    const content = document.getElementById('comment-input').value.trim();
    try {
      const r = await api(`/api/forum/posts/${id}/comments`, { method: 'POST', body: { content } });
      toast(r.note, r.risk_flag ? '' : 'ok');
      viewCommunityPost(id);
    } catch (e) {
      if (e.status === 403) { toast(e.message, 'err'); location.hash = '#/me'; }
      else toast(e.message, 'err');
    }
  };
}

async function viewCommunityNew() {
  if (!requireLogin('#/community/new')) return;
  const app = document.getElementById('app');
  const { events } = await api('/api/events');
  let kind = 'selling';
  const cap = state.settings?.price_cap_multiplier || 1.3;
  app.innerHTML = `
    <div class="page-head">
      <a href="#/community" class="btn btn-ghost btn-sm">${icon('chevron-right')}返回社区</a>
      <span class="page-title">发布新帖</span>
    </div>
    <div class="detail-layout">
      <div class="panel">
        <div class="form-row">
          <label>帖子类型</label>
          <div class="tabs" id="np-kind">
            ${Object.entries(POST_KIND_LABEL).map(([k, v]) => `<button class="tab ${k === kind ? 'active' : ''}" data-k="${k}">${v}</button>`).join('')}
          </div>
        </div>
        <div class="form-row" id="np-event-row">
          <label>关联演出</label>
          <select class="select" id="np-event">${events.map(ev => `<option value="${ev.id}">${esc(ev.title)} ｜ ${esc(ev.city)} ${fmtDate(ev.event_date)}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>标题</label><input class="input" id="np-title" maxlength="50" placeholder="一句话说清楚，例如：周杰伦 9.27 上海站内场 1 张原价转"></div>
        <div class="form-row"><label>正文</label><textarea class="input" id="np-content" rows="6" maxlength="2000"></textarea></div>
        <div id="np-selling">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-row"><label>票面价（元/张）</label><input class="input" id="np-face" type="number" min="1" placeholder="如 1280"></div>
            <div class="form-row"><label>转让价（元/张）</label><input class="input" id="np-price" type="number" min="1" placeholder="${cap <= 1 ? '仅允许原价或折价' : `不得超过票面 × ${cap}`}"></div>
          </div>
          <div class="form-hint" id="np-premium-hint"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
            <div class="form-row"><label>数量（张）</label><input class="input" id="np-qty" type="number" min="1" value="1"></div>
            <div class="form-row"><label>意向流转方式</label>
              <select class="select" id="np-transfer">
                <option>大麦 App 官方转赠</option>
                <option>猫眼 App 官方转赠</option>
                <option>纷玩岛 App 官方转赠</option>
                <option>票星球 App 官方转赠</option>
                <option>其他官方渠道（正文说明）</option>
              </select>
            </div>
          </div>
          <div class="form-row" style="margin-top:10px"><label>购票凭证（选填，提交后平台验真，通过展示"已验真"徽章）</label><input class="input" id="np-proof" maxlength="120" placeholder="官方订单号后 6 位 + 订单截图说明，如：大麦订单 ***3210，截图已存"></div>
          <div class="form-row checkbox-row">
            <input type="checkbox" id="np-decl">
            <label for="np-decl" style="font-weight:400">我承诺：票源真实合法、为本人实名购入；转让价不超过社区溢价上限；成交走官方转赠通道，不引导站外私下交易。</label>
          </div>
        </div>
        <div class="form-row" style="margin-top:14px"><label>联系方式（选填，仅实名登录用户可见，用于私聊沟通）</label><input class="input" id="np-contact" maxlength="60" placeholder="微信 / QQ / 手机号，如：微信：my-ticket-2026"></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" id="np-submit" style="height:40px;padding:0 26px">${icon('send')}发布</button>
          <a class="btn btn-ghost" href="#/community">取消</a>
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>${icon('info')}发帖须知</h3>
          <ul class="list-plain" id="np-tips"></ul>
          ${legalNote()}
        </div>
      </div>
    </div>`;
  const tips = {
    selling: ['转票帖须关联演出，并填写票面价与转让价。', `转让价${cap <= 1 ? '不得超过票面价（仅原价/折价）' : `不得超过票面价的 ${Math.round(cap * 100)}%`}，超限将无法发布。`, '提交购票凭证并通过平台验真后，帖子展示"已验真"徽章，更容易成交。'],
    wanted: ['写清楚场次、张数与可接受的价格区间。', '注明"只走官方转赠通道"，可以过滤掉站外交易骗子。'],
    swap: ['写清你持有的票与想换的票（场次 / 座位 / 差价互补方式）。', '换票同样建议双方通过官方转赠完成，不要邮寄裸票。'],
    discuss: ['讨论帖无需关联演出。', '欢迎分享防骗经验、观演攻略、官方放票与回流票情报。']
  };
  const placeholders = {
    selling: '座位区域、入手渠道、转让原因、希望的交接方式（建议官方转赠）……',
    wanted: '想要哪一场、几张、心理价位、是否接受小幅溢价……',
    swap: '我持有：…… 想换：…… 差价怎么补……',
    discuss: '想和大家聊点什么？防骗经验、抢票攻略、回流票情报都欢迎。'
  };
  const refreshKind = () => {
    document.querySelectorAll('#np-kind .tab').forEach(t => t.classList.toggle('active', t.dataset.k === kind));
    document.getElementById('np-event-row').style.display = kind === 'discuss' ? 'none' : '';
    document.getElementById('np-selling').style.display = kind === 'selling' ? '' : 'none';
    document.getElementById('np-content').placeholder = placeholders[kind];
    document.getElementById('np-tips').innerHTML = tips[kind].map(t => `<li>${icon('check-circle')}<span>${t}</span></li>`).join('');
  };
  document.getElementById('np-kind').onclick = (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    kind = t.dataset.k; refreshKind();
  };
  const updHint = () => {
    const face = +document.getElementById('np-face').value, price = +document.getElementById('np-price').value;
    const hint = document.getElementById('np-premium-hint');
    if (face > 0 && price > 0) {
      if (price > face * cap) { hint.textContent = `超出社区价格上限：最高 ${(face * cap).toFixed(0)} 元（仅允许原价或折价）`; hint.className = 'form-hint warn'; }
      else if (price > face) { hint.textContent = `溢价 ${((price / face - 1) * 100).toFixed(1)}%（上限内）`; hint.className = 'form-hint'; }
      else if (price < face) { hint.textContent = '低于票面转让，感谢良心票友'; hint.className = 'form-hint'; }
      else { hint.textContent = '原价转让'; hint.className = 'form-hint'; }
    } else hint.textContent = '';
  };
  document.getElementById('np-face').oninput = updHint;
  document.getElementById('np-price').oninput = updHint;
  refreshKind();
  document.getElementById('np-submit').onclick = async () => {
    const body = {
      kind,
      event_id: kind === 'discuss' ? null : +document.getElementById('np-event').value,
      title: document.getElementById('np-title').value.trim(),
      content: document.getElementById('np-content').value.trim(),
      contact: document.getElementById('np-contact').value.trim()
    };
    if (kind === 'selling') {
      body.face_value = +document.getElementById('np-face').value;
      body.price = +document.getElementById('np-price').value;
      body.quantity = +document.getElementById('np-qty').value || 1;
      body.transfer_method = document.getElementById('np-transfer').value;
      body.proof = document.getElementById('np-proof').value.trim();
      body.declaration = document.getElementById('np-decl').checked;
    }
    try {
      const r = await api('/api/forum/posts', { method: 'POST', body });
      toast(r.note, 'ok');
      location.hash = '#/community/post/' + r.id;
    } catch (e) {
      if (e.status === 403) { toast(e.message, 'err'); location.hash = '#/me'; }
      else toast(e.message, 'err');
    }
  };
}

// ---------- 路由 ----------
async function route() {
  const hash = location.hash || '#/';
  document.getElementById('modal-root').innerHTML = '';
  if (hash.startsWith('#/listing/')) return viewListing(hash.split('/')[2]);
  if (hash === '#/publish') return viewPublish();
  if (hash === '#/orders') return viewOrders();
  if (hash === '#/me') return viewMe();
  if (hash === '#/tickets') return viewHome();
  if (hash === '#/community') return viewCommunity();
  if (hash.startsWith('#/community/post/')) return viewCommunityPost(hash.split('/')[3]);
  if (hash === '#/community/new') return viewCommunityNew();
  return viewCommunity();
}

async function boot() {
  document.getElementById('brand-icon').innerHTML = icon('ticket');
  document.getElementById('search-icon').innerHTML = icon('search');
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(window.__st); window.__st = setTimeout(() => {
      const hash = location.hash || '#/';
      if (hash === '#/tickets') { state.filters.q = q; viewHome(); }
      else if (hash === '#/' || hash === '#/community') { state.forumFilters.q = q; viewCommunity(); }
    }, 300);
  });
  renderNav();
  try {
    state.settings = await api('/api/meta/settings');
    document.getElementById('footer-note').innerHTML =
      `${esc(state.settings.platform_name)} · 合规二手票务交易平台（演示环境）<br>${esc(state.settings.disclaimer)}`;
    if (state.token) {
      const me = await api('/api/me').catch(() => null);
      if (me) { saveSession(state.token, me.user); renderNav(); } else clearSession();
    }
  } catch {}
  window.addEventListener('hashchange', route);
  route();
}
boot();
