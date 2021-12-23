// ==UserScript==
// @name         Dump House Data
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Dump house data
// @author       ashen
// @match        https://sqy.mzj.sh.gov.cn/communityorg/CommunityOrgList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/utils.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc, ccu */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    const HEADERS = [
        '地址',
        '房屋标签'
    ];

    // wait until the next request is finished
    function currentVisibleTab() {
        return document.querySelector(
            'div.ant-tabs-tabpane-active'
        );
    }

    let g_curTaskToken;
    function stopCurrentTask() {
        if (g_curTaskToken) {
            g_curTaskToken.stop();
            g_curTaskToken = null;
        }
    }

    async function parseHouse(resp) {
        const houses = [];
        for (let record of resp.result.records) {
            const fields = [
                record.houseAddress,
                record.tagInfoList.map(x => x.tagName).join(','),
            ];
            houses.push(fields.join('\t'));
        }
        return houses;
    }

    async function dumpHouses(token) {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [HEADERS.join('\t')];
        // force querying the first page
        let resp = await cc.waitUntilRequestDone(() => {
            currentTab.querySelector("div.search-btn button:last-child").click();
        });

        while (!token.isStopped) {
            if (resp.status !== 200) {
                throw new Error('request error');
            }
            records.push(...await parseHouse(JSON.parse(resp.response)));
            if (nextPageButton.getAttribute("class").includes("ant-pagination-disabled")) {
                break;
            }
            resp = await cc.waitUntilRequestDone(() => nextPageButton.click());
            await cc.delay(150);
        }
        console.log(records.join("\n"));
        console.log("stopped dumping");
    }

    window.addEventListener('load', () => {
        GM_registerMenuCommand('Dump Houses', () => {
            stopCurrentTask();
            if (confirm("Dump Houses?")) {
                g_curTaskToken = new cc.StopToken();
                dumpHouses(g_curTaskToken);
            }
        });
    });
})();

