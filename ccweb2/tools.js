// ==UserScript==
// @name         ccweb2 tools
// @namespace    https://github.com/alexshen/daily-work/ccweb2
// @version      0.46
// @description  Tools for cc web 2
// @author       ashen
// @match        https://jczl.sh.cegn.cn/web/*
// @require      https://github.com/alexshen/daily-work/raw/main/ccweb2/common.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand, JSEncrypt, _ */

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
        headers['Aes-Key'] = enc.encrypt(key);
        headers['Aes-Iv'] = enc.encrypt(iv);
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

    /**
     * 
     * @param {Object} params - query parameters 
     * @param {string} params.deptId - department id
     * @param {number} [params.topAddress]
     * @param {number} [params.isVirtual]
     * @param {string} [params.pid] - parent node id
     * @param {string} [params.luId] - street id
     */
    async function queryAddressTree(params) {
        const url = new URL('/sqy-admin/api/sqAddress/getAddressTree', document.location.origin);
        return await doRequest(url, 'GET', null, params);
    }

    async function queryHouseTag(roomId) {
        const url = new URL('/sqy-admin/api/sqTagRecord/queryHouseTag/' + roomId, document.location.origin);
        return await doRequest(url, 'GET', null);
    }

    let isExportingResidents = false;
    let abortExportResidents = false;
    let exportResidentsBtn = null;

    let messageTimeout = null;
    let messageEl = null;
    let styleInjected = false;

    function injectMessageStyle() {
        if (styleInjected) return;
        const style = document.createElement('style');
        style.textContent = `
            #my-tools-message {
                position: fixed;
                bottom: 100px;
                right: 20px;
                z-index: 99999;
                background: rgba(0,0,0,0.75);
                color: #fff;
                padding: 12px 20px;
                border-radius: 4px;
                font-size: 14px;
                display: none;
                align-items: center;
                gap: 10px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            #my-tools-message .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top-color: #fff;
                animation: spin 0.8s linear infinite;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        styleInjected = true;
    }

    function createMessageElement() {
        if (messageEl) return;
        injectMessageStyle();
        messageEl = document.createElement('div');
        messageEl.id = 'my-tools-message';
        document.body.appendChild(messageEl);
    }

    function showMessage(text, persistent = false, closable = false) {
        createMessageElement();
        if (messageTimeout) {
            clearTimeout(messageTimeout);
            messageTimeout = null;
        }
        let content = `<span>${text}</span>`;
        if (closable) {
            content += `<span style="cursor:pointer;margin-left:auto;padding-left:15px;font-weight:bold;font-size:18px;" onclick="document.getElementById('my-tools-message').style.display='none';">✕</span>`;
            persistent = true; // 强制持久
            // 为错误列表添加滚动和最大高度
            messageEl.style.maxHeight = '300px';
            messageEl.style.overflowY = 'auto';
            messageEl.style.alignItems = 'flex-start'; // 顶部对齐，便于滚动
        } else {
            // 恢复默认样式（如果之前被修改）
            messageEl.style.maxHeight = '';
            messageEl.style.overflowY = '';
            messageEl.style.alignItems = 'center';
        }
        messageEl.innerHTML = content;
        messageEl.style.display = 'flex';
        if (!persistent) {
            messageTimeout = setTimeout(() => {
                messageEl.style.display = 'none';
            }, 3000);
        }
    }

    function updateMessage(text) {
        if (messageEl && messageEl.style.display !== 'none') {
            messageEl.innerHTML = text;
        }
    }

    function hideMessage() {
        if (messageTimeout) {
            clearTimeout(messageTimeout);
            messageTimeout = null;
        }
        if (messageEl) {
            messageEl.style.display = 'none';
        }
    }

    const KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE = "cmd/dumpResidents/page";
    const KEY_RESIDENT_DATA = "resident_data";

    async function cmdDumpResidents() {
        if (isExportingResidents) return;
        isExportingResidents = true;
        abortExportResidents = false;
        updateExportButton();

        const deptId = Cookie.getItem("dept");
        const csvConv = new cc.CSVRecordConverter([
            { name: "UUID", key: "personId" },
            { name: "姓名", key: "name" },
            { name: "身份证", key: "cardNo" },
            { name: "电话", key: "phone" },
            { name: "户籍地址", key: "hjdz" },
            { name: "居住ID", key: "relId" },
            { name: "居住地址", key: "jzdz" },
            { name: "房屋ID", key: "houseId" },
            { name: "在住", key: "liveStatus" },
            { name: "人员类型", key: "personType" },
            { name: "社区标识", key: "tags" },
            { name: "实口", key: "registeredPopulation" },
            { name: "紧急联系人", key: "emergencyContact" },
            { name: "紧急联系电话", key: "emergencyPhone" },
            { name: "备注", key: "remark" },
        ]);

        let records;
        let nextPage = Number(localStorage.getItem(KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE) || 0);
        const dataStr = localStorage.getItem(KEY_RESIDENT_DATA);
        let errorOccurred = false;

        // Resume from breakpoint if exists
        if (nextPage > 0 && dataStr) {
            showMessage('Detected breakpoint, restoring data...', false);
            await cc.delay(500);
            const lines = dataStr.split('\n');
            records = lines.map(line => line.split('\t'));
            console.log(`Resumed with ${records.length - 1} records, starting from page ${nextPage}`);
        } else {
            records = [csvConv.headers];
            localStorage.removeItem(KEY_RESIDENT_DATA);
            if (nextPage > 0) {
                localStorage.removeItem(KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE);
                nextPage = 0;
            }
        }

        // Show persistent progress indicator
        hideMessage();
        showMessage('Exporting resident data, please wait... <span class="spinner"></span>', true);

        try {
            for (let curPage = nextPage; ; ++curPage) {
                // Check for user abort
                if (abortExportResidents) {
                    throw new Error('User cancelled');
                }

                updateMessage(`Exporting resident data (page ${curPage + 1})... <span class="spinner"></span>`);

                const result = await listResidents({
                    page: curPage,
                    deptId: deptId,
                    queryScopeDeptId: deptId,
                    size: 30
                });
                if (result.content.length === 0) {
                    // No more data, clear breakpoint
                    localStorage.removeItem(KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE);
                    break;
                }

                // Check abort before processing each page
                if (abortExportResidents) {
                    throw new Error('User cancelled');
                }

                const convertedRows = await cc.slicedMap(result.content, async basicPersonInfo => {
                    const resp = await queryPersonInfo(
                        _.chain(basicPersonInfo)
                            .pick(["relId", "personId", "houseId", "jwId"])
                            .set("deptId", deptId)
                            .value()
                    );
                    const personInfo = _.chain(resp)
                        .pick(["name", "phone", "cardNo", "hjdz", "personId", "personType",
                            "relId", "liveStatus", "emergencyContact", "emergencyPhone", "remark"])
                        .merge(_.pick(basicPersonInfo, "jzdz"))
                        .update('hjdz', clean)
                        .value();
                    personInfo.tags = _.chain(resp.tagList).uniqBy('tagName').sortBy(['tagName']).map('tagName').join(',').value();
                    personInfo.houseId = resp.houseId;
                    personInfo.registeredPopulation = resp.skbz === "1";
                    return csvConv.convertToArray(personInfo);
                }, 10, async () => await cc.delay(100));

                records.push(...convertedRows);
                // Persist accumulated data (including header)
                localStorage.setItem(KEY_RESIDENT_DATA, records.map(row => row.join('\t')).join('\n'));
                // Save next page for breakpoint
                localStorage.setItem(KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE, curPage + 1);
            }
        } catch (e) {
            errorOccurred = true;
            hideMessage();
            if (e.message === 'User cancelled') {
                showMessage('Export cancelled by user.', false);
                // Keep cached data for resume
            } else {
                console.error(e);
                alert('Export failed: ' + e.message);
                // Keep cached data for retry
            }
        } finally {
            isExportingResidents = false;
            abortExportResidents = false;
            if (!errorOccurred) {
                // Successful completion
                hideMessage();
                const text = records.map(e => e.join('\t')).join('\n');
                const blob = new Blob([text], { type: 'text/tsv;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `居民数据_${new Date().toISOString().slice(0,10)}.tsv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                localStorage.removeItem(KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE);
                localStorage.removeItem(KEY_RESIDENT_DATA);
                alert('Export completed!');
            }
            updateExportButton();
        }

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
        const url = new URL('/sqy-admin/api/sqReceptionVisit/queryPersonList', document.location.origin);
        return await doRequest(url, "GET", null, _.defaults(params, { page: 0, size: 20 }));
    }

    /**
     *
     * @param {Object} params query parameters
     * @param {string} params.jwId
     */
    async function getWorkPersonList(params) {
        const url = new URL('/sqy-admin/api/sqReceptionVisit/getWorkPersonList', document.location.origin);
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
        const url = new URL('/sqy-admin/api/sqReceptionVisit', document.location.origin);
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
        showMessage('正在准备...', true);
        const errors = []; // 收集失败记录
        try {
            const path = await cc.selectFile();
            if (!path) {
                hideMessage();
                return;
            }
            updateMessage('正在解析文件...');
            const dal = new ReceptionVisitDAL();
            const staff = await getCachedWorkPersonList();
            const records = [];

            for (let r of await cc.readRecords(path)) {
            // calculate a stable hash
                r.hash = CryptoJS.MD5(
                    JSON.stringify(
                        _.chain(r)
                            .pick(RECEPTION_RECORD_FIELDS)
                            .sortBy((e) => e[0])
                            .value()
                    )
                ).toString();
                if (dal.has(r.hash)) continue;
                if (r.visitType in VISIT_TYPES === false) {
                    throw new Error(`invalid visitType ${r.visitType}`);
                }
                r.joinUser = r.joinUser.split(',');
                const invalidUsers = r.joinUser.filter(e => e in staff === false);
                if (invalidUsers.length) {
                    throw new Error(`invalid joinUser ${invalidUsers}`);
                }
                r.visitType = VISIT_TYPES[r.visitType];
                r.visitTime = moment(r.visitTime, "YYYY/MM/DD hh:mm");
                if (!r.visitTime.isBefore(moment())) continue;
                records.push(r);
            }

            if (records.length === 0) {
                hideMessage();
                showMessage('没有需要添加的记录', false);
                return;
            }

            const deptId = Cookie.getItem('dept');
            let successCount = 0;
            for (let i = 0; i < records.length; ++i) {
                // 更新进度
                updateMessage(`正在添加走访记录 (${i+1}/${records.length}) ... <span class="spinner"></span>`);

                const r = records[i];
                try {
                    // 1. 查询人员
                    const results = await queryPersonList({ personName: r.personName, jwId: deptId });
                    if (results.length === 0) {
                        errors.push({ personName: r.personName, address: r.address || '未提供', reason: '查无此人' });
                        continue;
                    }
                    if (results.length > 1 && !r.address) {
                        errors.push({ personName: r.personName, address: '未提供', reason: '重名且未指定地址' });
                        continue;
                    }
                    const person = results.length > 1
                        ? results.find(e => e.address.replaceAll('|', '') === r.address)
                        : results[0];
                    if (!person) {
                        errors.push({ personName: r.personName, address: r.address || '未提供', reason: '地址不匹配' });
                        continue;
                    }

                    await addReceptionVisitRecord({
                        address: person.address.replaceAll('|', ' '),
                        joinUser: r.joinUser.join(','),
                        joinUserId: r.joinUser.map(e => staff[e]).join(','),
                        jwId: deptId,
                        personId: person.personId,
                        personName: person.name,
                        relId: person.relId,
                        visitContent: r.visitContent,
                        visitTime: r.visitTime,
                        visitType: r.visitType
                    });

                    // 成功后才保存去重记录
                    dal.add(r.hash);
                    dal.save();
                    successCount++;
                    console.log(`[${i+1}/${records.length}] added: ${r.personName}`);

                } catch (e) {
                    errors.push({
                        personName: r.personName,
                        address: r.address || '未提供',
                        reason: e.message || '未知错误'
                    });
                }

                // 随机延迟
                if (i < records.length - 1) {
                    await cc.delay(((Math.random() * 5 | 0) * 2) * 1000);
                }
            }

            hideMessage();

            if (successCount > 0) {
                showMessage(`成功添加 ${successCount} 条记录`, false);
                alert(`完成添加，成功 ${successCount} 条`);
            }

            if (errors.length > 0) {
                const errorLines = errors.map(e =>
                    `姓名：${e.personName}，地址：${e.address}，原因：${e.reason}`
                );
                const errorText = '以下记录添加失败：<br>' + errorLines.join('<br>');
                showMessage(errorText, true, true);
            }

        } catch (e) {
            hideMessage();
            showMessage('添加失败：' + e.message, false);
            console.error(e);
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
                this.save();
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

    async function listAddresses() {
        const results = [];
        const deptId = Cookie.getItem("dept");
        // last node is not our concern
        const streets = _.initial(await queryAddressTree({ deptId, topAddress: 1 }));
        for (const street of streets) {
            const compounds = await queryAddressTree({
                deptId,
                pid: street.id,
                luId: street.id,
                isVirtual: 0,
            });
            for (const compound of compounds) {
                const units = await queryAddressTree({
                    deptId,
                    pid: compound.id,
                    nongId: compound.id,
                    luId: street.id,
                    isVirtual: 0,
                });
                for (const unit of units) {
                    const rooms = await queryAddressTree({
                        deptId,
                        pid: unit.id,
                        haoId: unit.id,
                        nongId: compound.id,
                        luId: street.id,
                        isVirtual: 0,
                    });
                    for (const room of rooms) {
                        results.push({ address: room.address, id: room.id });
                    }
                }
            }
        }
        return results;
    }

    const ADDRESSES_KEY = "addresses";
    async function getAddresses() {
        let addresses;
        if (!localStorage.getItem(ADDRESSES_KEY)) {
            addresses = await listAddresses();
            updateAddresses(addresses);
        } else {
            addresses = JSON.parse(localStorage.getItem(ADDRESSES_KEY));
        }
        return addresses;
    }

    function updateAddresses(addresses) {
        localStorage.setItem(ADDRESSES_KEY, JSON.stringify(addresses));
        console.log('updated address cache');
    }

    async function cmdDumpAddresses() {
        // last node is not our concern
        const csvConv = new cc.CSVRecordConverter([
            { name: "地址", key: "address" },
            { name: "id", key: "id" },
        ]);
        const records = [csvConv.headers];
        const addresses = await listAddresses();
        updateAddresses(addresses);
        for await (const room of addresses) {
            records.push(csvConv.convertToArray({ address: room.address, id: room.id }));
        }
        const text = records.map(e => e.join('\t')).join('\n');
        console.log(text);
    }

    async function cmdDumpRoomTags() {
        const csvConv = new cc.CSVRecordConverter([
            { name: "地址", key: "address" },
            { name: "标签", key: "tags" },
        ]);
        const records = [csvConv.headers];
        for (const room of await getAddresses()) {
            const tags = []
            for (const tag of await queryHouseTag(room.id)) {
                tags.push(tag.tagName);
            }
            records.push(csvConv.convertToArray({ address: room.address, tags: tags.join(',') }));
        }
        const text = records.map(e => e.join('\t')).join('\n');
        console.log(text);
    }

    function createFloatingButtons() {
        if (document.getElementById('my-tools-buttons')) return;
        const container = document.createElement('div');
        container.id = 'my-tools-buttons';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            display: flex;
            flex-direction: row;        /* 改为水平排列 */
            gap: 8px;                  /* 按钮间距 */
            align-items: center;       /* 垂直居中 */
        `;

        const buttons = [
            { label: '导出居民数据', action: cmdDumpResidents, id: 'export-residents-btn' },
            { label: '批量添加走访记录', action: cmdAddReceptionVisitRecord },
            { label: '导出地址列表', action: cmdDumpAddresses },
            { label: '导出房屋标签', action: cmdDumpRoomTags }
        ];

        buttons.forEach(({label, action, id}) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            if (id) {
                btn.id = id;
                exportResidentsBtn = btn;
            }
            btn.style.cssText = `
                padding: 8px 14px;
                background: #409EFF;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transition: background 0.2s;
                white-space: nowrap;
            `;
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) btn.style.background = '#66b1ff';
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.disabled) {
                    btn.style.background = (btn.id === 'export-residents-btn' && isExportingResidents)
                        ? '#F56C6C'
                        : '#409EFF';
                }
            });

            if (id === 'export-residents-btn') {
                btn.addEventListener('click', function(e) {
                    if (isExportingResidents) {
                        abortExportResidents = true;
                        this.disabled = true;
                        this.textContent = '正在中断...';
                        this.style.background = '#909399';
                    } else {
                        cmdDumpResidents();
                    }
                });
            } else {
                btn.addEventListener('click', action);
            }
            container.appendChild(btn);
        });

        document.body.appendChild(container);
        updateExportButton();
    }

    function updateExportButton() {
        if (!exportResidentsBtn) return;
        if (isExportingResidents) {
            exportResidentsBtn.textContent = '中断导出';
            exportResidentsBtn.style.background = '#F56C6C';
            exportResidentsBtn.disabled = false;
            return;
        }
        const hasResume = localStorage.getItem(KEY_CMD_DUMP_RESIDENTS_NEXT_PAGE) &&
                          localStorage.getItem(KEY_RESIDENT_DATA);
        exportResidentsBtn.textContent = hasResume ? '↻ 导出居民数据 (续传)' : '导出居民数据';
        exportResidentsBtn.style.background = '#409EFF';
        exportResidentsBtn.disabled = false;
    }

    window.addEventListener('load', () => {
        GM_registerMenuCommand('Dump Residents', () => {
            cmdDumpResidents();
        });

        GM_registerMenuCommand('Print RSA Public Key', () => {
            console.log(g_state.rsaPublicKey);
        });

        GM_registerMenuCommand('Add Visit Record', () => {
            cmdAddReceptionVisitRecord();
        });

        GM_registerMenuCommand('Dump Addresses', () => {
            cmdDumpAddresses();
        });

        GM_registerMenuCommand('Dump Room Tags', () => {
            cmdDumpRoomTags();
        });

        // heartbeat
        setInterval(() => {
            const deptId = Cookie.getItem('dept');
            if (deptId !== undefined) {
                queryCurrentDept({ deptId: deptId });
            }
        }, 60 * 1000);

        createFloatingButtons();
    });
})();