// ==UserScript==
// @name         Dump Record from Repo
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Dump currently listed records from the local repo
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        none
// ==/UserScript==

/* global cc */

(function () {
    "use strict";

    let g_running = false;

    function currentVisibleTab() {
        return document.querySelector(
            '.main > div > div > div > div:not(.ant-tabs):not([style*="display: none"])'
        );
    }

    async function dumpElement(textExtractor) {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [];
        while (g_running) {
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

    function dumpAddresses() {
        dumpElement((row) => {
            for (let col of ADDRESS_COLS) {
                const addrElem = row.querySelector(`td:nth-child(${col}) span span:last-child`);
                if (addrElem) {
                    return addrElem.innerText;
                }
            } 
            throw new Error(`cannot find address for ${row}`);
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "l") {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpAddresses();
            } else if (g_running) {
                g_running = false;
            }
        }
    });
})();
