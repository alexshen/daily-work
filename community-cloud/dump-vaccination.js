// ==UserScript==
// @name         Dump Vaccination Records
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Dump currently listed vaccination records
// @author       ashen
// @match        http://10.87.105.104/vaccination/Vaccination
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        none
// ==/UserScript==

/* global cc */

(function () {
    "use strict";

    let g_running = false;

    function format(record) {
        // find the first living house
        const livingHouses = JSON.parse(record.personHouses);
        const firstLivingHouse = livingHouses.find(e => parseInt(e.livingState, 10) === 0);
        const fields = [
            // uuid
            firstLivingHouse.tPId,
            // ignore the community name
            firstLivingHouse.houseAddress.split('/').slice(2).join(''),
            //record.residenceAddress,
            record.realName,
            record.phoneNum,
            record.vaccinatedTime,
            // 44810510A for KangXiNuo
            record.vaccinatedProducts,
            // 1 - one dose, 2 - two doses
            record.vaccinatedState,
            record.vaccinatedMemo,
        ];
        return fields.join('\t');
    }

    function getFormattedRecords(records) {
        const rows = [];
        for (let r of records) {
            rows.push(format(r));
        }
        return rows;
    }

    async function dumpRecords() {
        // get the records on the current page
        let resp = await cc.waitUntilRequestDone(() => {
            document.querySelector('div.search-btn > button:last-child').click();
        });

        const nextPageButton = document.querySelector("li.ant-pagination-next");
        const records = [];
        while (g_running) {
            records.splice(records.length, 0, ...getFormattedRecords(JSON.parse(resp.response).result.records));
            if (nextPageButton.getAttribute("class").includes("ant-pagination-disabled")) {
                break;
            }
            resp = await cc.waitUntilRequestDone(() => nextPageButton.click());
            await cc.delay(250);
        }
        console.log(records.join("\n"));
        console.log("stopped dumping");
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "k") {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpRecords();
            } else if (g_running) {
                g_running = false;
            }
        }
    });
})();
