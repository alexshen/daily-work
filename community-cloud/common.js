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
                this.addEventListener("error", XHRInterceptor._handleEvent);
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
            this._predicate = predicate;
            this._onResponseHandler = this._onResponse.bind(this);
            this._isWaiting = true;
            XHRInterceptor.addEventListener("load", this._onResponseHandler);
            XHRInterceptor.addEventListener("error", this._onResponseHandler);
        }

        then(resolve, reject) {
            this._wait(resolve, reject);
        }

        /**
         * wait until the target response has been received
         * @returns the request
         */
        async _wait(resolve, reject) {
            while (this._isWaiting) {
                await delay(100);
            }
            if (this._request) {
                resolve(this._request);
            } else {
                reject(new Error('request waiting was aborted'));
            }
        }

        /**
         * force ending the waiting
         */
        dispose() {
            this._isWaiting = false;
            XHRInterceptor.removeEventHandler("load", this._onResponseHandler);
            XHRInterceptor.removeEventHandler("error", this._onResponseHandler);
        }

        _onResponse(e) {
            if (!this._predicate || this._predicate(e.target)) {
                this._request = e.target;
                this.dispose();
            }
        }
    }

    /**
     * wait until the started request has finished
     * @param  initiator a function which starts a request
     *         The initiator can return nothing or an object which is then awaited on
     * @returns the awaited event
     */
    async function waitUntilRequestDone(initiator) {
        let waiter = initiator();
        try {
            if (waiter === undefined || waiter === null) {
                waiter = new RequestWaiter();
            }
            return await waiter;
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