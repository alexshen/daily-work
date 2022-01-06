// ==UserScript==
// @name         Dump CC Users
// @namespace    http://tampermonkey.net/
// @version      0.10
// @description  Dump currently listed cc users
// @author       ashen
// @match        https://sqy.mzj.sh.gov.cn/person/PersonInfoList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    let g_running = false;

    // wait until the next request is finished
    function currentVisibleTab() {
        return document.querySelector(
            '.main > div > div > div > div:not(.ant-tabs):not([style*="display: none"])'
        );
    }

    // order of user fields
    // UF_UUID
    // UF_NAME
    // UF_ID_NUMBER
    // UF_PHONE
    // UF_PERM_ADDR
    // UF_POP_TYPE
    // UF_IS_RESIDENT
    // UF_SAME_PERM_ADDR
    // UF_IS_OWNER
    // UF_ADDR_LONG
    // UF_ADDR_UNIT
    // UF_ADDR_ROOM
    // UF_FLAGS

    const HEADERS = [
        'UUID',
        '姓名',
        '身份证',
        '电话',
        '户籍地址',
        '居住地址',
        '人员类型',
        '本房居住',
        '本房户籍',
        '本房业主',
        '弄',
        '号',
        '室',
        '社区标识'
    ];

    async function getMainResidentAddress(userId) {
        const url = new URL('/community-cloud/archives/personArchives/queryByIdThrong', document.location.origin);
        url.searchParams.set('_t', Date.now());
        url.searchParams.set('id', userId);
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url)
        xhr.responseType = 'json';
        xhr.setRequestHeader('X-Access-Token', window.localStorage.getItem('__X-Access-Token'));
        xhr.send();
        let done = false;
        let response;
        xhr.onload = (event) => {
            response = event.target.response;
            done = true;
        };
        xhr.onerror = () => done = true;
        while (!done) {
            await cc.delay(100);
        }
        if (!response) {
            throw new Error('request error');
        }
        return response.result.residenceAddress;
    }

    async function parseUsers(resp, withResidentAddr) {
        const users = [];
        const residentAddresses = [];

        if (withResidentAddr) {
            const requests = [];
            for (let record of resp.result.records) {
                requests.push(getMainResidentAddress(record.id));
                await cc.delay(100);
            }
            residentAddresses.splice(0, 0, ...await Promise.all(requests));
        }

        for (let i = 0; i < resp.result.records.length; ++i) {
            const record = resp.result.records[i];
            const residentAddr = withResidentAddr ? residentAddresses[i] : '';
            for (let house of JSON.parse(record.personHouses)) {
                const match = /(\d+)弄\/(\d+)号楼\/(\d+)/g.exec(house.houseAddress);
                const fields = [
                    record.id,
                    record.realName, 
                    record.cardIdOrg, 
                    record.phoneNumOrg,
                    record.permanentAddress, 
                    residentAddr,
                    record.populationType,
                    // all the living states
                    // 1 - false,
                    // 0 - true
                    // so convert to the real state
                    1 - parseInt(house.livingState, 10),
                    1 - parseInt(house.isOneself, 10),
                    1 - parseInt(house.isOwner, 10)
                ];
                fields.push(match[1], match[2], match[3]);
                // add community flags
                const flags = []
                if (record.personOrgsPositions) {
                    for (let flag of JSON.parse(record.personOrgsPositions)) {
                        flags.push(flag.tagName);
                    }
                }
                fields.push(flags.join(','))
                users.push(fields.join('\t'));
            }
        }
        return users;
    }

    async function dumpUsers(withResidentAddr) {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [HEADERS.join('\t')];
        // force querying the first page
        let resp = await cc.waitUntilRequestDone(() => {
            currentTab.querySelector("div.table-page-search-wrapper button:first-child").click();
        });

        while (g_running) {
            if (resp.status !== 200) {
                throw new Error('request error');
            }
            records.push(...await parseUsers(JSON.parse(resp.response), withResidentAddr));
            if (nextPageButton.getAttribute("class").includes("ant-pagination-disabled")) {
                break;
            }
            resp = await cc.waitUntilRequestDone(() => nextPageButton.click());
            await cc.delay(150);
        }
        console.log(records.join("\n"));
        console.log("stopped dumping");
        g_running = false;
    }

    window.addEventListener("load", () => {
        GM_registerMenuCommand("Dump Users w/o Resident Address", () => {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpUsers(false);
            } else if (g_running) {
                g_running = false;
            }
        });

        GM_registerMenuCommand("Dump Users w/ Resident Address", () => {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpUsers(true);
            } else if (g_running) {
                g_running = false;
            }
        });
    });
})();
