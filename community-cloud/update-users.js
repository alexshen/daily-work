// ==UserScript==
// @name         Update User Info
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let g_stop = false;

    class XHRInterceptor {
        static _s_init = (function() {
            const openOrg = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function() {
                this.addEventListener('load', XHRInterceptor._handleEvent);
                openOrg.apply(this, arguments);
            };
        })();

        static _s_eventHandlers = {};

        static addEventListener(event, handler) {
            let handlers = XHRInterceptor._s_eventHandlers[event];
            if (!handlers) {
                handlers = XHRInterceptor._s_eventHandlers[event] = []
            }
            handlers.push(handler);
        }

        static removeEventHandler(event, handler) {
            const handlers = XHRInterceptor._s_eventHandlers[event];
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index != -1) {
                    handlers.splice(index, 1);
                }
            }
        }

        static _handleEvent(event) {
            const handlers = XHRInterceptor._s_eventHandlers[event.type];
            if (handlers) {
                for (let e of handlers) {
                    e.call(this, event);
                }
            }
        }
    };

    function delay(duration) {
        return new Promise(resolved => {
            setTimeout(resolved, duration);
        });
    }

    async function waitUntilElementIsFound(elementSelector, root = document, retryCount = 20, initialDelay = 500, maxDelay = 2000) {
        let curDelay = initialDelay;
        for (let i = 0; i < retryCount; ++i) {
            await delay(curDelay);
            let element = root.querySelector(elementSelector);
            if (element) {
                return element;
            }
            console.log(`${elementSelector} not found, retry ${i + 1}`);
            curDelay = Math.min(curDelay * 2, maxDelay);
        }
        throw new Error(`unable to find the element ${elementSelector} due to timeout`);
    }

    async function waitUntilPersonInfoHasLoaded() {
        return await waitUntilElementIsFound('.people-add');
    }

    function currentDialogElement() {
        return document.querySelector('.ant-modal-root div.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content');
    }

    async function waitUntilSpinningHasFinished(parent, elementSelector) {
        const spinner = parent.querySelector(elementSelector);
        while (spinner.getAttribute('class').includes('ant-spin-blur')) {
            await delay(200);
        }
    }

    function getDropDownMenuItem(title) {
        for (let item of document.querySelectorAll('.ant-select-dropdown-menu-item')) { 
            if (item.innerText.trim() === title) {
                return item;
            }
        }
        return null;
    }

    class User {
        constructor(username, idNumber, politicalStatus, phone, comment) {
            this.username = username;
            this.idNumber = idNumber;
            this.politicalStatus = politicalStatus;
            this.phone = phone;
            this.comment = comment;
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

    // search the resident with the given name, return the data row if found
    async function updateUser(userInfo) {
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

        XHRInterceptor.addEventListener('load', handler);
        try {
            pageUI.querySelector('.btn-group-wrapper button:nth-child(2)').click();
            // wait until the searching has completed
            await delay(100);
            await waitUntilSpinningHasFinished(pageUI, '.ant-spin-container');
        } finally {
            XHRInterceptor.removeEventHandler('load', handler);
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

        const index = searchResults.findIndex(e => e.cardIdOrg === userInfo.idNumber);
        if (index === -1) {
            console.error(`${userInfo.username} with id number ${userInfo.idNumber} not found`);
            return false;
        }
        // show the person info
        rows[index].querySelector('td:nth-child(2) span').click();
        // wait until the person info has loaded
        await waitUntilPersonInfoHasLoaded();

        const political = document.querySelector('#political');
        if (userInfo.politicalStatus !== undefined && political.innerText.trim() !== userInfo.politicalStatus) {
            political.nextSibling.click();
            await delay(500);
            // show the drop down menu
            const dialog = currentDialogElement();
            dialog.querySelector('.ant-modal-root #political').click();
            await delay(500);
            getDropDownMenuItem(userInfo.politicalStatus).click();
            // confirm and close
            dialog.querySelector('button:nth-child(2)').click();
            await delay(500);
        }

        const phoneNum = document.querySelector('#phoneNum');
        if (userInfo.phone !== undefined && userInfo.phone !== phoneNum.value) {
            phoneNum.nextSibling.click();
            await delay(500);
            const dialog = currentDialogElement();
            updateTextValue(dialog.querySelector('#phoneNum'), userInfo.phone);
            // confirm and close
            dialog.querySelector('button:nth-child(2)').click();
            await delay(500);
        }

        const comments = document.querySelector('#memo');
        if (userInfo.comment !== undefined && userInfo.comment !== comments.value.trim()) {
            comments.nextSibling.click();
            await delay(500);
            const dialog = currentDialogElement();
            // empty string is not allowed, so add a white space
            updateTextValue(dialog.querySelector('textarea'), userInfo.comment || " ");
            // confirm and close
            dialog.querySelector('button:nth-child(2)').click();
            await delay(500);
        }

        document.querySelector('.peopleInfo .row-btn.ant-row .ant-btn').click();

        // wait until the searching has completed
        await waitUntilSpinningHasFinished(pageUI, '.ant-spin-container');
        return true;
    }

    async function readFile(blobOrFile, encoding='utf-8') {
        return new Promise((resolve, reject) => {
            let reader = new FileReader();
            reader.readAsText(blobOrFile, encoding);
            reader.onload = e => {
                resolve(e.target.result);
            };
            reader.onerror = reject;
        });
    }

    function objectFromKeyValueArrays(keys, values) {
        const o = {};
        keys.forEach((e, i) => {
            o[e] = values[i];
        });
        return o;
    }

    // the first line must contain the field names
    async function readUserRecords(filename) {
        const data = await readFile(filename);
        const [columnLine, ...recordLines] = data.split('\n');
        const columnNames = columnLine.split('\t');
        const users = [];
        for (let line of recordLines) {
            const user = objectFromKeyValueArrays(columnNames, line.split('\t'));
            if (user.comment) {
                user.comment = user.comment.trim();
            }
            users.push(user);
        }
        return users;
    }

    async function updateUsersWithFile(filename) {
        const users = await readUserRecords(filename);
        for (let i = 0; i < users.length; ++i) {
            const user = users[i];
            if (await updateUser(user)) {
                console.log(`[${i + 1}/${users.length}] updated ${user.username} with id ${user.idNumber}`);
            }
            await delay(500);
            if (g_stop) {
                break;
            }
        }
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === '3' && event.altKey) {
            let input = document.createElement('input');
            input.type = 'file';
            input.onchange = e => {
                updateUsersWithFile(e.target.files[0])
                    .then(() => 'finished update')
                    .catch(console.log)
                    .finally(() => {
                        g_stop = false;
                    });
            };
            input.click();
        }
        if (event.key === '4' && event.altKey) {
            g_stop = true;
            console.log('stop updating');
        }
    });
})();