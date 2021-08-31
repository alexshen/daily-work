// ==UserScript==
// @name         Dump Record from Repo
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Dump currently listed records from the local repo
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
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
    });
})();
