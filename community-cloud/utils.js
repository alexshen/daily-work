'use strict';

/* global cc */

window.ccu = (function() {
    async function get(urlOrString, params, headers, responseType) {
        headers['X-Access-Token'] = window.localStorage.getItem('__X-Access-Token');
        return await cc.doRequest(urlOrString, 'GET', params, null, headers, responseType);
    }

    async function postJson(urlOrString, json, responseType) {
        const headers = {};
        headers['X-Access-Token'] = window.localStorage.getItem('__X-Access-Token');
        headers['Content-Type'] = 'application/json';
        return await cc.doRequest(urlOrString, 'POST', null, json, headers, responseType);
    }

    return {
        get: get,
        postJson: postJson,
    };
})();