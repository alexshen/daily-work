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

    /**
     * read the file with the specified encoding
     * @param blobOrFile Blob or File object
     * @param {string} encoding encoding of the file, the default is utf-8
     * @returns a promise returning the file content
     */
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

    /**
     * Populate an object with keys and values.
     * If there are more keys than values, the corresponding values will be set to null.
     * If there are less keys than values, the extra values will be discarded.
     * @param {*} keys an array of keys
     * @param {*} values an array of values corresponding to the keys
     * @returns an object with key/value pairs populated
     */
    function objectFromKeyValueArrays(keys, values) {
        const o = {};
        keys.forEach((e, i) => {
            o[e] = values[i];
        });
        return o;
    }

    /**
     * Read records from a file, the first line must contain field names.
     * If there are less columns than field names, extra columns will be set to null.
     * If there are more columns than field names, extra columns will be discarded.
     * @param {string} filename 
     * @param sep a simple string or regular expression
     * @returns an array of record objects
     */
    async function readRecords(filename, sep='\t') {
        const data = await readFile(filename);
        const [fieldLine, ...recordLines] = data.split(/\r\n?|\n/);
        const fieldNames = fieldLine.split(sep);
        const records = [];
        for (let line of recordLines) {
            if (line.length === 0) {
                break;
            }
            records.push(objectFromKeyValueArrays(fieldNames, line.split(sep)));
        }
        return records;
    }

    async function doRequest(urlOrString, method, params, data, headers, responseType) {
        let url = urlOrString;
        if (typeof urlOrString === 'string') {
            url = new URL(urlOrString);
        }
        if (params) {
            for (let key in params) {
                url.searchParams.set(key, params[key]);
            }
        }
        const xhr = new XMLHttpRequest();
        xhr.open(method, url)
        if (responseType) {
            xhr.responseType = responseType;
        }
        if (headers) {
            for (let key in headers) {
                xhr.setRequestHeader(key, headers[key]);
            }
        }
        xhr.send(data);
        let done = false;
        xhr.onload = () => done = true;
        xhr.onerror = () => done = true;
        while (!done) {
            await cc.delay(100);
        }
        if (!xhr.status) {
            throw new Error('request error');
        }
        if (xhr.status !== 200) {
            throw new Error(xhr);
        }
        return xhr.response;
    }

    return {
        delay: delay,
        XHRInterceptor: XHRInterceptor,
        RequestWaiter: RequestWaiter,
        waitUntilRequestDone: waitUntilRequestDone,
        readFile: readFile,
        objectFromKeyValueArrays: objectFromKeyValueArrays,
        readRecords: readRecords,
        doRequest: doRequest,
    };
})();