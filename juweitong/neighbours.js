'use strict';

// ==UserScript==
// @name    Neighbour Functions
// @author  ashen
// @version 0.4
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

const MEMBER_HEADERS = [
    '社区', '楼号', '房间号', '姓名', 'UUID', '身份证', '电话', '审核时间'
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
        mid,
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
    return await Promise.all(resp.responseText.map(async e => {
        const member = await getMemberInfo(e.MemberID);
        member.push(e.AuthDateTime);
        return member;
    }));
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
    members.unshift(MEMBER_HEADERS);
    console.log(members.flatMap(e => e.join('\t')).join('\n'));
}

const CREDIT_HEADERS = ['UUID', '姓名', '分数', '年', '月']

async function getCredits(year, month) {
    const url = new URL('/neighbour/api/point_log/creditrank', document.location.origin);
    let page = 1;
    const COUNT = 20;
    let hasMore = true;
    const creditRecords = [];
    while (hasMore) {
        const res = await postJson(url, {
            community: "0",
            month: `${year}${month.toString().padStart(2, '0')}`,
            page: page,
            pagecount: COUNT.toString(),
            type: 1
        });
        for (let e of res) {
            creditRecords.push([
                e.id,
                e.name,
                e.grade,
                year,
                month
            ]);
        }
        hasMore = res.length === COUNT;
        ++page;
    }
    return creditRecords;
}

async function dumpCreditsBetweenMonths(year, from, to) {
    const requests = [];
    to = to || from;
    for (let i = from; i <= to; ++i) {
        requests.push(getCredits(year, i));
    }
    const result = (await Promise.all(requests)).flatMap(e => e.map(e => e.join('\t')));
    result.unshift(CREDIT_HEADERS.join('\t'));
    console.log(result.join('\n'));
}

window.addEventListener('load', () => {
    GM_registerMenuCommand("Dump Members", () => {
        const cid = /cid=(.+)/.exec(document.URL)[1];
        dumpAllMembers(cid);
    });
    GM_registerMenuCommand("Dump Credits", () => {
        const [year, from, to] = prompt('Specify the months to dump credits, e.g. 2022 1 3 to dump the credits from Jan to Mar in 2022')
                                .split(' ')
                                .map(e => parseInt(e, 10));
        if (year === undefined || isNaN(year) ||
            from === undefined || isNaN(from) ||
            (to !== undefined && isNaN(to))) {
            throw new Error("Invalid months");
        }
        dumpCreditsBetweenMonths(year, from, to);
    });
});