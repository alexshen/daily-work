// ==UserScript==
// @name         Dump CC Users
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    let g_running = false;

    function delay(duration) {
        return new Promise((resolved) => {
            setTimeout(resolved, duration);
        });
    }

    class XHRInterceptor {
        static _s_init = (function () {
            const openOrg = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function () {
                this.addEventListener("load", XHRInterceptor._handleEvent);
                openOrg.apply(this, arguments);
            };
        })();

        static _s_eventHandlers = {};

        static addEventListener(event, handler) {
            let handlers = XHRInterceptor._s_eventHandlers[event];
            if (!handlers) {
                handlers = XHRInterceptor._s_eventHandlers[event] = [];
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
    }

    class RequestWaiter {
        constructor(urlRegex) {
            this._urlRegex = urlRegex;
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

    // wait until the next request is finished
    async function waitUntilRequestDone(initiator) {
        const waiter = new RequestWaiter();
        try {
            initiator();
            return await waiter.wait();
        } finally {
            waiter.dispose();
        }
    }

    function currentVisibleTab() {
        return document.querySelector(
            '.main > div > div > div > div:not(.ant-tabs):not([style*="display: none"])'
        );
    }

    // order of user fields
    // UF_NAME
    // UF_ID
    // UF_PHONE
    // UF_PERM_ADDR
    // UF_POP_TYPE
    // UF_IS_TENANT
    // UF_SAME_PERM_ADDR
    // UF_IS_OWNER
    // UF_ADDR_LONG
    // UF_ADDR_UNIT
    // UF_ADDR_ROOM
    // UF_FLAGS

    function parseUsers(resp) {
        const users = [];
        for (let record of resp.result.records) {
            for (let house of JSON.parse(record.personHouses)) {
                const match = /(\d+)弄\/(\d+)号楼\/(\d+)/g.exec(house.houseAddress);
                const fields = [
                    record.realName, record.cardIdOrg, 
                    record.phoneNumOrg,
                    record.permanentAddress, record.populationType,
                    // all the living states
                    // 1 - false,
                    // 0 - true
                    // so convert to the real state
                    1 - parseInt(house.livingState, 10),
                    1 - parseInt(house.isOneself, 10),
                    1 - parseInt(house.isOwner, 10)
                ];
                fields.push(match[1], match[2], match[3]);
                // add community flags
                const flags = []
                if (record.personOrgsPositions) {
                    for (let flag of JSON.parse(record.personOrgsPositions)) {
                        flags.push(flag.tagName);
                    }
                }
                fields.push(flags.join(','))
                users.push(fields.join('\t'));
            }
        }
        return users;
    }

    async function dumpUsers() {
        const currentTab = currentVisibleTab();
        const nextPageButton = currentTab.querySelector("li.ant-pagination-next");
        const records = [];
        // force querying the first page
        let resp = await waitUntilRequestDone(() => {
            currentTab.querySelector("div.table-page-search-wrapper button:first-child").click();
        });

        while (g_running) {
            if (resp.target.status !== 200) {
                throw new Error('request error');
            }
            records.push(...parseUsers(JSON.parse(resp.target.response)));
            if (nextPageButton.getAttribute("class").includes("ant-pagination-disabled")) {
                break;
            }
            resp = await waitUntilRequestDone(() => nextPageButton.click());
            await delay(150);
        }
        console.log(records.join("\n"));
        console.log("stopped dumping");
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "k") {
            if (!g_running && confirm("begin dumping?")) {
                g_running = true;
                dumpUsers();
            } else if (g_running) {
                g_running = false;
            }
        }
    });
})();
