// ==UserScript==
// @name         Dump Collective Users
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Dump All Collective Users
// @author       ashen
// @match        http://10.87.105.104/communityorg/CommunityOrgList
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
            'div.personnel-detail'
        );
    }

    // order of user fields
    // UF_UUID
    // UF_NAME
    // UF_ID_NUMBER
    // UF_PERM_ADDR
    // UF_POP_TYPE
    // UF_RESIDENCE_ADDR

    async function parseUsers(resp) {
        const users = [];
        for (let record of resp.result.records) {
            const fields = [
                record.id,
                record.realName, 
                record.cardId, 
                record.permanentAddress, 
                record.personTypeCode,
                record.residenceAddress,
            ];
            users.push(fields.join('\t'));
        }
        return users;
    }

    async function dumpUsers() {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [];
        // force querying the first page
        let resp = await cc.waitUntilRequestDone(() => {
            currentTab.querySelector("div.btn-group-wrapper button:first-child").click();
        });

        while (g_running) {
            if (resp.status !== 200) {
                throw new Error('request error');
            }
            records.push(...await parseUsers(JSON.parse(resp.response)));
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
                dumpUsers();
            } else if (g_running) {
                g_running = false;
            }
        }
    });
})();

