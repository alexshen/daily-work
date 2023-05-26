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

    class XHRInterceptorUtils {
        static _s_init = (function() {
            XHRInterceptor.addEventListener('load', XHRInterceptorUtils._onLoaded.bind(XHRInterceptorUtils));
        })();

        static _s_handlers = [];

        static _onLoaded(evt) {
            let outIndex = 0;
            for (let i = 0; i < this._s_handlers.length; ++i) {
                const e = this._s_handlers[i];
                try {
                    if (!e.pred(evt.target) || !e.handler(evt.target)) {
                        this._s_handlers[outIndex++] = this._s_handlers[i];
                    }
                } catch (ex) {
                    console.error(ex);
                }
            }
            this._s_handlers.splice(outIndex, this._s_handlers.length - outIndex);
        }

        /**
         * 
         * @param {String, Regex, Function} filter A predicate indicating if the handler needs to run
         * @param {*} handler Returns true if the handler needs to be removed
         */
        static use(filter, handler) {
            let pred = null;
            if (typeof filter === 'string') {
                pred = request => new URL(request.responseURL).pathname === filter;
            } else if (filter instanceof RegExp) {
                pred = request => filter.test(request.href)
            } else if (typeof filter === 'function') {
                pred = request => filter(request)
            } else {
                throw new Error('invalid filter');
            }
            this._s_handlers.push({ pred: pred, handler: handler});
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

    async function readLines(filename) {
        const data = await readFile(filename);
        return data.split(/\r\n?|\n/)
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

    /**
     * generate a random string from the source string
     * @param {Array} s - source string
     * @param {number} len - length of the resulting random string
     */
    function randomString(s, len) {
        let res = '';
        while (len--) {
            res += s[Math.random() * s.length | 0];
        }
        return res;
    }

    class CSVRecordConverter {
        /**
         * 
         * @param {Object[]} headerDescriptors 
         * @param {string} headerDescriptors[].name - name of the header
         * @param {string} headerDescriptors[].key - key name of the header value in a source object
         * @param {string} headerDescriptors[].default - the default value if the key does not exist
         */
        constructor(headerDescriptors) {
            this._headerDescriptors = headerDescriptors;
        }

        get headers() {
            return _.map(this._headerDescriptors, e => e.name);
        }

        convertToArray(o) {
            return _.map(this._headerDescriptors, e => _.get(o, e.key, e.default));
        }
    }

    /**
     * divide an array into an array of sub-arrays
     * @param {Object[]} array - array to be sliced
     * @param {number} sliceSize 
     * @returns 
     */
    function divide(array, sliceSize) {
        if (sliceSize <= 0) throw new Error(sliceSize);

        const res = [];
        for (let i = 0; i < array.length; i += sliceSize) {
            res.push(array.slice(i, Math.min(i + sliceSize, array.length)));
        }
        return res;
    }

    /**
     * divide the array and run each slice one by one
     * @param {Object[]} array - source array
     * @param {function} map - mapping function returning a Promise
     * @param {number} sliceSize - slice size
     * @param {function} [sliceMappingCompleted] - called when each slice has completed running, must return a Promise
     */
    async function slicedMap(array, map, sliceSize, sliceMappingCompleted) {
        const results = [];
        for (let slice of divide(array, sliceSize)) {
            results.push(...await Promise.all(slice.map(map)));
            if (sliceMappingCompleted) {
                await sliceMappingCompleted();
            }
        }
        return results;
    }

    async function selectFile() {
        const input = document.createElement('input');
        input.type = 'file';
        let files;
        input.onchange = e => {
            files = e.target.files;
        };
        input.click();
        while (!files) {
            await cc.delay(100);
        }
        return files[0];
    }

    return {
        delay: delay,
        XHRInterceptor: XHRInterceptor,
        XHRInterceptorUtils: XHRInterceptorUtils,
        RequestWaiter: RequestWaiter,
        CSVRecordConverter: CSVRecordConverter,
        waitUntilRequestDone: waitUntilRequestDone,
        readFile: readFile,
        objectFromKeyValueArrays: objectFromKeyValueArrays,
        readRecords: readRecords,
        doRequest: doRequest,
        readLines: readLines,
        randomString: randomString,
        divide: divide,
        slicedMap: slicedMap,
        selectFile,
    };
})();
