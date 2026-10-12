# 页面截图验证：买家端 + 管理后台（需服务已启动）
# 用法：/opt/anaconda3/envs/polymer/bin/python scripts/screenshot.py
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
BASE = "http://localhost:8321"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1360, "height": 900})

    # 买家端
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / "01-home.png"), full_page=True)

    page.goto(BASE + "/#/listing/1", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / "02-detail.png"), full_page=True)

    # 买家登录后看发布页与订单页
    page.goto(BASE + "/", wait_until="networkidle")
    page.click("#btn-login")
    page.fill("#login-phone", "13955556666")
    page.fill("#login-name", "李晓")
    page.click("#login-submit")
    page.wait_for_timeout(500)
    page.goto(BASE + "/#/publish", wait_until="networkidle")
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "03-publish.png"), full_page=True)
    page.goto(BASE + "/#/orders", wait_until="networkidle")
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "04-orders.png"), full_page=True)

    # 管理后台
    admin = browser.new_page(viewport={"width": 1440, "height": 900})
    admin.goto(BASE + "/admin", wait_until="networkidle")
    admin.click("#a-login")
    admin.wait_for_timeout(900)
    admin.screenshot(path=str(OUT / "05-admin-dashboard.png"), full_page=True)

    for nav, name in [("tax", "06-admin-tax"), ("compliance", "07-admin-compliance"), ("orders", "08-admin-orders")]:
        admin.click(f'.side-item[data-page="{nav}"]')
        admin.wait_for_timeout(700)
        admin.screenshot(path=str(OUT / f"{name}.png"), full_page=True)

    browser.close()
print("截图完成 ->", OUT)
