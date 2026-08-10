#!/usr/bin/env python3
"""Add a visit record on sqy (https://jczl.sh.cegn.cn/web/#/login).

Step 1: Open the login page in a visible browser and wait for the user to
scan the QR code with their phone. Once scanned, the browser is redirected
away from the login page and the script proceeds to add the visit record.
"""

import sys
import time

from playwright.sync_api import sync_playwright

LOGIN_URL = "https://jczl.sh.cegn.cn/web/#/login"
LOGIN_HASH = "#/login"
LOGIN_TIMEOUT_SECONDS = 5 * 60  # how long to wait for the user to scan

VISIT_RECORD_URL = "https://jczl.sh.cegn.cn/web/#/jczlplatform/rcgz/syjdzf"
DATA_API = "/sqy-admin/api/sqReceptionVisit"  # data request that signals page load
PAGE_LOAD_TIMEOUT_MS = 30_000  # how long to wait for that request to finish

NEW_RECORD_BUTTON = "button.el-button--primary.filter-item:has-text('新增')"
VISIT_DIALOG = "div.el-dialog__wrapper.sqVisitDialog"


def current_url(page):
    """Return the live URL from the page.

    Reads window.location.href instead of page.url because Playwright's
    page.url is not reliably refreshed on hash-only SPA navigation
    (#/login -> #/home/new), while the DOM always reflects the true URL.
    """
    return page.evaluate("window.location.href")


def wait_for_login_redirect(page, timeout_seconds=LOGIN_TIMEOUT_SECONDS):
    """Block until the page URL no longer points at the login page."""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        url = current_url(page)
        if LOGIN_HASH not in url:
            return url
        time.sleep(1)
    raise TimeoutError(f"QR login not completed within {timeout_seconds}s")


def wait_for_visit_record_data(page, timeout_ms=PAGE_LOAD_TIMEOUT_MS):
    """Navigate to the 走访登记平台 page and wait for its data to load.

    The SPA is hash-routed, so changing the route fires an XHR for
    /sqy-admin/api/sqReceptionVisit. We start listening for that response
    before navigating, then block until it completes.
    """
    with page.expect_response(
        lambda r: DATA_API in r.url, timeout=timeout_ms
    ) as resp_info:
        page.goto(VISIT_RECORD_URL, wait_until="domcontentloaded")
    return resp_info.value


def open_new_record_dialog(page, timeout_ms=PAGE_LOAD_TIMEOUT_MS):
    """Click the 新增 button and wait for the visit-record dialog to show up.

    Element UI keeps the dialog wrapper in the DOM but hidden (display:none)
    until opened, so we wait for it to become visible rather than just exist.
    """
    page.locator(NEW_RECORD_BUTTON).click()
    page.wait_for_selector(VISIT_DIALOG, state="visible", timeout=timeout_ms)
    print("新增对话框已打开")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(LOGIN_URL)

        print("请在浏览器中扫描二维码完成登录 ...")
        try:
            final_url = wait_for_login_redirect(page)
        except TimeoutError as exc:
            print(exc, file=sys.stderr)
            browser.close()
            sys.exit(1)

        print(f"登录成功，已跳转到: {final_url}")

        resp = wait_for_visit_record_data(page)
        print(f"已进入平台，{DATA_API} 返回状态码: {resp.status}")

        open_new_record_dialog(page)

        # ---- 后续添加走访记录的操作写在这里，浏览器保持打开 ----


if __name__ == "__main__":
    main()
