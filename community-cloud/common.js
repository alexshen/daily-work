'use strict';

window.cc = (function() {

    /** 
     * return a promise which delays for a period of time
     * @param {number} durationMs milliseconds to delay
     * @returns a promise
     * */ 
    function delay(durationMs) {
        return new Promise((resolved) => {
            setTimeout(resolved, durationMs);
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
        /**
         * @param predicate returns true indicating the waiting should end
         */
        constructor(predicate) {
            this._filter = predicate;
            this._onResponseHandler = this._onResponse.bind(this);
            this._wait = true;
            XHRInterceptor.addEventListener("load", this._onResponseHandler);
        }

        /**
         * wait until the target response has been received
         * @returns the response event
         */
        async wait() {
            while (this._wait) {
                await delay(100);
            }
            return this._event;
        }

        /**
         * force ending the waiting
         */
        dispose() {
            this._wait = false;
            XHRInterceptor.removeEventHandler("load", this._onResponseHandler);
        }

        _onResponse(e) {
            if (!this._filter || this._filter(e.target)) {
                this._event = e;
                this.dispose();
            }
        }
    }

    /**
     * wait until the started request has finished
     * NOTE: This only works when there's no pending request before calling the function.
     * @param  initiator a function which starts a request
     * @returns the awaited event
     */
    async function waitUntilRequestDone(initiator) {
        const waiter = new RequestWaiter();
        try {
            initiator();
            return waiter.wait();
        } finally {
            waiter.dispose();
        }
    }

    return {
        delay: delay,
        XHRInterceptor: XHRInterceptor,
        RequestWaiter: RequestWaiter,
        waitUntilRequestDone: waitUntilRequestDone,
    };
})();