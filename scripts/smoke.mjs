// 端到端冒烟测试：完整跑通交易流、退款、纠纷、税务
// 用法：先启动服务（node server/index.js），再执行 node scripts/smoke.mjs
const BASE = process.env.BASE || 'http://localhost:8321';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
};
async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const login = async (phone, name) => (await call('/api/auth/login', { method: 'POST', body: { phone, name } })).data;

console.log('1. 公开接口');
const meta = await call('/api/meta/settings');
ok('平台配置读取', meta.status === 200 && meta.data.price_cap_multiplier === 1);
const listings = await call('/api/listings');
ok('在售列表', listings.status === 200 && listings.data.listings.length >= 8, `got ${listings.data?.listings?.length}`);

console.log('2. 登录与实名');
const admin = await login('18800000000', '平台管理员');
ok('管理员登录', !!admin.token && admin.user.role === 'admin');
const buyer = await login('13955556666', '李晓');
ok('买家登录', !!buyer.token && buyer.user.real_name_verified === true);
const seller = await login('13911112222', '王晓明');
ok('卖家登录', !!seller.token);
const newbie = await login('13600001111', '新用户');
ok('新用户注册', !!newbie.token && newbie.user.real_name_verified === false);
const rn = await call('/api/me/realname', { method: 'PUT', token: newbie.token, body: { real_name: '测试员', id_card: '110101199003077758' } });
ok('新用户实名认证', rn.status === 200 && rn.data.user.real_name_verified === true);

console.log('3. 发布票品（溢价管控）');
const overCap = await call('/api/listings', { method: 'POST', token: seller.token, body: { event_id: 1, seat_info: '测试座', face_value: 1000, price: 1500, quantity: 1, ticket_type: '电子票-官方转赠', transfer_method: '大麦转赠', source_channel: '个人自购', declaration: true } });
ok('溢价超限被拦截(422)', overCap.status === 422);
const overFace = await call('/api/listings', { method: 'POST', token: seller.token, body: { event_id: 1, seat_info: '测试座', face_value: 1000, price: 1001, quantity: 1, ticket_type: '电子票-官方转赠', transfer_method: '大麦转赠', source_channel: '个人自购', declaration: true } });
ok('超票面 1 元也被拦截(422)', overFace.status === 422);
const inCap = await call('/api/listings', { method: 'POST', token: seller.token, body: { event_id: 1, seat_info: '测试座 1 排 1 号', face_value: 1000, price: 1000, quantity: 2, ticket_type: '电子票-官方转赠', transfer_method: '大麦转赠', source_channel: '个人自购', declaration: true } });
ok('原价发布成功', inCap.status === 200 && inCap.data.status === 'active');
const noDecl = await call('/api/listings', { method: 'POST', token: seller.token, body: { event_id: 1, face_value: 1000, price: 1000, declaration: false } });
ok('未勾选承诺被拦截(400)', noDecl.status === 400);
const newListingId = inCap.data.id;

console.log('4. 完整交易流：下单→托管支付→转赠→确认结算');
const order = await call('/api/orders', { method: 'POST', token: buyer.token, body: { listing_id: newListingId, quantity: 1, attendee_name: '李晓', attendee_id_card: '440305199405123332' } });
ok('下单成功', order.status === 200 && order.data.status === 'pending_payment');
ok('计价正确', order.data.total_amount === 1000 + 50, JSON.stringify(order.data));
const oid = order.data.id;
const badId = await call('/api/orders', { method: 'POST', token: buyer.token, body: { listing_id: newListingId, quantity: 1, attendee_name: '李晓', attendee_id_card: '123' } });
ok('观演人证件校验(400)', badId.status === 400);
const pay = await call(`/api/orders/${oid}/pay`, { method: 'POST', token: buyer.token });
ok('支付进入托管', pay.status === 200 && pay.data.status === 'paid_escrow');
const earlyConfirm = await call(`/api/orders/${oid}/confirm`, { method: 'POST', token: buyer.token });
ok('未转赠不可确认(409)', earlyConfirm.status === 409);
const sellerPay = await call(`/api/orders/${oid}/transfer`, { method: 'POST', token: buyer.token });
ok('买家不可标记转赠(403)', sellerPay.status === 403);
const transfer = await call(`/api/orders/${oid}/transfer`, { method: 'POST', token: seller.token });
ok('卖家标记转赠', transfer.status === 200 && transfer.data.status === 'transferred');
const confirm = await call(`/api/orders/${oid}/confirm`, { method: 'POST', token: buyer.token });
ok('买家确认收票', confirm.status === 200 && confirm.data.status === 'completed');
const sellerMe = await call('/api/me', { token: seller.token });
ok('卖家货款到账(1000-80佣金=920)', Math.abs(sellerMe.data.user.balance - 920) < 0.01, `balance=${sellerMe.data.user.balance}`);

