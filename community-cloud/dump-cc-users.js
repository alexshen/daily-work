// ==UserScript==
// @name         Dump CC Users
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Dump currently listed cc users
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        none
// ==/UserScript==

/* global cc */

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
    // UF_IS_TENANT
    // UF_SAME_PERM_ADDR
    // UF_SAME_RESIDENT_ADDR
    // UF_IS_OWNER
    // UF_ADDR_LONG
    // UF_ADDR_UNIT
    // UF_ADDR_ROOM
    // UF_FLAGS

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
        for (let record of resp.result.records) {
            const residentAddr = withResidentAddr ? await getMainResidentAddress(record.id) : '';
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
        const records = [];
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
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "k") {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpUsers(e.shiftKey);
            } else if (g_running) {
                g_running = false;
            }
        }
    });
})();
