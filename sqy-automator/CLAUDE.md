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
- rich: 14.3.4
  The Rich TUI (`sqy_ui.py`) uses `Live(get_renderable=...)`, `Text.wrap`,
  and `Progress.get_renderable()` — all present in 14.3.4. Don't reach for APIs
  added after it (e.g. `live.update` on a `get_renderable` Live, `Task`-level
  wait helpers).

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

Re-running the script is safe: records already submitted successfully are skipped
(see the ledger note below).

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
- Duplicate submissions are prevented by a local SQLite ledger
  (`SubmittedLedger`, DB at `~/.sqy_automator.sqlite3` — outside the repo, no
  `.gitignore` needed). A record's identity is 走访对象 + 居住地址 + 走访时间,
  normalized the same way as the resident match. A record already in the ledger
  is skipped before the form dialog even opens; a record is added to the ledger
  only after a confirmed `status == 200` submit. The ledger must be writable —
  init failure exits before the browser opens. Known limitation: a submit whose
  response is lost to a timeout is not recorded, so a re-run re-attempts it (the
  server may have saved it; that ambiguity is out of scope).
- Playwright 1.15.3 quirks to keep in mind when editing: use `page.wait_for_selector`
  instead of locator-based waits, `:has-text()` instead of `has_text=`, and
  `all_text_contents()` instead of `all_text`.

## Rich TUI (`sqy_ui.py`)

The CLI is a three-stage full-screen Rich TUI driven by `AppUI` from
`sqy_ui.py`:

- **login**: a `Spinner` + status text at the top, log below (no progress).
- **processing**: a `Progress` bar fixed at the top, log below.
- **completed**: `✓ Processing completed` + a summary line at the top, the log
  retained.

Key behaviors to preserve when editing:

- Business code emits logs via the module logger
  (`logger.info/warning/error`) — there must be no `print()` added for UI
  purposes.
- The log region is a **fixed-height viewport showing only the tail** of the
  full log history. Full history is kept in memory (`LogBuffer`) and mirrored
  to `~/.sqy_add_visit_record.log` (UTF-8, append). Terminal resizing
  recomputes the viewport height live and must never discard history; log
  output must never scroll the terminal.
- Log lines are wrapped with Rich `Text.wrap` (CJK cell-accurate), so one log
  message may span several terminal rows.
- `AppUI.setup_logging(logger)` configures the logger (level INFO,
  `propagate=False`) with the TUI handler + the file handler. It runs before
  `parse_args()` so early fatal errors still reach the real stderr.
- Concurrency rule: the auto-refresh thread holds `Live._lock` while rendering,
  so `live.refresh()` must never be called while holding the `LogBuffer` lock.
- The two user pauses (`--confirm`, final keep-browser-open) go through
  `AppUI.pause()`, which renders the prompt in-frame and blocks on an
  echo-off Enter read without stopping/restarting the `Live`.