console.log('5. 阶梯退票');
const stockBefore = (await call(`/api/listings/3`)).data.listing.quantity;
const order2 = await call('/api/orders', { method: 'POST', token: buyer.token, body: { listing_id: 3, quantity: 1, attendee_name: '李晓', attendee_id_card: '440305199405123332' } });
await call(`/api/orders/${order2.data.id}/pay`, { method: 'POST', token: buyer.token });
ok('支付后库存扣减', (await call(`/api/listings/3`)).data.listing.quantity === stockBefore - 1);
const refund = await call(`/api/orders/${order2.data.id}/refund`, { method: 'POST', token: buyer.token, body: { reason: '行程冲突' } });
ok('退款成功', refund.status === 200 && refund.data.status === 'refunded');
ok('阶梯费率生效(10%)', refund.data.refund_fee_rate === 0.1, `rate=${refund.data.refund_fee_rate}`);
ok('票品库存回补', (await call(`/api/listings/3`)).data.listing.quantity === stockBefore);

console.log('6. 纠纷与先行赔付');
const order3 = await call('/api/orders', { method: 'POST', token: buyer.token, body: { listing_id: 2, quantity: 1, attendee_name: '李晓', attendee_id_card: '440305199405123332' } });
await call(`/api/orders/${order3.data.id}/pay`, { method: 'POST', token: buyer.token });
const disp = await call(`/api/orders/${order3.data.id}/dispute`, { method: 'POST', token: buyer.token, body: { reason: '卖家超时未转赠' } });
ok('发起纠纷', disp.status === 200 && disp.data.status === 'disputed');
const disps = await call('/api/admin/disputes', { token: admin.token });
const d0 = disps.data.disputes.find(d => d.order_id === order3.data.id);
const resolve = await call(`/api/admin/disputes/${d0.id}/resolve`, { method: 'POST', token: admin.token, body: { compensate: true, compensation: 0, resolution: '卖家未履约，全额退款' } });
ok('管理员裁决退款', resolve.status === 200);

console.log('7. 经营后台与税务');
const dash = await call('/api/admin/dashboard', { token: admin.token });
ok('仪表盘 KPI', dash.status === 200 && dash.data.kpi.revenue > 0 && dash.data.kpi.gmv > 0);
ok('非管理员被拒(403)', (await call('/api/admin/dashboard', { token: buyer.token })).status === 403);
const tax = await call('/api/admin/tax?period=2026Q3', { token: admin.token });
ok('税务测算', tax.status === 200 && tax.data.report.vat > 0 && tax.data.report.revenue_net > 0);
console.log(`    2026Q3：含税收入 ${tax.data.report.revenue_gross} ｜ VAT ${tax.data.report.vat} ｜ 附加 ${tax.data.report.surcharges} ｜ 企税估算 ${tax.data.report.cit}`);
ok('报送明细含卖家', tax.data.sellers.length >= 1);
const csv = await fetch(BASE + '/api/admin/tax/report.csv?period=2026Q3', { headers: { Authorization: 'Bearer ' + admin.token } });
ok('CSV 导出', csv.status === 200 && (await csv.text()).includes('平台内经营者名称'));
const compliance = await call('/api/admin/compliance', { token: admin.token });
ok('合规中心', compliance.status === 200 && Array.isArray(compliance.data.over_cap));
const setRes = await call('/api/admin/settings', { method: 'PUT', token: admin.token, body: { commission_rate: 0.08 } });
ok('设置保存', setRes.status === 200);
const capClamp = await call('/api/admin/settings', { method: 'PUT', token: admin.token, body: { price_cap_multiplier: 1.3 } });
ok('价格上限不可调超票面(400)', capClamp.status === 400);

