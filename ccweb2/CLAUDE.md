# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Tampermonkey/Greasemonkey userscript for the community management web app at `https://jczl.sh.cegn.cn/web/*`. Part of a personal monorepo (`daily-work`). No build system, no tests, no package manager — scripts are installed directly via Tampermonkey's GitHub raw URL.

## Two-file architecture

- **common.js** — Shared utility library, exposed as `window.cc`. Provides XHR interception (`XHRInterceptor`, `XHRInterceptorUtils`), CSV/TSV parsing (`readRecords`, `CSVRecordConverter`), HTTP request wrapper (`doRequest`), array batching (`divide`, `slicedMap`), and file selection (`selectFile`). Loaded via `@require` from GitHub raw URL.

- **tools.js** — Main userscript (v0.52). Registerable via Tampermonkey. Handles AES-CBC + RSA-encrypted API communication with the backend. Provides three data operations and their floating UI buttons / menu commands:
  - **Export residents** (`cmdDumpResidents`): Paginated resident data export with resume/abort via localStorage persistence
  - **Batch add visit records** (`cmdAddReceptionVisitRecord`): Upload a TSV file, parse, deduplicate (MD5 hash), and POST reception visit records in batch
  - **Export room tags** (`cmdDumpRoomTags`): Traverse address tree → fetch tags per room → download TSV (with resume/abort via localStorage persistence)

## Key API communication pattern

All secured API calls go through `doRequest()` in tools.js:
1. Intercept `/sqy-admin/api/conf/encrypt` response to capture RSA public key
2. For each request: generate random AES key + IV (16-char from seed), RSA-encrypt them in headers (`Aes-Key`, `Aes-Iv`), AES-CBC encrypt the JSON body, send
3. Response is AES-CBC decrypted, JSON-parsed, then validated via `validateResponse`

## Dependencies (CDN @require)

- crypto-js 4.1.1 (AES)
- lodash 4.17.21
- moment.js 2.29.4
- JSEncrypt (RSA encryption)

## Development workflow

No build steps. Edit the `.js` files directly. To test, the script must be re-installed in Tampermonkey pointing at the GitHub raw URL (or loaded as a local file via Tampermonkey's utility). The `common.js` is versioned at its GitHub raw URL — local changes to `common.js` only take effect after committing/pushing.

## Common commands

- `git push origin main` — deploy changes (users install from GitHub raw URL)
- `npx eslint *.js` — lint (`.eslintrc.json` lives in repo root, targets ES2021 browser env)

## API endpoints used

| Endpoint | Purpose |
|---|---|
| `/sqy-admin/api/conf/encrypt` | RSA public key capture |
| `/sqy-admin/api/sqHouseInfo` | List residents (paginated) |
| `/sqy-admin/api/sqAddress/getAddressTree` | Address tree traversal |
| `/sqy-admin/api/sqTagRecord/queryHouseTag/{roomId}` | Room tags |
| `/sqy-admin/api/sqPersonInfo/queryPersonInfo` | Person detail |
| `/sqy-admin/api/sqReceptionVisit` | CRUD for reception visit records |
| `/sqy-admin/api/sqReceptionVisit/queryPersonList` | Person search by name |
| `/sqy-admin/api/sqReceptionVisit/getWorkPersonList` | Staff list |
| `/sqy-admin/api/sysDept/getPDept` | Department info |
