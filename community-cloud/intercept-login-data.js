// ==UserScript==
// @name         Intercept Login Data
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       ashen
// @match        http://10.87.105.104/user/login*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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

    async function waitForCaLoginFinishes() {
        const waiter = new RequestWaiter(/.+\/community-cloud\/sys\/caLogin$/);
        const event = await waiter.wait();
        const result = JSON.parse(event.target.response).result;
        window.localStorage.setItem("__X-Access-Token", result.token);
        console.log("X-Access-Token", result.token);
    }

    window.onload = () => {
        waitForCaLoginFinishes();
    };
})();