'use strict';

// ==UserScript==
// @name    Neighbour Functions
// @author  ashen
// @version 0.12
// @grant   GM_registerMenuCommand
// @match https://www.juweitong.cn/neighbour/*
// @require https://raw.githubusercontent.com/alexshen/daily-work/main/ccweb/common.js
// @require https://raw.githubusercontent.com/alexshen/daily-work/main/ccweb/utils.js
// ==/UserScript==

/* global cc, ccu, GM_registerMenuCommand */

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
    '社区', '楼号', '房间号', '姓名', 'UUID', '身份证', '电话', '用户状态', '审核时间'
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
        getMemberAttribute('MobileNoText'),
        getStatusText()
    ];

    function getCommunityName() {
        const e = doc.querySelector('form > div:nth-child(2) > div:nth-child(1) > div:last-child');
        return e.innerText.trim();
    }

    function getMemberAttribute(name) {
        return doc.querySelector(`input[name=${name}]`).value;
    }

    function getStatusText() {
        const e = doc.querySelector('div.container > div:nth-child(8) > div > div:nth-child(4) > span');
        return e.innerText;
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
    to = to || from || 12;
    from = from || 1;
    if (from < 1 || from > 12 ||
        to < 1 || to > 12) {
        throw new Error("Invalid month range");
    }

    const records = [];
    for (let i = from; i <= to; ++i) {
        records.push(...await getCredits(year, i));
        await cc.delay(500);
    }
    records.unshift(CREDIT_HEADERS);
    console.log(records.map(e => e.join('\t')).join('\n'));
}

async function activateMember(uuid) {
    const url = new URL('/neighbour/common/member_auth_reuse', document.location.origin);
    const resp = await get(url, { member: uuid }, null, 'json');
    return resp.success;
}

async function deactivateMember(uuid) {
    const url = new URL('/neighbour/common/member_auth_stop', document.location.origin);
    const resp = await get(url, { member: uuid }, null, 'json');
    return resp.success;
}

async function removeMember(uuid) {
    const url = new URL('/neighbour/common/member_auth_remove', document.location.origin);
    const resp = await get(url, { member: uuid }, null, 'json');
    return resp.success;
}

window.addEventListener('load', () => {
    GM_registerMenuCommand("Dump Members", () => {
        const cid = /cid=(.+)/.exec(document.URL)[1];
        dumpAllMembers(cid);
    });

    GM_registerMenuCommand("Dump Credits", () => {
        const [year, from, to] = prompt('Specify the date range to dump credits, year [from [to]]')
                                .split(' ')
                                .map(e => parseInt(e, 10));
        if (year === undefined || isNaN(year)) {
            throw new Error('Invalid year');
        }
        if (from !== undefined && isNaN(from)) {
            throw new Error('Invalid starting month');
        }
        if (to !== undefined && isNaN(to)) {
            throw new Error("Invalid ending month");
        }
        dumpCreditsBetweenMonths(year, from, to);
    });

    GM_registerMenuCommand("Deactivate Members", async () => {
        const fname = await ccu.selectFile();
        if (!fname) {
            return;
        }
        for (let r of await cc.readRecords(fname)) {
            if (await deactivateMember(r.uuid)) {
                console.log(`deactivated ${r.uuid}`);
            } else {
                console.log(`failed to deactivate ${r.uuid}`);
            }
        }
    });

    GM_registerMenuCommand("Remove Members", async () => {
        const fname = await ccu.selectFile();
        if (!fname) {
            return;
        }
        for (let r of await cc.readRecords(fname)) {
            if (await removeMember(r.uuid)) {
                console.log(`removed ${r.uuid}`);
            } else {
                console.log(`failed to remove ${r.uuid}`);
            }
        }
    });
});