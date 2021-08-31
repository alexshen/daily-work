'use strict';

/* global cc */

window.ccu = (function() {
    function extractResponseContent(response) {
        if (response.success !== undefined && !response.success) {
            throw new Error(JSON.stringify(response));
        }
        if (response.code != undefined && response.code !== 200) {
            throw new Error(JSON.stringify(response));
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
        const resp = await cc.doRequest(urlOrString, 'POST', null, JSON.stringify(json), headers, 'json');
        return extractResponseContent(resp);
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
        get: get,
        postJson: postJson,
        selectFile: selectFile,
    };
})();