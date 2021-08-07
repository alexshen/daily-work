// ==UserScript==
// @name         Remove Users
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        none
// ==/UserScript==

/* global cc */

(function () {
    'use strict';

    let g_stop = false;

    function currentDialogElement() {
        return document.querySelector('.ant-modal-root div.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content');
    }

    async function waitUntilSpinningHasFinished(parent, elementSelector) {
        const spinner = parent.querySelector(elementSelector);
        while (spinner.getAttribute('class').includes('ant-spin-blur')) {
            await cc.delay(200);
        }
    }

    function updateTextValue(element, value) {
        element.value = value;
        // force update, otherwise vue won't pick up the change
        element.dispatchEvent(new Event('input'));
    }

    function currentVisibleTab() {
        return document.querySelector('.main > div > div > div > div:not(.ant-tabs):not([style*="display: none"])');
    }

    const REASONS = ['居民搬离', '居民死亡', '误操作加入此人', '平台数据修正'];

    // search the resident with the given name, return the data row if found
    async function removeUser(userInfo) {
        // console.log(userInfo);
        const pageUI = currentVisibleTab();
        const nameInput = pageUI.querySelector('.ant-input');
        updateTextValue(nameInput, userInfo.username);

        let searchResults;
        const handler = e => {
            if (e.target.status === 200) {
                const response = JSON.parse(e.target.responseText);
                if (response.success) {
                    searchResults = response.result.records;
                }
            }
        };

        cc.XHRInterceptor.addEventListener('load', handler);
        try {
            pageUI.querySelector('.btn-group-wrapper button:nth-child(1)').click();
            // wait until the searching has completed
            await cc.delay(100);
            await waitUntilSpinningHasFinished(pageUI, '.ant-spin-container');
        } finally {
            cc.XHRInterceptor.removeEventHandler('load', handler);
        }

        if (!searchResults) {
            console.log(`${userInfo.username} not found`);
            return false;
        }

        const rows = pageUI.querySelectorAll('.ant-table-tbody tr');
        if (rows.length !== searchResults.length) {
            console.error('number of visual results differs from that of data results');
            return false;
        }

        const matches = searchResults.filter(e => new RegExp(userInfo.idNumber).test(e.cardIdOrg));
        if (matches.length === 0) {
            console.error(`${userInfo.username} with id number ${userInfo.idNumber} not found`);
            return false;
        }
        if (matches.length > 1) {
            console.error(`${userInfo.username} with id number ${userInfo.idNumber} has more than 1 matches`);
            return false;
        }
        const index = searchResults.indexOf(matches[0]);
        if (searchResults[index].housePerson.length > 1) {
            console.error(`${userInfo.username} with id number ${userInfo.idNumber} has more than 1 flats, manual operation is needed`);
            return false;
        }

        rows[index].querySelector('td:last-child > div > div:last-child').click();
        await cc.delay(500);

        const dialog = currentDialogElement();
        dialog.querySelectorAll('.ant-radio-wrapper')[REASONS.indexOf(userInfo.reason)].click();
        await cc.delay(100);

        await cc.waitUntilRequestDone(() => {
            dialog.querySelector(".ant-modal-footer button:last-child").click();
        });

        await cc.delay(100);
        // wait until the searching has completed
        await waitUntilSpinningHasFinished(pageUI, '.ant-spin-container');
        return true;
    }

    async function removeUsersWithFile(filename) {
        const users = await cc.readRecords(filename);
        for (let i = 0; i < users.length; ++i) {
            const user = users[i];
            if (await removeUser(user)) {
                console.log(`[${i + 1}/${users.length}] removed ${user.username} with id ${user.idNumber}`);
            }
            await cc.delay(500);
            if (g_stop) {
                break;
            }
        }
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === '4' && event.altKey) {
            let input = document.createElement('input');
            input.type = 'file';
            input.onchange = e => {
                removeUsersWithFile(e.target.files[0])
                    .then(() => 'finished removing users')
                    .catch(console.log)
                    .finally(() => {
                        g_stop = false;
                    });
            };
            input.click();
        }
    });
})();