// ==UserScript==
// @name         Dump Record from Repo
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
            await waitUntilRequestDone(() => nextPageButton.click());
            await delay(250);
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
