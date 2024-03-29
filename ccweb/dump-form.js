// ==UserScript==
// @name         Dump Form
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Dump current form data
// @author       ashen
// @match        https://sqy.mzj.sh.gov.cn/datacollector/modules/FormManager2*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    let g_running = false;

    function getCurrentPageRecords() {
        const rows = [];
        for (let row of document.querySelectorAll(
            "#fillingRecord > div.six  div.ant-table-body tr"
        )) {
            const columns = row.querySelectorAll("td");
            let fields = [];
            for (let i = 3; i < columns.length - 2; ++i) {
                fields.push(columns[i].innerText);
            }
            rows.push(fields.join("\t"));
        }
        return rows;
    }

    async function dumpUsers() {
        const nextPageButton = document.querySelector(
            "#fillingRecord > div.six li.ant-pagination-next"
        );
        const records = [];
        while (g_running) {
            records.splice(records.length, 0, ...getCurrentPageRecords());
            if (nextPageButton.getAttribute("class").includes("ant-pagination-disabled")) {
                break;
            }
            await cc.waitUntilRequestDone(() => nextPageButton.click());
            await cc.delay(250);
        }
        console.log(records.join("\n"));
        console.log("stopped dumping");
        g_running = false;
    }

    window.addEventListener("load", () => {
        GM_registerMenuCommand("Dump Records", () => {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpUsers();
            } else if (g_running) {
                g_running = false;
            }
        });
    });
})();
