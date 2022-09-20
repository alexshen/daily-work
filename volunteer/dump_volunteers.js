// ==UserScript==
// @name         Dump Volunteers
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Dump volunteers
// @author       ashen
// @match        https://sh.zhiyuanyun.com/app/org/member.php*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    const VOLUNTEERS_URL = new URL(
        "/app/org/member.php",
        window.document.location
    );

    async function getVolunteers(pageNo) {
        let doc;
        if (pageNo) {
            const resp = await cc.doRequest(VOLUNTEERS_URL, 'GET', { p: pageNo }, null, null);
            const parser = new DOMParser();
            doc = parser.parseFromString(resp, 'text/html');
        } else {
            doc = document;
        }
        const volunteers = [];
        // find all the urls for getting details
        const records = doc.querySelectorAll('table.table1 tr td:nth-child(3) a:first-child');
        for (let i = 0; i < records.length; ++i) {
            const link = records[i];
            console.log(`[${i + 1}/${records.length}] ${link.innerText}`);
            const info = await getVolunteer(link.href);
            if (info) {
                volunteers.push(info);
            } else {
                console.log('error');
            }
            await cc.delay(100);
        }
        return volunteers;
    }

    const FIRST_FIELD_IDX = 1;
    const HEADERS = [
        "用户名",
        "姓名",
        "最后登录",
        "注册日期",
        "志愿者编号",
        "电子邮箱",
        "政治面貌",
        "民族",
        "国籍",
        "手机/电话",
        "区域",
        "详细地址"
    ];
    async function getVolunteer(href) {
        const resp = await cc.doRequest(new URL(href, window.document.location), 'GET');
        const doc = new DOMParser().parseFromString(resp, 'text/html');
        const rows = doc.querySelectorAll('table.table1 tr');
        if (rows.length) {
            const values = [];
            for (let i = FIRST_FIELD_IDX; i < FIRST_FIELD_IDX + HEADERS.length; ++i) {
                values.push(rows[i].lastElementChild.innerText.trim());
            }
            return values;
        }
        return null;
    }

    async function dumpVolunteers(first, numPages) {
        first = first || 1;
        numPages = numPages || 0;
        const records = [HEADERS];
        for (let i = first; ; ++i) {
            console.log(`dump page ${i}`);
            const vols = await getVolunteers(i)
            if (vols.length) {
                records.push(...vols);
                cc.delay(1000);

                if (numPages > 0 && --numPages === 0) {
                    break;
                }
            } else {
                break;
            }
        }
        console.log(records.map(e => e.join('\t')).join('\n'));
    }

    async function dumpVolunteersOnCurrentPage() {
        const records = [HEADERS];
        records.push(...await getVolunteers());
        console.log(records.map(e => e.join('\t')).join('\n'));
    }

    window.addEventListener('load', () => {
        GM_registerMenuCommand('Dump All', () => {
            dumpVolunteers();
        });
        GM_registerMenuCommand('Dump Current Page', () => {
            dumpVolunteersOnCurrentPage();
        });
    });
})();

