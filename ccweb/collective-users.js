// ==UserScript==
// @name         Collective Users
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Tools for Collective Users
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

    // wait until the next request is finished
    function currentVisibleTab() {
        return document.querySelector(
            'div.personnel-detail'
        );
    }

    const REMOVE_COLLECTIVE_USER_URL = new URL(
        "/community-cloud/temporaryaddress/temporaryAddress/remove",
        window.document.location
    );

    async function removeUser(id) {
        await ccu.postJson(REMOVE_COLLECTIVE_USER_URL, {temporaryPersonId: id});
    }

    async function removeCurrentPageUsers(token) {
        for (let row of currentVisibleTab().querySelectorAll('div.ant-table-scroll tbody tr')) {
            const name = row.querySelector('td span.realname').innerText;
            const address = row.querySelector('td:nth-child(3) > span span:last-child').innerText;
            console.log(`removing ${name} at ${address}`);
            await removeUser(row.getAttribute('data-row-key'));
            await cc.delay(100);
            if (token.isStopped) {
                break;
            }
        }
        alert("*** finished");
    }

    async function removeUsersById(ids, token) {
        for (let id of ids) {
            await removeUser(id);
            await cc.delay(100);
            if (token.isStopped) {
                break;
            }
        }
        alert("*** finished");
    }

    async function removeUsersFromFile(token) {
        const name = await ccu.selectFile();
        if (name) {
            await removeUsersById(await cc.readLines(name), token);
        }
    }

    let g_curTaskToken;
    function stopCurrentTask() {
        if (g_curTaskToken) {
            g_curTaskToken.stop();
            g_curTaskToken = null;
        }
    }

    const HEADERS = [
        'TemporaryId',
        'UUID',
        '姓名',
        '身份证',
        '户籍地址',
        '人员类型',
        '居住地址'
    ];
    async function parseUsers(resp) {
        const users = [];
        for (let record of resp.result.records) {
            const fields = [
                record.id,
                record.personId,
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

    async function dumpUsers(token) {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [HEADERS.join("\t")];
        // force querying the first page
        let resp = await cc.waitUntilRequestDone(() => {
            currentTab.querySelector("div.btn-group-wrapper button:first-child").click();
        });

        while (!token.isStopped) {
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

    window.addEventListener('load', () => {
        GM_registerMenuCommand('Remove Current User Pages', () => {
            stopCurrentTask();
            if (confirm("remove current page users?")) {
                g_curTaskToken = new cc.StopToken();
                removeCurrentPageUsers(g_curTaskToken);
            }
        });

        GM_registerMenuCommand('Remove Users From File', () => {
            stopCurrentTask();
            g_curTaskToken = new cc.StopToken();
            removeUsersFromFile(g_curTaskToken);
        });
        
        GM_registerMenuCommand("Dump Users", () => {
            stopCurrentTask();
            if (confirm("begin dumping?")) {
                g_curTaskToken = new cc.StopToken();
                dumpUsers(g_curTaskToken);
            }
        });
    });
})();
