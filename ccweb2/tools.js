// ==UserScript==
// @name         ccweb2 tools
// @namespace    https://github.com/alexshen/daily-work/ccweb2
// @version      0.19
// @description  Tools for cc web 2
// @author       ashen
// @match        https://sqyjshd.mzj.sh.gov.cn/sqy-web/*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/ccweb2/common.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js
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

    function aesEncrypt(key, iv, data) {
        return CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(data), 
                CryptoJS.enc.Utf8.parse(key), {
                    iv: CryptoJS.enc.Utf8.parse(iv),
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7
                }).toString();
    }

    async function doRequest(urlOrString, method, headers, params, data) {
        headers = headers || {};

        const enc = new JSEncrypt();
        enc.setPublicKey(g_state.rsaPublicKey);
        const key = cc.randomString(AES_KEY_SEED, 16)
        const iv = cc.randomString(AES_KEY_SEED, 16);
        headers['AES-KEY'] = enc.encrypt(key);
        headers['AES-IV'] = enc.encrypt(iv);
        headers['Authorization'] = Cookie.getItem('SQY-ADMIN-TOKEN');
        headers['Content-Type'] = 'application/json';

        if (data) {
            data = aesEncrypt(key, iv, JSON.stringify(data));
        }

        const resp = await cc.doRequest(urlOrString, method, params, data, headers, 'json');
        return resp ? JSON.parse(aesDecrypt(key, iv, validateResponse(resp))) : null;
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
            { name: "居住ID", key: "relId" },
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
                    .pick(["name", "phone", "cardNo", "hjdz", "personId", "personType", "tags", "relId", "liveStatus"])
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
            return s ? s.trim().replace(/\r\n|\r|\n/, ' ') : s;
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

    /**
     *
     * @param {Object} params query parameters
     * @param {string} params.personName
     * @param {string} params.jwId
     * @param {string} params.page - defaults to 0
     * @param {string} params.size - defaults to 20
     */
    async function queryPersonList(params) {
        const url = new URL('/sqyjshd-admin/api/sqReceptionVisit/queryPersonList', document.location.origin);
        return await doRequest(url, "GET", null, _.defaults(params, { page: 0, size: 20 }));
    }

    /**
     *
     * @param {Object} params query parameters
     * @param {string} params.jwId
     */
    async function getWorkPersonList(params) {
        const url = new URL('/sqyjshd-admin/api/sqReceptionVisit/getWorkPersonList', document.location.origin);
        return await doRequest(url, "GET", null, params);
    }

    async function getCachedWorkPersonList() {
        if (!g_state.staff) {
            const people = await getWorkPersonList({ jwId: Cookie.getItem('dept')});
            g_state.staff = _.fromPairs(_.map(people, e => [e.name, e.personId]))
        }
        return g_state.staff;
    }

    /**
     *
     * @param {Object} params query parameters
     * @param {string} params.address
     * @param {string} params.jwId
     * @param {string} params.joinUser
     * @param {string} params.joinUserId
     * @param {string} params.personId
     * @param {string} params.personName
     * @param {string} params.relId
     * @param {string} params.visitContent
     * @param {string} params.visitTime UTC time
     * @param {string} params.visitType
     * @param {boolean} params.isSync - defaults to false
     * @param {string} params.opTime - defaults to null
     * @param {string} params.recorder - defaults to null
     * @param {string} params.userId - defaults to null
     * @param {string} params.validity - defaults to "1"
     * @param {string} params.visitId - defaults to null
     * @param {string} params.visitImg - defaults to null
     */
    async function addReceptionVisitRecord(params) {
        const url = new URL('/sqyjshd-admin/api/sqReceptionVisit', document.location.origin);
        return await doRequest(url, "POST", null, null, 
            _.defaults(params, { 
                isSync: false, opTime: null, recorder: null, userId: null,
                validity: "1", visitId: null, visitImg: null
            }));
    }

    const VISIT_TYPES = {
        '接待': "1",
        '走访': "2",
        '电话': "3",
        '微信': "4",
        '楼宇视频': "5",
        '其他': "6",
    };
    const RECEPTION_RECORD_FIELDS = [ 'personName', 'visitType', 'visitTime', 'visitContent', 'joinUser' ];
    async function cmdAddReceptionVisitRecord() {
        const path = await cc.selectFile();
        if (!path) {
            return;
        }
        const dal = new ReceptionVisitDAL();
        const staff = await getCachedWorkPersonList();
        const records = [];
        for (let r of await cc.readRecords(path)) {
            if (r.visitType in VISIT_TYPES === false) {
                throw new Error(`invalid visitType ${r.visitType}`);
            }
            if (r.joinUser in staff === false) {
                throw new Error(`invalid joinUser ${r.joinUser}`);
            }
            r.visitType = VISIT_TYPES[r.visitType];
            r.visitTime = moment(r.visitTime, "YYYY/MM/DD hh:mm");
            // ignore records that happen later now
            if (!r.visitTime.isBefore(moment())) {
                continue;
            }
            r.hash = CryptoJS.MD5(JSON.stringify(_.pick(r, RECEPTION_RECORD_FIELDS))).toString();
            if (dal.has(r.hash)) {
                continue;
            }
            records.push(r);
        }

        const deptId = Cookie.getItem('dept');
        for (let i = 0; i < records.length; ++i) {
            const r = records[i];
            const results = await queryPersonList({personName: r.personName, jwId: deptId});
            if (results.length === 0) {
                console.warn(`invalid person name: ${r.personName}`);
                continue;
            }
            // find the person with the specified address if there are more than one people with the same name
            const person = results.length > 1 
                                ?  results.find(e => e.address.replaceAll('|', '') === r.address) 
                                : results[0];
            if (!person) {
                console.warn(`cannot find person: ${JSON.stringify(r)}`);
                continue;
            }
            await addReceptionVisitRecord({
                address: person.address.replaceAll('|', ' '),
                joinUser: r.joinUser,
                joinUserId: staff[r.joinUser],
                jwId: deptId,
                personId: person.personId,
                personName: person.name,
                relId: person.relId,
                visitContent: r.visitContent,
                visitTime: r.visitTime,
                visitType: r.visitType
            })
            console.log(`[${i+1}/${records.length}] added visit record: ${JSON.stringify(_.omit(r, 'hash'))}`);
            dal.add(r.hash);
            dal.save();
            // vary the recording time
            await cc.delay(((Math.random() * 5 | 0) * 2 + 10) * 1000);
        }
        if (records.length) {
            alert('finish adding reception visit records');
        }
    }

    class ReceptionVisitDAL {
        static _KEY = "reception_visit";

        constructor() {
            this.init();
        }

        init() {
            this._state = JSON.parse(localStorage.getItem(ReceptionVisitDAL._KEY)) || ReceptionVisitDAL._default();
            this._state.lastUpdateTime = moment(this._state.lastUpdateTime);
            const now = moment();
            // data has expired, clear all
            // only one month worth of records are saved
            if (this._state.lastUpdateTime.year() !== now.year() ||
                this._state.lastUpdateTime.month() !== now.month()) {
                this._state = ReceptionVisitDAL._default();
                tihs.save();
            }
        }

        static _default() {
            return { lastUpdateTime: moment(), data: {} };
        }

        add(id) {
            if (this.has(id)) {
                throw new Error('duplicate id');
            }
            this._state.data[id] = 1;
            this._state.lastUpdateTime = moment();
        }

        has(id) {
            return id in this._state.data;
        }

        save() {
            localStorage.setItem(ReceptionVisitDAL._KEY, JSON.stringify(this._state));
        }
    }

    window.addEventListener('load', () => {
        GM_registerMenuCommand('Dump Residents', () => {
            dumpResidents();
        });

        GM_registerMenuCommand('Print RSA Public Key', () => {
            console.log(g_state.rsaPublicKey);
        });

        GM_registerMenuCommand('Add Visit Record', () => {
            cmdAddReceptionVisitRecord();
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

