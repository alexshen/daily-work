'use strict';

// ==UserScript==
// @name    Member List Functions
// @author  ashen
// @version 0.1
// @grant   GM_registerMenuCommand
// @match https://www.juweitong.cn/neighbour/*
// @require https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// ==/UserScript==

/* global cc, GM_registerMenuCommand */

async function get(urlOrString, params, headers, respType) {
    headers = headers || {};
    params = params || {};
    return await cc.doRequest(urlOrString, 'GET', params, null, headers, respType);
}

async function postJson(urlOrString, json) {
    const headers = {};
    headers['Content-Type'] = 'application/json';
    return await cc.doRequest(urlOrString, 'POST', null, JSON.stringify(json), headers, 'json');
}

const HEADERS = [
    '社区', '楼号', '房间号', '姓名', '身份证', '电话' 
];

async function getMemberInfo(mid) {
    const url = new URL('/neighbour/common/member_auth_check', document.location.origin);
    const resp = await get(url, { member: mid });
    const parser = new DOMParser();
    const doc = parser.parseFromString(resp, 'text/html');

    return [
        getCommunityName(),
        getMemberAttribute('BuildingNo'),
        getMemberAttribute('RoomNo'),
        getMemberAttribute('MemberName'),
        getMemberAttribute('IDNoText'),
        getMemberAttribute('MobileNoText')
    ];

    function getCommunityName() {
        const e = doc.querySelector('form > div:nth-child(2) > div:nth-child(1) > div:last-child');
        return e.innerText.trim();
    }

    function getMemberAttribute(name) {
        return doc.querySelector(`input[name=${name}]`).value;
    }
}

async function getMembers(start, end, cid) {
    const url = new URL('/neighbour/common/general_member_query', document.location.origin);
    const resp = await postJson(url, {
        Begin: start,
        End: end,
        CommunityID: cid
    });
    if (!resp.success) {
        throw new Error();
    }
    return await Promise.all(resp.responseText.map(e => getMemberInfo(e.MemberID)));
}

async function getAllMembers(cid) {
    const COUNT = 20;
    let i = 0;
    let hasMore = true;
    const allMembers = [];
    while (hasMore) {
        const members = await getMembers(i, i + COUNT, cid);
        allMembers.push(...members);
        hasMore = members.length === COUNT;
        i += COUNT;
    }
    return allMembers;
}

async function dumpAllMembers(cid) {
    const members = await getAllMembers(cid);
    members.unshift(HEADERS);
    console.log(members.flatMap(e => e.join('\t')).join('\n'));
}

window.addEventListener('load', () => {
    GM_registerMenuCommand("Dump Members", () => {
        const cid = /cid=(.+)/.exec(document.URL)[1];
        dumpAllMembers(cid);
    });
});