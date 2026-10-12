// 票流转 - 平台经营后台 SPA
const state = {
  token: localStorage.getItem('tt_admin_token') || '',
  user: JSON.parse(localStorage.getItem('tt_admin_user') || 'null'),
  page: 'dashboard',
  taxPeriod: `${new Date().getFullYear()}Q${Math.ceil((new Date().getMonth() + 1) / 3)}`
};
const ORDER_STATUS = {
  pending_payment: '待付款', paid_escrow: '托管中', transferred: '待确认',
  completed: '已完成', refunded: '已退款', cancelled: '已取消', disputed: '纠纷中'
};
const LISTING_STATUS = { active: '在售', offline: '已下架', rejected: '已拒绝', pending: '待审核', sold: '已售罄' };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
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
const money = (n) => Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s) => (s || '').slice(0, 16);
const chip = (s, map) => `<span class="chip st-${s}">${map[s] || s}</span>`;

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:var(--bg)">
      <div class="panel" style="width:380px">
        <div class="admin-brand" style="color:var(--text);border:none;margin-bottom:14px;padding-bottom:0">
          <span class="logo">${icon('ticket')}</span><span>票流转 · 经营后台</span>
        </div>
        <div class="notice notice-info" style="margin-bottom:14px">${icon('info')}仅限平台管理员登录。演示账号：18800000000。</div>
        <div class="form-row"><label>手机号</label><input class="input" id="a-phone" maxlength="11" value="18800000000"></div>
        <div class="form-row"><label>姓名</label><input class="input" id="a-name" value="平台管理员"></div>
        <button class="btn btn-primary" style="width:100%" id="a-login">进入后台</button>
        <div class="form-hint" style="margin-top:10px"><a href="/">返回买家端 →</a></div>
      </div>
    </div>`;
  document.getElementById('a-login').onclick = async () => {
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { phone: document.getElementById('a-phone').value.trim(), name: document.getElementById('a-name').value.trim() } });
      if (data.user.role !== 'admin') { toast('该账号不是平台管理员', 'err'); return; }
      state.token = data.token; state.user = data.user;
      localStorage.setItem('tt_admin_token', data.token);
      localStorage.setItem('tt_admin_user', JSON.stringify(data.user));
      renderShell();
    } catch (e) { toast(e.message, 'err'); }
  };
}

const NAV = [
  { id: 'dashboard', label: '经营仪表盘', ic: 'chart' },
  { id: 'orders', label: '交易订单', ic: 'receipt' },
  { id: 'listings', label: '票品管理', ic: 'ticket' },
  { id: 'forum', label: '社区管理', ic: 'message-circle', fcount: true },
  { id: 'users', label: '用户与资质', ic: 'users' },
  { id: 'disputes', label: '纠纷处理', ic: 'gavel', count: true },
  { id: 'compliance', label: '合规中心', ic: 'scale' },
  { id: 'tax', label: '财税中心', ic: 'landmark' },
  { id: 'settings', label: '平台设置', ic: 'settings' }
];
let openDisputes = 0;
let openForumTasks = 0;
function renderShell() {
  document.getElementById('app').innerHTML = `
    <div class="admin-shell">
      <aside class="admin-side">
        <div class="admin-brand"><span class="logo">${icon('ticket')}</span><span>票流转 后台</span></div>
        ${NAV.map(n => `
          <button class="side-item ${state.page === n.id ? 'active' : ''}" data-page="${n.id}">
            ${icon(n.ic)}<span>${n.label}</span>
            ${n.count && openDisputes ? `<span class="side-count">${openDisputes}</span>` : ''}
            ${n.fcount && openForumTasks ? `<span class="side-count">${openForumTasks}</span>` : ''}
          </button>`).join('')}
        <div style="margin-top:18px;padding:10px;font-size:12px;color:#8fa39d">
          ${esc(state.user.name)}<br>
          <a href="/" style="color:#8fa39d">返回买家端 →</a> ｜
          <a href="#" id="a-logout" style="color:#8fa39d">退出</a>
        </div>
      </aside>
      <main class="admin-main" id="admin-main"></main>
    </div>`;
  document.querySelectorAll('.side-item').forEach(b => (b.onclick = () => { state.page = b.dataset.page; renderShell(); }));
  document.getElementById('a-logout').onclick = (e) => {
    e.preventDefault();
    state.token = ''; state.user = null;
    localStorage.removeItem('tt_admin_token'); localStorage.removeItem('tt_admin_user');
    renderLogin();
  };
  renderPage();
}
function renderPage() {
  const m = document.getElementById('admin-main');
  m.innerHTML = `<div class="empty">${icon('clock')}加载中…</div>`;
  ({ dashboard: pageDashboard, orders: pageOrders, listings: pageListings, users: pageUsers,
     forum: pageForum, disputes: pageDisputes, compliance: pageCompliance, tax: pageTax, settings: pageSettings }[state.page] || pageDashboard)();
}
const head = (title, sub, extra = '') => `
  <div class="page-head"><span class="page-title">${title}</span><span class="page-sub">${sub || ''}</span>
  <span style="margin-left:auto;display:flex;gap:8px">${extra}</span></div>`;

async function pageDashboard() {
  const d = await api('/api/admin/dashboard');
  openDisputes = d.kpi.open_disputes;
  openForumTasks = (d.kpi.forum_pending_verify || 0) + (d.kpi.forum_open_reports || 0);
  document.querySelectorAll('.side-item').forEach(b => {
    if (b.dataset.page === 'disputes') {
      b.querySelector('.side-count')?.remove();
      if (openDisputes) b.insertAdjacentHTML('beforeend', `<span class="side-count">${openDisputes}</span>`);
    }
    if (b.dataset.page === 'forum') {
      b.querySelector('.side-count')?.remove();
      if (openForumTasks) b.insertAdjacentHTML('beforeend', `<span class="side-count">${openForumTasks}</span>`);
    }
  });
  const maxGmv = Math.max(1, ...d.monthly.map(m => m.gmv));
  const catTotal = Math.max(1, d.byCategory.reduce((s, c) => s + c.gmv, 0));
  document.getElementById('admin-main').innerHTML = `
    ${head('经营仪表盘', '平台交易与资金的实时总览')}
    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">${icon('chart')}平台 GMV</div><div class="k-value">¥${money(d.kpi.gmv)}</div><div class="k-sub">成交+退款订单票价总额</div></div>
      <div class="kpi"><div class="k-label">${icon('dollar')}平台收入</div><div class="k-value accent">¥${money(d.kpi.revenue)}</div><div class="k-sub">佣金 + 服务费 + 退票费</div></div>
      <div class="kpi"><div class="k-label">${icon('wallet')}托管资金</div><div class="k-value">¥${money(d.kpi.escrow)}</div><div class="k-sub">在途订单托管余额</div></div>
      <div class="kpi"><div class="k-label">${icon('shield-check')}赔付基金</div><div class="k-value ${d.kpi.fund < 20000 ? 'warn' : ''}">¥${money(d.kpi.fund)}</div><div class="k-sub">先行赔付可用余额</div></div>
      <div class="kpi"><div class="k-label">${icon('receipt')}订单量</div><div class="k-value">${d.kpi.order_total}</div><div class="k-sub">已完成 ${d.kpi.completed} 笔</div></div>
      <div class="kpi"><div class="k-label">${icon('refresh')}退款总额</div><div class="k-value">¥${money(d.kpi.refund_total)}</div><div class="k-sub">含阶梯手续费扣除</div></div>
      <div class="kpi"><div class="k-label">${icon('ticket')}在售票品</div><div class="k-value">${d.kpi.active_listings}</div><div class="k-sub">注册用户 ${d.kpi.users} 人</div></div>
      <div class="kpi"><div class="k-label">${icon('gavel')}待处理纠纷</div><div class="k-value ${d.kpi.open_disputes ? 'danger' : ''}">${d.kpi.open_disputes}</div><div class="k-sub">需 24 小时内介入</div></div>
      <div class="kpi"><div class="k-label">${icon('message-circle')}社区待办</div><div class="k-value ${openForumTasks ? 'warn' : ''}">${openForumTasks}</div><div class="k-sub">验真 ${d.kpi.forum_pending_verify || 0} ｜ 举报 ${d.kpi.forum_open_reports || 0} ｜ 在帖 ${d.kpi.forum_posts || 0}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px">
      <div class="chart-card">
        <div class="chart-title">月度 GMV 与平台收入（元）</div>
        <div class="bars">
          ${d.monthly.map(mo => `
            <div class="bar-col">
              <div class="bar-value">${money(mo.gmv)}</div>
              <div class="bar-stack">
                <div class="bar" style="height:${Math.max(3, (mo.gmv / maxGmv) * 100)}%"></div>
                <div class="bar rev" style="height:${Math.max(2, (mo.revenue / maxGmv) * 100)}%"></div>
              </div>
              <div class="bar-label">${mo.month}</div>
            </div>`).join('') || '<div class="empty">暂无数据</div>'}
        </div>
        <div class="legend"><span><i style="background:var(--accent)"></i>GMV</span><span><i style="background:#5eead4"></i>平台收入</span></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">成交品类分布（GMV 占比）</div>
        <div class="hbars">
          ${d.byCategory.map(c => `
            <div class="hbar-row">
              <span>${esc(c.category)}</span>
              <div class="hbar-track"><div class="hbar-fill" style="width:${(c.gmv / catTotal) * 100}%"></div></div>
              <span class="hbar-val">¥${money(c.gmv)}</span>
            </div>`).join('') || '<div class="empty">暂无数据</div>'}
        </div>
      </div>
    </div>`;
}

async function pageOrders(status = '', q = '') {
  const qs = new URLSearchParams(); if (status) qs.set('status', status); if (q) qs.set('q', q);
  const { orders } = await api('/api/admin/orders?' + qs);
  document.getElementById('admin-main').innerHTML = `
    ${head('交易订单', '全部订单的资金与履约状态', `
      <select class="select" id="o-status"><option value="">全部状态</option>
        ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input class="input" id="o-q" placeholder="订单号 / 演出名" value="${esc(q)}" style="width:200px">`)}
    <div class="table-wrap"><table class="table">
      <thead><tr><th>订单号</th><th>演出</th><th>买家</th><th>卖家</th><th class="num">票价</th><th class="num">服务费</th><th class="num">佣金</th><th class="num">合计</th><th>状态</th><th>创建时间</th></tr></thead>
      <tbody>
        ${orders.map(o => `<tr>
          <td>${o.order_no}</td><td>${esc(o.event_title)}</td><td>${esc(o.buyer_name)}</td><td>${esc(o.seller_name)}</td>
          <td class="num">${money(o.ticket_amount)}</td><td class="num">${money(o.buyer_fee)}</td>
          <td class="num">${money(o.commission)}</td><td class="num"><b>${money(o.total_amount)}</b></td>
          <td>${chip(o.status, ORDER_STATUS)}</td><td>${fmtDate(o.created_at)}</td>
        </tr>`).join('') || '<tr><td colspan="10" class="empty">暂无订单</td></tr>'}
      </tbody></table></div>`;
  document.getElementById('o-status').onchange = (e) => pageOrders(e.target.value, document.getElementById('o-q').value);
  document.getElementById('o-q').onchange = (e) => pageOrders(document.getElementById('o-status').value, e.target.value);
}

async function pageListings(status = '') {
  const qs = status ? '?status=' + status : '';
  const { listings, cap } = await api('/api/admin/listings' + qs);
  document.getElementById('admin-main').innerHTML = `
    ${head('票品管理', `价格上限：票面价 × ${cap}${cap <= 1 ? '（仅原价/折价，细则禁止加价倒卖）' : ''}`, `
      <select class="select" id="l-status"><option value="">全部状态</option>
        ${Object.entries(LISTING_STATUS).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
    <div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>演出</th><th>座位</th><th>卖家</th><th class="num">票面</th><th class="num">售价</th><th>溢价率</th><th>票源</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        ${listings.map(l => `<tr>
          <td>${l.id}</td><td>${esc(l.event_title)}</td><td>${esc(l.seat_info)}</td><td>${esc(l.seller_name)}</td>
          <td class="num">${money(l.face_value)}</td><td class="num">${money(l.price)}</td>
          <td>${l.premium_rate > cap - 1 ? `<span class="badge badge-danger">${(l.premium_rate * 100).toFixed(0)}%</span>` : l.premium_rate > 0 ? `<span class="badge badge-premium">${(l.premium_rate * 100).toFixed(0)}%</span>` : l.premium_rate < 0 ? `<span class="badge badge-discount">${(l.premium_rate * 100).toFixed(0)}%</span>` : '<span class="badge badge-flat">0%</span>'}</td>
          <td>${esc(l.source_channel)}</td>
          <td>${chip(l.status, LISTING_STATUS)}</td>
          <td>
            ${l.status !== 'active' ? `<button class="btn btn-ghost btn-sm" data-act="active" data-id="${l.id}">上架</button>` : ''}
            ${l.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-act="offline" data-id="${l.id}">下架</button>` : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="10" class="empty">暂无票品</td></tr>'}
      </tbody></table></div>`;
  document.getElementById('l-status').onchange = (e) => pageListings(e.target.value);
  document.querySelectorAll('[data-act]').forEach(b => (b.onclick = async () => {
    await api(`/api/admin/listings/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.act } });
    toast('已更新', 'ok'); pageListings(document.getElementById('l-status').value);
  }));
}

// ---------- 社区管理 ----------
const POST_KIND_LABEL = { selling: '转票', wanted: '求票', swap: '换票', discuss: '讨论' };
const verifyChip = (v) => ({
  verified: '<span class="chip st-approved">已验真</span>',
  pending: '<span class="chip st-pending">验真待审</span>',
  rejected: '<span class="chip st-rejected">凭证未通过</span>',
  none: '<span class="chip st-none">无凭证</span>'
}[v] || esc(v));
const postStatusChip = (s) => ({
  open: '<span class="chip st-active">进行中</span>',
  done: '<span class="chip st-none">已完结</span>',
  hidden: '<span class="chip st-offline">已隐藏</span>'
}[s] || esc(s));

async function pageForum(tab) {
  state.forumTab = tab || state.forumTab || 'verify';
  const t = state.forumTab;
  const ov = await api('/api/admin/forum/overview');
  const tabs = [
    ['verify', `验真审核（${ov.pending_verify}）`],
    ['reports', `举报处理（${ov.open_reports}）`],
    ['all', '全部帖子']
  ];
  const headHtml = `
    ${head('社区管理', 'Fans-to-Fans 社区的内容风控：凭证验真、举报处置、风险巡查')}
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><div class="k-label">${icon('clock')}待验真</div><div class="k-value ${ov.pending_verify ? 'warn' : ''}">${ov.pending_verify}</div><div class="k-sub">转票帖购票凭证待核</div></div>
      <div class="kpi"><div class="k-label">${icon('flag')}待处理举报</div><div class="k-value ${ov.open_reports ? 'danger' : ''}">${ov.open_reports}</div><div class="k-sub">24 小时内核查</div></div>
      <div class="kpi"><div class="k-label">${icon('alert-triangle')}风险标记帖</div><div class="k-value ${ov.risk_flagged ? 'warn' : ''}">${ov.risk_flagged}</div><div class="k-sub">含站外交易话术，巡查中</div></div>
      <div class="kpi"><div class="k-label">${icon('users')}帖子总数</div><div class="k-value">${ov.total_posts}</div><div class="k-sub">全实名制社区</div></div>
    </div>
    <div class="tabs" style="margin-bottom:14px">
      ${tabs.map(([k, v]) => `<button class="tab ${t === k ? 'active' : ''}" data-tab="${k}">${v}</button>`).join('')}
    </div>
    <div id="forum-body"><div class="empty">${icon('clock')}加载中…</div></div>`;
  document.getElementById('admin-main').innerHTML = headHtml;
  document.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => pageForum(b.dataset.tab)));
  const body = document.getElementById('forum-body');

  if (t === 'verify') {
    const { posts } = await api('/api/admin/forum/posts?filter=pending_verify');
    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>帖子</th><th>作者</th><th class="num">票面 / 转让价</th><th>购票凭证</th><th>发布时间</th><th>操作</th></tr></thead>
        <tbody>
          ${posts.map(p => `<tr>
            <td>${p.id}</td>
            <td style="max-width:260px"><span class="badge badge-kind-${p.kind}">${POST_KIND_LABEL[p.kind]}</span> ${esc(p.title)}<div class="form-hint">${esc(p.event_title || '-')}</div></td>
            <td>${esc(p.author_name)}</td>
            <td class="num">${money(p.face_value)} / <b>${money(p.price)}</b></td>
            <td style="max-width:220px">${icon('file-text')} ${esc(p.proof || '-')}</td>
            <td>${fmtDate(p.created_at)}</td>
            <td>
              <button class="btn btn-primary btn-sm" data-v="verified" data-id="${p.id}">通过验真</button>
              <button class="btn btn-ghost btn-sm" data-v="rejected" data-id="${p.id}">不通过</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="7" class="empty">没有待验真的帖子</td></tr>'}
        </tbody></table></div>
      <div class="notice notice-info" style="margin-top:14px">${icon('info')}验真要点：凭证是否官方渠道订单、订单信息与票面是否一致、是否支持官方转赠。通过后帖子展示「已验真」徽章。</div>`;
    document.querySelectorAll('[data-v]').forEach(b => (b.onclick = async () => {
      await api(`/api/admin/forum/posts/${b.dataset.id}/verify`, { method: 'POST', body: { action: b.dataset.v } });
      toast(b.dataset.v === 'verified' ? '已通过验真' : '已标记未通过', 'ok'); pageForum('verify');
    }));
  }

  if (t === 'reports') {
    const { reports } = await api('/api/admin/forum/reports');
    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>被举报帖子</th><th>发帖人</th><th>举报人</th><th>举报原因</th><th>时间</th><th>状态</th><th>处理</th></tr></thead>
        <tbody>
          ${reports.map(r => `<tr>
            <td>${r.id}</td>
            <td style="max-width:240px">${r.post_title ? `#${r.pid} ${esc(r.post_title)}` : '（评论举报）'}</td>
            <td>${esc(r.post_author || '-')}</td>
            <td>${esc(r.reporter_name)}</td>
            <td style="max-width:260px">${esc(r.reason)}</td>
            <td>${fmtDate(r.created_at)}</td>
            <td>${chip(r.status, { open: '待处理', resolved: '已处理' })}</td>
            <td>${r.status === 'open' ? `
              <button class="btn btn-danger btn-sm" data-r="hide" data-id="${r.id}">隐藏并办结</button>
              <button class="btn btn-ghost btn-sm" data-r="keep" data-id="${r.id}">仅办结</button>` : esc(r.resolution || '-')}
            </td>
          </tr>`).join('') || '<tr><td colspan="8" class="empty">暂无举报</td></tr>'}
        </tbody></table></div>`;
    document.querySelectorAll('[data-r]').forEach(b => (b.onclick = async () => {
      const hide = b.dataset.r === 'hide';
      const resolution = prompt('处理结论（存档）：', hide ? '核实违规，隐藏内容并告诫发帖人' : '举报不成立，内容保留');
      if (resolution === null) return;
      await api(`/api/admin/forum/reports/${b.dataset.id}/resolve`, { method: 'POST', body: { hide_post: hide, resolution } });
      toast('举报已处理', 'ok'); pageForum('reports');
    }));
  }

  if (t === 'all') {
    const { posts } = await api('/api/admin/forum/posts');
    body.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>类型</th><th>帖子</th><th>作者</th><th class="num">留言/浏览</th><th>验真</th><th>风险</th><th>状态</th><th>举报</th><th>操作</th></tr></thead>
        <tbody>
          ${posts.map(p => `<tr>
            <td>${p.id}</td>
            <td><span class="badge badge-kind-${p.kind}">${POST_KIND_LABEL[p.kind]}</span></td>
            <td style="max-width:280px">${esc(p.title)}<div class="form-hint">${esc(p.event_title || '-')}</div></td>
            <td>${esc(p.author_name)}</td>
            <td class="num">${p.comment_count} / ${p.views}</td>
            <td>${verifyChip(p.verify_status)}</td>
            <td>${p.risk_flag ? '<span class="badge badge-risk">站外话术</span>' : '-'}</td>
            <td>${postStatusChip(p.status)}</td>
            <td>${p.open_reports ? `<span class="badge badge-danger">${p.open_reports}</span>` : '-'}</td>
            <td>${p.status !== 'hidden' ? `<button class="btn btn-ghost btn-sm" data-h="${p.id}">隐藏</button>` : ''}</td>
          </tr>`).join('') || '<tr><td colspan="10" class="empty">暂无帖子</td></tr>'}
        </tbody></table></div>`;
    document.querySelectorAll('[data-h]').forEach(b => (b.onclick = async () => {
      if (!confirm('确认隐藏该帖子？用户端将不再展示。')) return;
      await api(`/api/forum/posts/${b.dataset.h}/status`, { method: 'POST', body: { status: 'hidden' } });
      toast('帖子已隐藏', 'ok'); pageForum('all');
    }));
  }
}

async function pageUsers(filter = '') {
  const qs = filter === 'pending' ? '?merchant=pending' : filter === 'unverified' ? '?unverified=1' : '';
  const { users } = await api('/api/admin/users' + qs);
  const mStatus = { none: '个人', pending: '待审核', approved: '持证商家', rejected: '已驳回' };
  document.getElementById('admin-main').innerHTML = `
    ${head('用户与资质', '实名（KYC）与商家经营资质审核', `
      <select class="select" id="u-filter">
        <option value="">全部用户</option>
        <option value="pending" ${filter === 'pending' ? 'selected' : ''}>商家资质待审核</option>
        <option value="unverified" ${filter === 'unverified' ? 'selected' : ''}>未实名用户</option>
      </select>`)}
    <div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>名称</th><th>手机号</th><th>实名</th><th>证件号</th><th>类型</th><th>营业执照</th><th>演出许可证</th><th class="num">在售</th><th class="num">累计收入</th><th>操作</th></tr></thead>
      <tbody>
        ${users.map(u => `<tr>
          <td>${u.id}</td><td>${esc(u.name)}${u.role === 'admin' ? ' <span class="badge badge-seller">管理员</span>' : ''}</td>
          <td>${esc(u.phone)}</td>
          <td>${u.real_name_verified ? '<span class="badge badge-verified">已实名</span>' : '<span class="badge badge-danger">未实名</span>'}</td>
          <td>${esc(u.id_card || '-')}</td>
          <td><span class="chip st-${u.merchant_status}">${mStatus[u.merchant_status]}</span></td>
          <td>${esc(u.business_license || '-')}</td><td>${esc(u.performance_permit || '-')}</td>
          <td class="num">${u.listing_count}</td><td class="num">${money(u.income_total)}</td>
          <td style="white-space:nowrap">
            ${u.merchant_status === 'pending' ? `
              <button class="btn btn-primary btn-sm" data-act="merchant-approved" data-id="${u.id}">通过资质</button>
              <button class="btn btn-ghost btn-sm" data-act="merchant-rejected" data-id="${u.id}">驳回</button>` : ''}
            ${u.real_name_verified && u.role !== 'admin' ? `<button class="btn btn-ghost btn-sm" data-act="kyc-revoke" data-id="${u.id}">撤销实名</button>` : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="11" class="empty">暂无用户</td></tr>'}
      </tbody></table></div>`;
  document.getElementById('u-filter').onchange = (e) => pageUsers(e.target.value);
  document.querySelectorAll('[data-act]').forEach(b => (b.onclick = async () => {
    const [kind, action] = b.dataset.act.split('-');
    if (kind === 'merchant') await api(`/api/admin/users/${b.dataset.id}/merchant`, { method: 'POST', body: { action } });
    else await api(`/api/admin/users/${b.dataset.id}/kyc`, { method: 'POST', body: { action } });
    toast('已处理', 'ok'); pageUsers(document.getElementById('u-filter').value);
  }));
}

async function pageDisputes() {
  const { disputes } = await api('/api/admin/disputes');
  document.getElementById('admin-main').innerHTML = `
    ${head('纠纷处理', '买家/卖家交易纠纷，平台介入裁决（支持先行赔付）')}
    <div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>订单号</th><th>演出</th><th>发起方</th><th>纠纷原因</th><th class="num">订单金额</th><th>状态</th><th>处理</th></tr></thead>
      <tbody>
        ${disputes.map(d => `<tr>
          <td>${d.id}</td><td>${d.order_no}</td><td>${esc(d.event_title)}</td>
          <td>${d.opened_by === 'buyer' ? '买家 ' + esc(d.buyer_name) : '卖家 ' + esc(d.seller_name)}</td>
          <td style="max-width:320px">${esc(d.reason)}</td>
          <td class="num">${money(d.total_amount)}</td>
          <td>${chip(d.status, { open: '待处理', resolved: '已解决', rejected: '已驳回' })}</td>
          <td>${d.status === 'open' ? `
            <button class="btn btn-primary btn-sm" data-act="compensate" data-id="${d.id}" data-amount="${d.total_amount}">退款买家</button>
            <button class="btn btn-ghost btn-sm" data-act="reject" data-id="${d.id}">驳回纠纷</button>` : esc(d.resolution || '-')}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="empty">暂无纠纷</td></tr>'}
      </tbody></table></div>
    <div class="notice notice-info" style="margin-top:14px">${icon('info')}「退款买家」将从托管资金全额退还买家；赔付金额部分由平台先行赔付基金承担，后续向卖家追偿。</div>`;
  document.querySelectorAll('[data-act]').forEach(b => (b.onclick = async () => {
    const compensate = b.dataset.act === 'compensate';
    let compensation = 0;
    if (compensate) {
      const v = prompt(`确认向买家全额退款 ${money(b.dataset.amount)} 元？\n如需动用先行赔付基金补足差额，请输入赔付金额（无则填 0）：`, '0');
      if (v === null) return;
      compensation = +v || 0;
    } else if (!confirm('确认驳回该纠纷？订单将正常结算给卖家。')) return;
    const resolution = prompt('处理结论（将记录存档）：', compensate ? '卖家未履约，平台先行赔付，买家全额退款' : '证据不足，驳回纠纷，订单正常结算');
    await api(`/api/admin/disputes/${b.dataset.id}/resolve`, { method: 'POST', body: { compensate, compensation, resolution } });
    toast('纠纷已处理', 'ok'); pageDisputes();
  }));
}

async function pageCompliance() {
  const c = await api('/api/admin/compliance');
  document.getElementById('admin-main').innerHTML = `
    ${head('合规中心', '监管规则落实与风险监控')}
    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">${icon('alert-triangle')}溢价超限票品</div><div class="k-value ${c.over_cap.length ? 'danger' : ''}">${c.over_cap.length}</div><div class="k-sub">上限：票面 × ${c.cap}</div></div>
      <div class="kpi"><div class="k-label">${icon('user')}未实名在售卖家</div><div class="k-value ${c.unverified_sellers.length ? 'warn' : ''}">${c.unverified_sellers.length}</div><div class="k-sub">须立即下架并补验</div></div>
      <div class="kpi"><div class="k-label">${icon('shield-check')}商家资质待审</div><div class="k-value">${c.pending_merchant}</div><div class="k-sub">《营业执照》+《营业性演出许可证》</div></div>
    </div>
    <div class="panel">
      <h3>${icon('alert-triangle')}溢价超限票品（自动监测）</h3>
      <div class="table-wrap" style="border:none"><table class="table">
        <thead><tr><th>#</th><th>演出</th><th>卖家</th><th class="num">票面</th><th class="num">售价</th><th>溢价率</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${c.over_cap.map(l => `<tr>
            <td>${l.id}</td><td>${esc(l.event_title)}</td><td>${esc(l.seller_name)}</td>
            <td class="num">${money(l.face_value)}</td><td class="num">${money(l.price)}</td>
            <td><span class="badge badge-danger">${(l.premium_rate * 100).toFixed(0)}%</span></td>
            <td>${chip(l.status, LISTING_STATUS)}</td>
            <td>${l.status === 'active' ? `<button class="btn btn-danger btn-sm" data-off="${l.id}">立即下架</button>` : '已处置'}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="empty">当前无超限票品</td></tr>'}
        </tbody></table></div>
    </div>
    <div class="panel">
      <h3>${icon('scale')}监管要求落实清单</h3>
      <ul class="list-plain">
        <li>${icon('check-circle')}<span><b>实名购票入场</b>（文旅部/公安部 2023-09 通知）：买卖双方强制实名，下单绑定观演人证件（一人一证一票）。</span></li>
        <li>${icon('check-circle')}<span><b>梯次退票机制</b>：当前阶梯 ${c.refund_tiers.map(t => `≥${t.min_days}天 ${(t.fee * 100).toFixed(0)}%`).join(' ｜ ')}，可在「平台设置」调整。</span></li>
        <li>${icon('check-circle')}<span><b>溢价管控</b>：发布环节硬性拦截售价 &gt; 票面 × ${c.cap}，后台持续扫描存量。</span></li>
        <li>${icon('check-circle')}<span><b>票源公示</b>：每条票品公示票源渠道与购票凭证，禁止工作票/内部票。</span></li>
        <li>${icon('check-circle')}<span><b>涉税信息报送</b>：按季度导出平台内经营者身份与收入信息（见「财税中心」），符合 2025 年《互联网平台企业涉税信息报送规定》。</span></li>
        <li>${icon('alert-triangle')}<span><b>资金合规（上线前必办）</b>：托管资金须接入持牌支付机构或银行存管，平台不得自行归集划转（防"二清"）。</span></li>
        <li>${icon('alert-triangle')}<span><b>经营资质（上线前必办）</b>：平台主体需办理 ICP 经营许可证、完成市场主体登记；票务经营环节遵守 2017 年文化部票务市场通知。</span></li>
      </ul>
    </div>`;
  document.querySelectorAll('[data-off]').forEach(b => (b.onclick = async () => {
    await api(`/api/admin/listings/${b.dataset.off}/status`, { method: 'POST', body: { status: 'offline' } });
    toast('已下架', 'ok'); pageCompliance();
  }));
}

async function pageTax() {
  const period = state.taxPeriod;
  const { report: r, sellers } = await api('/api/admin/tax?period=' + period);
  const year = +period.slice(0, 4);
  document.getElementById('admin-main').innerHTML = `
    ${head('财税中心', '平台收入、税费测算与涉税信息报送', `
      <select class="select" id="t-period">
        ${[1, 2, 3, 4].map(q => `<option value="${year}Q${q}" ${period === `${year}Q${q}` ? 'selected' : ''}>${year} 年 Q${q}</option>`).join('')}
        ${[1, 2, 3, 4].map(q => `<option value="${year - 1}Q${q}" ${period === `${year - 1}Q${q}` ? 'selected' : ''}>${year - 1} 年 Q${q}</option>`).join('')}
      </select>
      <a class="btn btn-ghost" href="/api/admin/tax/report.csv?period=${period}" download>${icon('download')}导出涉税报送 CSV</a>`)}
    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">期间 GMV</div><div class="k-value">¥${money(r.gmv)}</div><div class="k-sub">${r.order_count} 笔成交</div></div>
      <div class="kpi"><div class="k-label">平台收入（含税）</div><div class="k-value accent">¥${money(r.revenue_gross)}</div><div class="k-sub">佣金 ${money(r.revenue_breakdown.commission)} + 服务费 ${money(r.revenue_breakdown.buyer_fee)} + 退票费 ${money(r.revenue_breakdown.refund_fee)}</div></div>
      <div class="kpi"><div class="k-label">不含税收入</div><div class="k-value">¥${money(r.revenue_net)}</div><div class="k-sub">价税分离 ÷ (1+${(r.rates.vat_rate * 100).toFixed(0)}%)</div></div>
      <div class="kpi"><div class="k-label">增值税（${(r.rates.vat_rate * 100).toFixed(0)}%）</div><div class="k-value warn">¥${money(r.vat)}</div><div class="k-sub">现代服务-信息技术服务</div></div>
      <div class="kpi"><div class="k-label">附加税费（${(r.rates.surcharge_rate * 100).toFixed(0)}% of VAT）</div><div class="k-value warn">¥${money(r.surcharges)}</div><div class="k-sub">城建税 7% + 教育附加 3% + 地方教育 2%</div></div>
      <div class="kpi"><div class="k-label">企业所得税估算（${(r.rates.cit_rate * 100).toFixed(0)}%）</div><div class="k-value warn">¥${money(r.cit)}</div><div class="k-sub">应纳税所得额 ¥${money(r.taxable_income)}</div></div>
      <div class="kpi"><div class="k-label">期间成本</div><div class="k-value">¥${money(r.cost_total)}</div><div class="k-sub">${r.costs.map(c => `${c.category} ${money(c.total)}`).join(' ｜ ') || '未录入'}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px">
      <div class="panel">
        <h3>${icon('file-text')}平台内经营者收入明细（${period} 报送口径）</h3>
        <div class="table-wrap" style="border:none"><table class="table">
          <thead><tr><th>经营者</th><th>类型</th><th>证件号(脱敏)</th><th class="num">订单数</th><th class="num">收入总额</th><th class="num">支付平台费用</th></tr></thead>
          <tbody>
            ${sellers.map(s => `<tr>
              <td>${esc(s.name)}</td><td>${s.seller_type === 'business' ? '企业/个体' : '个人'}</td><td>${esc(s.id_card || '-')}</td>
              <td class="num">${s.order_count}</td><td class="num">${money(s.income_total)}</td><td class="num">${money(s.platform_fee_total)}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="empty">本期无成交</td></tr>'}
          </tbody></table></div>
        <div class="form-hint" style="margin-top:8px">依据《互联网平台企业涉税信息报送规定》（2025-06 国务院令第 810 号），应于季度终了次月内向主管税务机关报送。</div>
      </div>
      <div class="panel">
        <h3>${icon('plus')}录入期间成本</h3>
        <div class="form-row"><label>归属期间</label><input class="input" id="c-period" value="${period}" placeholder="2026Q3"></div>
        <div class="form-row"><label>类别</label>
          <select class="select" id="c-category"><option>运营成本</option><option>技术成本</option><option>赔付支出</option><option>推广费用</option><option>其他</option></select></div>
        <div class="form-row"><label>金额（元）</label><input class="input" id="c-amount" type="number" min="0" step="0.01"></div>
        <div class="form-row"><label>备注</label><input class="input" id="c-note" placeholder="如：服务器、短信、客服人力"></div>
        <button class="btn btn-primary" id="c-submit">保存成本记录</button>
        <div class="form-hint" style="margin-top:10px">成本用于企业所得税估算；实际申报以财务账簿与发票为准。</div>
      </div>
    </div>
    <div class="notice notice-warn" style="margin-top:14px">${icon('alert-triangle')}本页为经营测算与报送辅助，不构成税务意见。实际纳税义务、税率适用（如小规模纳税人优惠）与申报口径请以主管税务机关与专业税务顾问为准。</div>`;
  document.getElementById('t-period').onchange = (e) => { state.taxPeriod = e.target.value; pageTax(); };
  document.getElementById('c-submit').onclick = async () => {
    try {
      await api('/api/admin/costs', { method: 'POST', body: {
        period: document.getElementById('c-period').value,
        category: document.getElementById('c-category').value,
        amount: +document.getElementById('c-amount').value,
        note: document.getElementById('c-note').value
      } });
      toast('成本已记录', 'ok'); pageTax();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function pageSettings() {
  const { settings: s } = await api('/api/admin/settings');
  const tiers = JSON.parse(s.refund_tiers);
  document.getElementById('admin-main').innerHTML = `
    ${head('平台设置', '计价、溢价管控、退票与税率参数（修改即时生效）')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="panel">
        <h3>${icon('dollar')}交易计价</h3>
        <div class="form-row"><label>卖家佣金率（如 0.08 = 8%）</label><input class="input" id="s-commission" value="${esc(s.commission_rate)}"></div>
        <div class="form-row"><label>买家服务费率</label><input class="input" id="s-buyerfee" value="${esc(s.buyer_service_fee_rate)}"></div>
        <div class="form-row"><label>价格上限倍数（售价 ≤ 票面 × N，合规要求取值 0–1.0）</label><input class="input" id="s-cap" value="${esc(s.price_cap_multiplier)}"></div>
      </div>
      <div class="panel">
        <h3>${icon('landmark')}税率参数</h3>
        <div class="form-row"><label>增值税率</label><input class="input" id="s-vat" value="${esc(s.vat_rate)}"></div>
        <div class="form-row"><label>附加税费率（对 VAT）</label><input class="input" id="s-surcharge" value="${esc(s.surcharge_rate)}"></div>
        <div class="form-row"><label>企业所得税率（估算）</label><input class="input" id="s-cit" value="${esc(s.cit_rate)}"></div>
      </div>
      <div class="panel" style="grid-column:1/-1">
        <h3>${icon('refresh')}阶梯退票规则（距开演 ≥N 天的手续费率）</h3>
        <div id="tier-rows">
          ${tiers.map((t, i) => `
            <div style="display:grid;grid-template-columns:1fr 1fr 40px;gap:10px;margin-bottom:8px" class="tier-row">
              <input class="input t-days" type="number" min="0" value="${t.min_days}" placeholder="距开演天数">
              <input class="input t-fee" type="number" min="0" max="1" step="0.05" value="${t.fee}" placeholder="手续费率 0-1">
              <button class="btn btn-ghost btn-sm" data-del="${i}">删除</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm" id="tier-add">${icon('plus')}添加阶梯</button>
        <div class="form-hint">费率 1.0 表示该时段不可退票；文旅部要求建立梯次退票收费标准并公示。</div>
      </div>
      <div class="panel" style="grid-column:1/-1">
        <h3>${icon('info')}平台声明</h3>
        <div class="form-row"><textarea class="input" id="s-disclaimer" rows="2">${esc(s.disclaimer)}</textarea></div>
        <button class="btn btn-primary" id="s-save" style="height:40px;padding:0 26px">保存全部设置</button>
      </div>
    </div>`;
  document.getElementById('tier-add').onclick = () => {
    document.getElementById('tier-rows').insertAdjacentHTML('beforeend', `
      <div style="display:grid;grid-template-columns:1fr 1fr 40px;gap:10px;margin-bottom:8px" class="tier-row">
        <input class="input t-days" type="number" min="0" value="0">
        <input class="input t-fee" type="number" min="0" max="1" step="0.05" value="0.5">
        <button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">删除</button>
      </div>`);
  };
  document.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => b.closest('.tier-row').remove()));
  document.getElementById('s-save').onclick = async () => {
    try {
      const tiers = [...document.querySelectorAll('.tier-row')].map(r => ({
        min_days: +r.querySelector('.t-days').value, fee: +r.querySelector('.t-fee').value
      }));
      await api('/api/admin/settings', { method: 'PUT', body: {
        commission_rate: +document.getElementById('s-commission').value,
        buyer_service_fee_rate: +document.getElementById('s-buyerfee').value,
        price_cap_multiplier: +document.getElementById('s-cap').value,
        vat_rate: +document.getElementById('s-vat').value,
        surcharge_rate: +document.getElementById('s-surcharge').value,
        cit_rate: +document.getElementById('s-cit').value,
        refund_tiers: tiers,
        disclaimer: document.getElementById('s-disclaimer').value
      } });
      toast('设置已保存并即时生效', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
}

(async function boot() {
  if (!state.token) return renderLogin();
  const me = await api('/api/me').catch(() => null);
  if (!me || me.user.role !== 'admin') return renderLogin();
  state.user = me.user;
  renderShell();
})();
