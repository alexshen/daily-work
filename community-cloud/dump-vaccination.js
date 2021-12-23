// ==UserScript==
// @name         Dump Vaccination Records
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Dump currently listed vaccination records
// @author       ashen
// @match        http://sqy.mzj.sh.gov.cn/keyWord/Vaccination
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    let g_running = false;

    const HEADERS = [
        'UUID',
        '居住地址',
        '姓名',
        '电话',
        '接种时间',
        '疫苗ID',
        '接种状态',
        '备注',
        '未接种原因'
    ];

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
            record.vaccinatedTime || '',
            // 44810510A for KangXiNuo
            record.vaccinatedProducts || '',
            // 1 - one dose, 2 - two doses
            record.vaccinatedState || '',
            record.vaccinatedMemo || '',
            record.vaccinatedValue || ''
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
        const records = [HEADERS.join('\t')];
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

    window.addEventListener("load", () => {
        GM_registerMenuCommand("Dump Records", () => {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpRecords();
            } else if (g_running) {
                g_running = false;
            }
        });
    });
})();