console.log('8. 粉丝社区（Fans-to-Fans，无在线交易）');
const forumList = await call('/api/forum/posts');
ok('社区帖子列表', forumList.status === 200 && forumList.data.posts.length >= 6);
ok('按类型筛选(求票)', (await call('/api/forum/posts?kind=wanted')).data.posts.every(p => p.kind === 'wanted'));
ok('未登录发帖被拒(401)', (await call('/api/forum/posts', { method: 'POST', body: {} })).status === 401);
const stranger = await login('13600002222', '路人甲');
const noRn = await call('/api/forum/posts', { method: 'POST', token: stranger.token, body: { kind: 'discuss', title: '测试帖子标题', content: '测试内容测试内容测试内容' } });
ok('未实名发帖被拒(403)', noRn.status === 403);
const overCapPost = await call('/api/forum/posts', { method: 'POST', token: seller.token, body: { kind: 'selling', event_id: 1, title: '测试溢价拦截帖', content: '测试内容：溢价超过上限应被拦截。', face_value: 1000, price: 1500, declaration: true } });
ok('社区转票溢价超限被拦截(422)', overCapPost.status === 422);
const noDeclPost = await call('/api/forum/posts', { method: 'POST', token: seller.token, body: { kind: 'selling', event_id: 1, title: '未勾选承诺的转票帖', content: '测试内容：未勾选承诺应被拦截。', face_value: 1000, price: 1000, declaration: false } });
ok('转票未勾选承诺被拦截(400)', noDeclPost.status === 400);
const newPost = await call('/api/forum/posts', { method: 'POST', token: seller.token, body: { kind: 'selling', event_id: 1, title: '周杰伦内场 1 张原价转', content: '大麦官方转赠通道过户，全程可录屏，凭证已备好。', face_value: 2080, price: 2080, quantity: 1, transfer_method: '大麦 APP 官方转赠', proof: 'test-proof.jpg', declaration: true } });
ok('转票帖发布成功且进入验真', newPost.status === 200 && newPost.data.verify_status === 'pending', JSON.stringify(newPost.data));
const riskPost = await call('/api/forum/posts', { method: 'POST', token: seller.token, body: { kind: 'discuss', title: '测试风险话术标记', content: '需要的话先付定金锁票，这个应该被标记。' } });
ok('站外话术自动标记风险', riskPost.status === 200 && riskPost.data.risk_flag === 1);
const contactPost = await call('/api/forum/posts', { method: 'POST', token: seller.token, body: { kind: 'wanted', event_id: 2, title: '求测试票带联系方式', content: '测试内容：发帖人自愿公开联系方式用于私聊。', contact: '微信：smoke-test-001' } });
ok('发帖可附联系方式', contactPost.status === 200);
const anonDetail = await call(`/api/forum/posts/${contactPost.data.id}`);
ok('游客不可见联系方式', anonDetail.status === 200 && anonDetail.data.post.contact === '' && anonDetail.data.post.contact_locked === true);
const strangerDetail = await call(`/api/forum/posts/${contactPost.data.id}`, { token: stranger.token });
ok('未实名用户不可见联系方式', strangerDetail.status === 200 && strangerDetail.data.post.contact_locked === true);
const buyerDetail = await call(`/api/forum/posts/${contactPost.data.id}`, { token: buyer.token });
ok('实名用户可见联系方式', buyerDetail.status === 200 && buyerDetail.data.post.contact === '微信：smoke-test-001');
const detail = await call('/api/forum/posts/1');
ok('帖子详情含作者与评论', detail.status === 200 && !!detail.data.author && detail.data.comments.length === 2);
ok('未登录评论被拒(401)', (await call('/api/forum/posts/1/comments', { method: 'POST', body: { content: '未登录评论' } })).status === 401);
const cmt = await call(`/api/forum/posts/${newPost.data.id}/comments`, { method: 'POST', token: buyer.token, body: { content: '请问还在吗？走大麦转赠的话我要了。' } });
ok('实名用户评论成功', cmt.status === 200 && cmt.data.risk_flag === 0);
const riskCmt = await call(`/api/forum/posts/${newPost.data.id}/comments`, { method: 'POST', token: buyer.token, body: { content: '可以先付定金的话发收款码给我' } });
ok('评论风险话术标记', riskCmt.status === 200 && riskCmt.data.risk_flag === 1);
const doneStatus = await call(`/api/forum/posts/${newPost.data.id}/status`, { method: 'POST', token: seller.token, body: { status: 'done' } });
ok('发帖人标记完结', doneStatus.status === 200 && doneStatus.data.status === 'done');
ok('非发帖人操作被拒(403)', (await call('/api/forum/posts/1/status', { method: 'POST', token: buyer.token, body: { status: 'done' } })).status === 403);
const report = await call('/api/forum/reports', { method: 'POST', token: buyer.token, body: { post_id: riskPost.data.id, reason: '测试举报：引导站外交易' } });
ok('提交举报', report.status === 200);
const ov = await call('/api/admin/forum/overview', { token: admin.token });
ok('社区管理总览', ov.status === 200 && ov.data.pending_verify >= 2 && ov.data.open_reports >= 2, JSON.stringify(ov.data));
const verifyOk = await call('/api/admin/forum/posts/5/verify', { method: 'POST', token: admin.token, body: { action: 'verified' } });
ok('管理员通过验真', verifyOk.status === 200 && verifyOk.data.verify_status === 'verified');
const adminReports = await call('/api/admin/forum/reports', { token: admin.token });
ok('举报列表', adminReports.status === 200 && adminReports.data.reports.length >= 2);
const rep6 = adminReports.data.reports.find(r => r.post_id === 6 && r.status === 'open');
const resolveRep = await call(`/api/admin/forum/reports/${rep6.id}/resolve`, { method: 'POST', token: admin.token, body: { hide_post: true, resolution: '核实站外交易引导，隐藏帖子' } });
ok('举报办结并隐藏帖子', resolveRep.status === 200);
ok('被隐藏帖子前台不可见(404)', (await call('/api/forum/posts/6')).status === 404);
ok('非管理员访问社区管理被拒(403)', (await call('/api/admin/forum/overview', { token: buyer.token })).status === 403);
const dash2 = await call('/api/admin/dashboard', { token: admin.token });
ok('仪表盘含社区指标', dash2.status === 200 && typeof dash2.data.kpi.forum_posts === 'number');

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
