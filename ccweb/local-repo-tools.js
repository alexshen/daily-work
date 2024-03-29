// ==UserScript==
// @name         Local Repo Tools
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Tools for the local repo module
// @author       ashen
// @match        https://sqy.mzj.sh.gov.cn/person/PersonInfoList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/utils.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc, ccu */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    function currentVisibleTab() {
        return document.querySelector(
            '.main > div > div > div > div:not(.ant-tabs):not([style*="display: none"])'
        );
    }

    async function dumpElement(textExtractor, token) {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [];
        while (!token.isStopped) {
            for (let row of currentTab.querySelectorAll("div.ant-table-scroll tbody.ant-table-tbody tr")) {
                records.push(textExtractor(row));
            }
            if (nextPageButton.getAttribute("class").includes("ant-pagination-disabled")) {
                break;
            }
            await cc.waitUntilRequestDone(() => nextPageButton.click());
            await cc.delay(250);
        }
        console.log(records.join("\n"));
        console.log("stopped dumping");
    }

    const ADDRESS_COLS = [4, 5];
    function getAddress(row) {
        for (let col of ADDRESS_COLS) {
            const addrElem = row.querySelector(`td:nth-child(${col}) span span:last-child`);
            if (addrElem) {
                return addrElem.innerText;
            }
        } 
        throw new Error(`cannot find address for ${row}`);
    }

    function getId(row) {
        return row.getAttribute('data-row-key')
    }

    const REMOVE_USER_URL = new URL(
        '/community-cloud/archives/personChangedRecord/addFromPersonBase',
        window.document.location
    );

    async function removeUser(user) {
        await ccu.get(REMOVE_USER_URL, user);
    }

    async function removeUsersFromFile(token) {
        const records = await cc.readRecords(await ccu.selectFile());
        for (let i = 0; i < records.length; ++i) {
            const r = records[i];
            try {
                await removeUser(r);
                console.log(`removed [${i + 1}/${records.length}] with id ${r.infoId}`);
            } catch (e) {
                console.error(`failed to remove ${r.infoId}, error: ${e}`);
            }
            await cc.delay(100);
            if (token.isStopped) {
                break;
            }
        }
        console.log('*** stopped removing');
    }

    const FIND_USER_URL = new URL(
        '/community-cloud/archives/personChangedRecord/list',
        window.document.location
    );

    const DOWN_STATUS = {
        ALL: 0,
        IMPORTED: 1,
        UNIMPORTED: 2,
        ERROR: 3
    };

    async function* listResidents(name, status) {
        // TODO: returns an iterator for all users
        const params = {
            downStatus: status,
            auditState: -1,
            SEARCHFLAG: false,
            column: 'createTime',
            order: 'desc',
            field: 'id,,rowIndex,realName,residenceAddress,permanentAddress,createTime,downloadTime,downloadStatus',
            pageSize: 10
        };
        if (name) {
            params.keyWord = name;
        }
        let result;
        let pageNo = 1;
        do {
            params.pageNo = pageNo;
            result = await ccu.get(FIND_USER_URL, params);
            for (let r of result.records) {
                yield r;
            }
            ++pageNo;
        } while (pageNo < result.pages);
    }

    const ROLLBACK_USER_URL = new URL(
        '/community-cloud/archives/personChangedRecord/rollBack',
        window.document.location
    );

    async function rollbackResident(id) {
        await ccu.get(ROLLBACK_USER_URL, { id: id });
    }

    async function rollbackUsersFromFile(token) {
        const records = await cc.readRecords(await ccu.selectFile());
        for (let i = 0; i < records.length; ++i) {
            const r = records[i];
            console.log(`rollback [${i + 1}/${records.length}]: name ${r.name}, permanent address ${r.permAddr}`);
            for await (let u of listResidents(r.name, DOWN_STATUS.ERROR)) {
                if (u.permanentAddress === r.permAddr) {
                    await rollbackResident(u.id);
                    break;
                }
                if (token.isStopped) {
                    break;
                }
                await cc.delay(100);
            }
            await cc.delay(100);
            if (token.isStopped) {
                break;
            }
        }
        console.log('*** finished rollback');
    }

    let g_currentTaskToken;
    function stopCurrentTask() {
        if (g_currentTaskToken) {
            g_currentTaskToken.stop();
            g_currentTaskToken = null;
        }
    }

    window.addEventListener("load", () => {
        GM_registerMenuCommand("Dump Addresses", () => {
            stopCurrentTask();
            if (confirm("begin dumping?")) {
                g_currentTaskToken = new cc.StopToken();
                dumpElement(getAddress, g_currentTaskToken);
            }
        });

        GM_registerMenuCommand("Dump Ids", () => {
            stopCurrentTask();
            if (confirm("begin dumping?")) {
                g_currentTaskToken = new cc.StopToken();
                dumpElement(getId, g_currentTaskToken);
            }
        });

        GM_registerMenuCommand("Remove Users From File", () => {
            stopCurrentTask();
            g_currentTaskToken = new cc.StopToken();
            removeUsersFromFile(g_currentTaskToken);
        });

        GM_registerMenuCommand("Rollback Users From File", () => {
            stopCurrentTask();
            g_currentTaskToken = new cc.StopToken();
            rollbackUsersFromFile(g_currentTaskToken);
        });
    });
})();
