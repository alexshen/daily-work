// ==UserScript==
// @name         ccweb2 tools
// @namespace    https://github.com/alexshen/daily-work/ccweb2
// @version      0.4
// @description  Tools for cc web 2
// @author       ashen
// @match        https://sqyjshd.mzj.sh.gov.cn/sqy-web/*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/ccweb2/common.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand, JSEncrypt */

(function () {
    "use strict";

    class Cookie {
        _kv = {};

        constructor(cookie) {
            this.update(cookie);
        }

        update(cookie) {
            let kv = this._kv;
            cookie.split('; ').forEach(e => {
                const [k, v] = e.split('=');
                kv[k] = decodeURIComponent(v);
            });
        }

        getItem(key) {
            return this._kv[key];
        }

        setItem(key, value) {
            this._kv[key] = value;
        }

        static getItem(key) {
            return new Cookie(document.cookie).getItem(key);
        }
    }

    function validateResponse(resp) {
        if (resp.status !== 200) {
            throw new Error(resp.message);
        }
        return resp.data;
    }

    const g_state = {
    };

    function capturePublicKey(request) {
        const resp = validateResponse(JSON.parse(request.response));
        g_state.rsaPublicKey = resp.rsaPublicKey;
        console.log('RSA Public Key: ', resp.rsaPublicKey);
        return true;
    }

    const AES_KEY_SEED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    function aesDecrypt(key, iv, data) {
        return CryptoJS.enc.Utf8.stringify(
            CryptoJS.AES.decrypt(data, CryptoJS.enc.Utf8.parse(key), {
                iv: CryptoJS.enc.Utf8.parse(iv),
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
            })
        ).toString();
    }

    async function doRequest(urlOrString, method, headers, params) {
        headers = headers || {};

        const enc = new JSEncrypt();
        enc.setPublicKey(g_state.rsaPublicKey);
        const key = cc.randomString(AES_KEY_SEED, 16)
        const iv = cc.randomString(AES_KEY_SEED, 16);
        headers['AES-KEY'] = enc.encrypt(key);
        headers['AES-IV'] = enc.encrypt(iv);
        headers['Authorization'] = Cookie.getItem('SQY-ADMIN-TOKEN');
        headers['Content-Type'] = 'application/json';

        const resp =  await cc.doRequest(urlOrString, method, params, null, headers, 'json');
        return JSON.parse(aesDecrypt(key, iv, validateResponse(resp)));
    }

    cc.XHRInterceptorUtils.use('/sqy-admin/api/conf/encrypt', capturePublicKey);

    /**
     * 
     * @param {Object} params - query parameters 
     * @param {number} params.page - page number starting from 0
     * @param {number} [params.size=0] - page size
     * @param {string} [params.sort=HOUSE_ID,desc] - sorting criterion
     * @param {number} [params.isVirtual=0] - 
     * @param {string} params.deptId - department id
     * @param {number} [params.isHisList=0] - 
     * @param {string} [params.searchContent] - searching criterion
     */
    async function listResidents(params) {
        const url = new URL('/sqy-admin/api/sqHouseInfo', document.location.origin);
        return await doRequest(url, 'GET', null, _.defaults(params, {
            size: 10, sort: 'HOUSE_ID,desc', isVirtual: 0, isHisList: 0
        }));
    }

    async function dumpResidents() {
        const deptId = Cookie.getItem("dept");
        const csvConv = new cc.CSVRecordConverter([
            { name: "UUID", key: "personId" },
            { name: "姓名", key: "name" },
            { name: "身份证", key: "cardNo" },
            { name: "电话", key: "phone" },
            { name: "户籍地址", key: "hjdz" },
            { name: "居住地址", key: "jzdz" },
            { name: "在住", key: "liveStatus" },
            { name: "人员类型", key: "personType" },
            { name: "社区标识", key: "tags" },
        ]);
        const records = [csvConv.headers];
        for (let curPage = 0; ; ++curPage) {
            const result = await listResidents({
                page: curPage,
                deptId: deptId,
                size: 30
            });
            if (result.content.length === 0) {
                break;
            }
            records.push(...await cc.slicedMap(result.content, async basicPersonInfo => {
                const resp = await queryPersonInfo(
                    _.chain(basicPersonInfo)
                        .pick(["relId", "personId", "houseId", "jwId"])
                        .set("deptId", deptId)
                        .value()
                );
                const personInfo = _.chain(resp)
                    .pick(["name", "phone", "cardNo", "hjdz", "personId", "personType", "tags", "liveStatus"])
                    .merge(_.pick(basicPersonInfo, "jzdz"))
                    .update('hjdz', clean)
                    .value();
                return csvConv.convertToArray(personInfo);
            }, 10, async () => await cc.delay(100)));
        }
        const text = records.map(e => e.join('\t')).join('\n');
        console.log(text);
        await navigator.clipboard.writeText(text);
        alert("Residents have been copied to the clipboard.");

        function clean(s) {
            return s.trim().replace(/\r\n|\r|\n/, ' ');
        }
    }

    async function getPDept(params) {
        const url = new URL('/sqy-admin/api/sysDept/getPDept', document.location.origin);
        return await doRequest(url, "GET", null, params);
    }

    /**
     * 
     * @param {Object} params query parameters
     * @param {string} params.deptId department Id
     */
    async function queryCurrentDept(params) {
        const url = new URL('/sqy-admin/api/sqAddress/queryCurrentDept', document.location.origin);
        return await doRequest(url, "GET", null, params);
    }

    /**
     * 
     * @param {Object} params query parameters
     * @param {string} params.relId
     * @param {string} params.personId 
     * @param {string} params.houseId
     * @param {string} params.deptId
     * @param {string} params.jwId
     * @param {number} [params.isHisList] - defaults to 0
     */
    async function queryPersonInfo(params) {
        const url = new URL('/sqy-admin/api/sqPersonInfo/queryPersonInfo', document.location.origin);
        return await doRequest(url, "GET", null, _.defaults(params, { isHisList: 0 }));
    }

    window.addEventListener('load', () => {
        GM_registerMenuCommand('Dump Residents', () => {
            dumpResidents();
        });

        GM_registerMenuCommand('Print RSA Public Key', () => {
            console.log(g_state.rsaPublicKey);
        });

        // heartbeat
        setInterval(() => {
            const deptId = Cookie.getItem('dept');
            if (deptId !== undefined) {
                queryCurrentDept({ deptId: deptId });
            }
        }, 60 * 1000);
    });
})();

