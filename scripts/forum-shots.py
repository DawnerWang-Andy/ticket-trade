# 社区模块页面验证：DOM 断言 + 截图（需服务已启动）
# 用法：/opt/anaconda3/envs/polymer/bin/python scripts/forum-shots.py
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
BASE = "http://localhost:8321"
failed = []

def check(name, cond):
    print(("  OK " if cond else "  FAIL ") + name)
    if not cond:
        failed.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1360, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 0. 首页即社区（fans-to-fans 论坛为主站形态）
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(700)
    check("首页即粉丝社区", page.locator(".post-card").count() >= 6)
    check("首页法律依据提示块", page.locator(".legal-note").count() >= 1 and "治安管理处罚法" in page.content())
    check("社区横幅图渲染", page.locator(".community-hero img").count() == 1 and page.locator(".community-hero img").evaluate("img => img.naturalWidth") > 0)
    check("帖子缩略图渲染", page.locator(".post-thumb").count() >= 4 and page.locator(".post-thumb").first.evaluate("img => img.naturalWidth") > 0)
    check("头像渲染", page.locator(".avatar").count() >= 6)

    # 1. 社区列表页
    page.goto(BASE + "/#/community", wait_until="networkidle")
    page.wait_for_timeout(700)
    check("列表渲染帖子卡片", page.locator(".post-card").count() >= 6)
    check("类型徽章存在", page.locator(".badge-kind-selling").count() >= 1)
    check("风险提示徽章存在", page.locator(".badge-risk").count() >= 1)
    check("安全提示条存在", page.locator(".notice-warn").count() >= 1)
    page.screenshot(path=str(OUT / "10-community.png"), full_page=True)

    # 2. 帖子详情页（已验真转票帖）
    page.goto(BASE + "/#/community/post/1", wait_until="networkidle")
    page.wait_for_timeout(700)
    check("详情标题渲染", "周杰伦" in (page.locator(".post-head h3").inner_text() or ""))
    check("评论列表渲染(2 条)", page.locator(".comment").count() == 2)
    check("防骗指南面板存在", "保真与防骗指南" in page.content() and "只认官方转赠" in page.content())
    check("已验真徽章存在", page.locator(".badge-verified").count() >= 1)
    check("游客看联系方式被锁定", "实名认证" in page.content() and page.locator(".contact-box").count() == 0)
    check("详情演出横幅图渲染", page.locator(".event-banner").count() == 1 and page.locator(".event-banner").evaluate("img => img.naturalWidth") > 0)
    page.screenshot(path=str(OUT / "11-community-post.png"), full_page=True)

    # 2.5 票品展示页图片
    page.goto(BASE + "/#/tickets", wait_until="networkidle")
    page.wait_for_timeout(700)
    check("票品卡片图渲染", page.locator(".card-img").count() >= 8 and page.locator(".card-img").first.evaluate("img => img.naturalWidth") > 0)
    page.screenshot(path=str(OUT / "17-tickets.png"), full_page=True)

    # 3. 登录后发帖页
    page.goto(BASE + "/", wait_until="networkidle")
    page.click("#btn-login")
    page.fill("#login-phone", "13911112222")
    page.fill("#login-name", "王晓明")
    page.click("#login-submit")
    page.wait_for_timeout(500)
    page.goto(BASE + "/#/community/new", wait_until="networkidle")
    page.wait_for_timeout(600)
    check("发帖页类型切换", page.locator("#np-kind .tab").count() == 4)
    check("转票字段可见", page.locator("#np-selling").is_visible())
    check("联系方式输入框存在", page.locator("#np-contact").count() == 1)
    page.click("#np-kind .tab[data-k='wanted']")
    page.wait_for_timeout(200)
    check("切换求票隐藏价格字段", not page.locator("#np-selling").is_visible())
    page.click("#np-kind .tab[data-k='selling']")
    page.fill("#np-face", "1000")
    page.fill("#np-price", "1400")
    page.wait_for_timeout(200)
    check("原价封顶超限提示出现", "超出社区价格上限" in page.locator("#np-premium-hint").inner_text())
    page.screenshot(path=str(OUT / "12-community-new.png"), full_page=True)

    # 4. 票品详情改为社区引导（无支付）
    page.goto(BASE + "/#/listing/1", wait_until="networkidle")
    page.wait_for_timeout(600)
    check("购买按钮已移除", page.locator("#btn-buy").count() == 0)
    check("社区引导按钮存在", page.locator("#btn-go-community").count() == 1)
    page.click("#btn-go-community")
    page.wait_for_timeout(700)
    check("跳转社区并过滤演出", "community" in page.url and page.locator(".post-card").count() >= 1)

    # 4.5 实名登录后联系方式可见
    page.goto(BASE + "/#/community/post/1", wait_until="networkidle")
    page.wait_for_timeout(700)
    check("实名用户可见联系方式", page.locator(".contact-box").count() == 1 and "jay-fan-0927" in page.locator(".contact-box").inner_text())
    page.screenshot(path=str(OUT / "16-community-contact.png"), full_page=True)

    # 5. 管理后台社区管理
    admin = browser.new_page(viewport={"width": 1440, "height": 900})
    admin.goto(BASE + "/admin", wait_until="networkidle")
    admin.click("#a-login")
    admin.wait_for_timeout(900)
    admin.click(".side-item[data-page='forum']")
    admin.wait_for_timeout(700)
    check("后台社区 KPI 渲染", admin.locator(".kpi").count() >= 4)
    check("验真待审列表非空", admin.locator("#forum-body tbody tr").count() >= 1)
    admin.screenshot(path=str(OUT / "13-admin-forum-verify.png"), full_page=True)
    admin.click("[data-tab='reports']")
    admin.wait_for_timeout(600)
    check("举报列表渲染", admin.locator("#forum-body tbody tr").count() >= 1)
    admin.screenshot(path=str(OUT / "14-admin-forum-reports.png"), full_page=True)
    admin.click("[data-tab='all']")
    admin.wait_for_timeout(600)
    check("全部帖子渲染", admin.locator("#forum-body tbody tr").count() >= 6)
    admin.screenshot(path=str(OUT / "15-admin-forum-all.png"), full_page=True)

    check("无前端 JS 报错", len(errors) == 0)
    for e in errors:
        print("    JS ERROR:", e)
    browser.close()

print("FAILED:", failed if failed else "none")
raise SystemExit(1 if failed else 0)
