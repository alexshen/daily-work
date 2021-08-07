'use strict';

/* global cc */

window.ccu = (function() {
    function extractResponseContent(response) {
        if (response.success !== undefined && !response.success) {
            throw new Error(response);
        }
        if (response.code != undefined && response.code !== 200) {
            throw new Error(response);
        }
        return response.result;
    }

    async function get(urlOrString, params, headers) {
        headers['X-Access-Token'] = window.localStorage.getItem('__X-Access-Token');
        const resp =  await cc.doRequest(urlOrString, 'GET', params, null, headers, 'json');
        return extractResponseContent(resp);
    }

    async function postJson(urlOrString, json) {
        const headers = {};
        headers['X-Access-Token'] = window.localStorage.getItem('__X-Access-Token');
        headers['Content-Type'] = 'application/json';
        const resp = await cc.doRequest(urlOrString, 'POST', null, json, headers, 'json');
        return extractResponseContent(resp);
    }

    return {
        get: get,
        postJson: postJson,
    };
})();