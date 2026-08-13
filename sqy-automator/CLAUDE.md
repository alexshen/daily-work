# sqy-automator

Automates operations on sqy (https://jczl.sh.cegn.cn), which is written with
Vue.js. The main script `sqy_add_visit_record.py` logs in by QR code, reads
走访记录 (visit records) from an xlsx file, and submits each one through the
web form on the 走访登记平台 page.

## Requirements

Install the requirements by `pip install -r requirements.txt`:

- playwright: 1.15.3
  1.15.3 must be installed so that the script can run on Windows 7. This pins
  the API surface to that version: no `locator.wait_for`, no `has_text=` param
  (use the `:has-text()` pseudo-class), etc.

- pyee: 8.2.2
- openpyxl: 3.1.5

## Usage

```bash
python sqy_add_visit_record.py                                  # submit the built-in EXAMPLE_RECORD
python sqy_add_visit_record.py -i records.xlsx                  # read records from an xlsx file
python sqy_add_visit_record.py -i records.xlsx --months 8 12    # only the 8月 and 12月 sheets
python sqy_add_visit_record.py -i records.xlsx --confirm        # pause between records for manual check
```

The script opens a visible browser, waits for the user to scan the QR code on
the `#/login` page, then submits each visit record. `--months` accepts single
numbers or `from,to` closed ranges and defaults to the current month.

### xlsx input format

- One worksheet per month, named `X月` (e.g. `8月`). Missing sheets are a fatal
  error; header columns outside the known fields print a warning and are ignored.
- The first row is the header; column names are the record fields: 走访对象,
  居住地址, 方式, 走访时间, 参与人员, 走访详情, 服务标签.
- The 服务标签 column is a JSON string: a list of dicts, each with a `tag` key
  plus that tag's service-form fields (see `EXAMPLE_RECORD` for the structure).
  Empty cells are preserved as empty strings so that "field present but empty"
  is distinguishable from a missing field.

## Key implementation notes

- Vue.js + Element UI: dialogs and select dropdowns are teleported to `<body>`,
  so their locators must be page-level, not inside the dialog.
- The SPA is hash-routed; Playwright's `page.url` is not reliably refreshed on
  hash-only navigation, so `current_url()` reads `window.location.href` instead.
- Submission is confirmed by waiting for the `/sqy-admin/api/bfForm/saveVisit`
  response and checking its JSON `status == 200` (response data is encrypted;
  only the status is read).
- 走访对象 is picked in a separate "选择居民" dialog: search by name, then match
  the address column (normalized: whitespace and a trailing "室" stripped). If no
  row matches, the record is skipped (`RecordSkipped`), the dialog is closed, and
  processing continues with the next record.
- The server is unstable: resident-search requests retry up to 3 times
  (`RESIDENT_SEARCH_RETRIES`), with a 1s interval between attempts.
- Playwright 1.15.3 quirks to keep in mind when editing: use `page.wait_for_selector`
  instead of locator-based waits, `:has-text()` instead of `has_text=`, and
  `all_text_contents()` instead of `all_text`.
