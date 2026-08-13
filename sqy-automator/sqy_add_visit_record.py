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

# 示例记录；运行时可按需修改。参与人员用空格分隔的姓名列表。
EXAMPLE_RECORD = {
    "方式": "走访",  # 需是 方式 下拉框里存在的选项
    "走访时间": "2026-08-12 14:30:00",  # 需与日期时间选择器的格式一致
    "参与人员": "李凯 朱晓庆",  # 空格分隔；姓名需在下拉框里存在
    "走访详情": "上门了解老人近期生活状况。",
}


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


def _form_item(dialog, label):
    """Return the .el-form-item whose label text contains `label` (unique per field).

    1.15 的 locator() 不接受 has_text 参数，改用 :has-text() 伪类（同为子串匹配）。
    """
    return dialog.locator(f".el-form-item:has-text('{label}')")


def _open_dropdown_and_get(page, form_item, timeout_ms=5000):
    """Open an el-select and return its visible dropdown.

    Element UI copies the dropdown from a template and teleports it to <body>
    (class .el-select-dropdown.el-popper, display not none when open), so locate
    it at page level rather than inside the select.
    """
    form_item.locator(".el-select").click()
    # 1.15 没有 locator.wait_for，用 page.wait_for_selector 等待下拉出现
    page.wait_for_selector(
        ".el-select-dropdown.el-popper:visible", state="visible", timeout=timeout_ms
    )
    # 模板里可能还有一个 display:none 的下拉副本，挑可见的那个返回
    dropdowns = page.locator(".el-select-dropdown.el-popper")
    for i in range(dropdowns.count()):
        if dropdowns.nth(i).is_visible():
            return dropdowns.nth(i)
    raise TimeoutError("下拉列表未出现")


def set_visit_type(page, dialog, value):
    """Fill the single-select 方式 field; single-select closes automatically."""
    dropdown = _open_dropdown_and_get(page, _form_item(dialog, "方式"))
    dropdown.locator(f".el-select-dropdown__item:has-text('{value}')").click()


def set_visit_time(page, dialog, value):
    """Fill the 走访时间 datetime input and confirm with the picker's 确定 button.

    Element UI's datetime picker does not commit or close on Enter; the panel
    stays open until its footer 确定 button is clicked. That button lives at
    page level (the picker is teleported to <body>), so `page` is required.
    """
    inp = _form_item(dialog, "走访时间").locator("input.el-input__inner")
    inp.fill(value)
    inp.press("Enter")
    page.locator(
        ".el-picker-panel__footer .el-picker-panel__link-btn:has-text('确定')"
    ).click()


def set_join_users(page, dialog, users):
    """Set the multi-select 参与人员 to exactly the given names.

    `users` is a whitespace-separated name string (e.g. "李凯 朱晓庆"), or a
    list. The dialog usually starts with the current user shown as a tag; any
    currently-selected name not in `users` is removed via its close icon, then
    the listed names are picked from the dropdown.
    """
    target = set(users.split()) if isinstance(users, str) else set(users)
    form_item = _form_item(dialog, "参与人员")

    # Remove current tags whose name is not in the target list.
    while True:
        tag_to_remove = None
        tags = form_item.locator(".el-tag")
        for i in range(tags.count()):
            name = tags.nth(i).locator(".el-select__tags-text").inner_text().strip()
            if name not in target:
                tag_to_remove = tags.nth(i)
                break
        if tag_to_remove is None:
            break
        tag_to_remove.locator(".el-tag__close").click()

    # Pick the listed names from the dropdown (multi-select stays open on click).
    dropdown = _open_dropdown_and_get(page, form_item)
    items = dropdown.locator(".el-select-dropdown__item")
    for i in range(items.count()):
        item = items.nth(i)
        name = item.inner_text().strip()
        selected = "selected" in (item.get_attribute("class") or "").split()
        if name in target and not selected:
            item.click()

    # Close the dropdown by clicking outside it (not Escape — dialogs close on Escape).
    dialog.locator(".el-dialog__title").click()

    picked = set(form_item.locator(".el-select__tags-text").all_text_contents())
    missing = target - picked
    if missing:
        print(f"警告: 参与人员下拉中未找到/未选中: {missing}", file=sys.stderr)


def set_visit_content(dialog, value):
    """Fill the 走访详情 textarea."""
    _form_item(dialog, "走访详情").locator("textarea").fill(value)


def fill_visit_record_form(page, record, timeout_ms=PAGE_LOAD_TIMEOUT_MS):
    """Fill the open 新增接待走访 dialog from `record`.

    Supported keys: 方式, 走访时间, 参与人员, 走访详情.
    Keys absent from `record` are left untouched. 走访对象 and 服务内容 are not
    implemented yet.
    """
    page.wait_for_selector(VISIT_DIALOG, state="visible", timeout=timeout_ms)
    dialog = page.locator(VISIT_DIALOG)

    if "方式" in record:
        set_visit_type(page, dialog, record["方式"])
    if "走访时间" in record:
        set_visit_time(page, dialog, record["走访时间"])
    if "参与人员" in record:
        set_join_users(page, dialog, record["参与人员"])
    if "走访详情" in record:
        set_visit_content(dialog, record["走访详情"])


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

        fill_visit_record_form(page, EXAMPLE_RECORD)
        print("表单已按示例记录填写，浏览器保持打开供检查")
        input("检查表单填写结果，按回车退出...")


if __name__ == "__main__":
    main()
