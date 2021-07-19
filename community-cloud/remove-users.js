// ==UserScript==
// @name         Remove Users
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

    class RequestWaiter {
        constructor(urlRegex) {
            this._urlRegex = urlRegex
            this._onResponseHandler = this._onResponse.bind(this);
            this._wait = true;
            XHRInterceptor.addEventListener("load", this._onResponseHandler);
        }

        async wait() {
            while (this._wait) {
                await delay(100);
            }
            return this._event;
        }

        dispose() {
            this._wait = false;
            XHRInterceptor.removeEventHandler("load", this._onResponseHandler);
        }

        _onResponse(e) {
            if (!this._urlRegex || e.target.responseURL.match(this._urlRegex)) {
                this._event = e;
                this.dispose();
            }
        }
    }

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

    async function waitUntilRequestDone(initiator) {
        const waiter = new RequestWaiter();
        try {
            initiator();
            return await waiter.wait();
        } finally {
            waiter.dispose();
        }
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

        XHRInterceptor.addEventListener('load', handler);
        try {
            pageUI.querySelector('.btn-group-wrapper button:nth-child(1)').click();
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
        if (searchResults[index].housePerson.length > 1) {
            console.error(`${userInfo.username} with id number ${userInfo.idNumber} has more than 1 flats, manual operation is needed`);
            return false;
        }

        rows[index].querySelector('td:last-child > div > div:last-child').click();
        await delay(500);

        const dialog = currentDialogElement();
        dialog.querySelectorAll('.ant-radio-wrapper')[REASONS.indexOf(userInfo.reason)].click();
        await delay(100);

        await waitUntilRequestDone(() => {
            dialog.querySelector(".ant-modal-footer button:last-child").click();
        });

        await delay(100);
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
        const [columnLine, ...recordLines] = data.split(/\r\n|\n/);
        const columnNames = columnLine.split('\t');
        const users = [];
        for (let line of recordLines) {
            if (line.length === 0) {
                break;
            }
            const user = objectFromKeyValueArrays(columnNames, line.split('\t'));
            if (user.comment) {
                user.comment = user.comment.trim();
            }
            users.push(user);
        }
        return users;
    }

    async function removeUsersWithFile(filename) {
        const users = await readUserRecords(filename);
        for (let i = 0; i < users.length; ++i) {
            const user = users[i];
            if (await removeUser(user)) {
                console.log(`[${i + 1}/${users.length}] removed ${user.username} with id ${user.idNumber}`);
            }
            await delay(500);
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