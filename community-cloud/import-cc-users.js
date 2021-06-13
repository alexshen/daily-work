// ==UserScript==
// @name         Import New Users for Community Cloud
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  try to take over the world!
// @author       ashen
// @match        http://10.87.105.104/person/PersonInfoList
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let g_stop = false;

    function delay(duration) {
        return new Promise(resolved => {
            setTimeout(resolved, duration);
        });
    }

    const VALID_LONGS = {
        '南大路': new Set(['6', '8', '10', '12', '14', '16', '18', '20']),
        '场中路': new Set(['4079'])
    };

    const LONG_COMMUNITY_DICT = {
        '6': '骏华苑小区',
        '8': '8弄小区',
        '10': '洛河桥小区',
        '12': '洛河桥小区',
        '14': '洛河桥小区',
        '16': '洛河桥小区',
        '18': '洛河桥小区',
        '20': '洛河桥小区',
        '4079': '智华苑小区'
    };

    const COLLECTIVE_ADDRESSES = {
        '场中路4098弄': '社区相关地址/集体户口',
        '场中路4087号': '社区相关地址/集体户口',
        '场中路4068号': '社区相关地址/集体户口',
        '马路桥': '社区相关地址/已动拆迁地址',
        '南大路8弄3号': '社区相关地址/周围单位或商铺',
        '南大路28号': '社区相关地址/周围单位或商铺'
    };

    function isLocalCommunityAddr(addr) {
        let longs = VALID_LONGS[addr[0]];
        return longs && longs.has(addr[1], 10);
    }

    class XHRInterceptor {
        static _s_init = (function () {
            const openOrg = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function () {
                this.addEventListener("load", XHRInterceptor._handleEvent);
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

    class RequestWaiter {
        constructor(urlRegex) {
            this._urlRegex = urlRegex
            this._onResponseHandler = this._onResponse.bind(this);
            this._wait = true;
            XHRInterceptor.addEventListener("load", this._onResponseHandler);
        }

        async wait() {
            while (this._wait) {
                await delay(100);
            }
            return this._event;
        }

        dispose() {
            this._wait = false;
            XHRInterceptor.removeEventHandler("load", this._onResponseHandler);
        }

        _onResponse(e) {
            if (!this._urlRegex || e.target.responseURL.match(this._urlRegex)) {
                this._event = e;
                this.dispose();
            }
        }
    }

    // wait until the next request is finished
    async function waitUntilRequestDone(initiator) {
        const waiter = new RequestWaiter();
        try {
            initiator();
            return await waiter.wait();
        } finally {
            waiter.dispose();
        }
    }

    async function waitUntilSpinningHasFinished(parent, elementSelector) {
        const spinner = parent.querySelector(elementSelector);
        while (spinner.getAttribute("class").includes("ant-spin-blur")) {
            await delay(200);
        }
    }

    async function waitUntilElementIsFound(elementSelector, root = document, retryCount = 20, initialDelay = 500, maxDelay = 2000) {
        let curDelay = initialDelay;
        for (let i = 0; i < retryCount; ++i) {
            await delay(curDelay);
            let element = root.querySelector(elementSelector);
            if (element) {
                return element;
            }
            console.log(`${elementSelector} not found, retry ${i + 1}`);
            curDelay = Math.min(curDelay * 2, maxDelay);
        }
        throw new Error(`unable to find the element ${elementSelector} due to timeout`);
    }

    async function waitUntilPersonInfoHasLoaded() {
        return await waitUntilElementIsFound('.people-add');
    }

    // wait until the submenu is loaded and return all the menu items
    async function waitUntilSubMenuHasLoaded(i) {
        let subMenu = await waitUntilElementIsFound(`.ant-cascader-menus-content > ul:nth-child(${i + 1})`);
        let menuItems = subMenu.querySelectorAll('li');
        while (menuItems.length === 0) {
            await delay(100);
            menuItems = subMenu.querySelectorAll('li');
        }
        return Array.from(menuItems);
    }

    async function findMenuItem(subMenuIndex, condition) {
        return (await waitUntilSubMenuHasLoaded(subMenuIndex)).find(e => condition(e.getAttribute('title')));
    }

    function currentDialogElement() {
        return document.querySelector('.ant-modal-root div.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content');
    }

    // addr is an array with [street, long, unit, room]
    async function addApartment(addr, isResidentAddr, isPermanentAddr, isOwner) {
        let peopleAddButton = document.querySelector('.people-add');
        console.assert(peopleAddButton, 'people-add button not found');

        peopleAddButton.click();
        // wait until the dialog shows up
        await delay(1000);

        const dialog = currentDialogElement();
        // show the committe sub menu
        dialog.querySelector('.ant-modal-body span.cascader').click();
        let [committeeButton] = await waitUntilSubMenuHasLoaded(0);
        // show the community submenu
        committeeButton.click();

        let communityButton = await findMenuItem(1, title => title === LONG_COMMUNITY_DICT[addr[1]]);
        // show the street submenu
        communityButton.click();

        let streetButton = await findMenuItem(2, title => title === addr[0]);
        // show the long submenu
        streetButton.click();

        let longButton = await findMenuItem(3, title => title.substring(0, title.length - 1) === addr[1]);
        // show the unit menu
        longButton.click();

        let unitButton = await findMenuItem(4, title => title.substring(0, title.length - 2) === addr[2]);
        // show the room submenu
        unitButton.click();

        let roomButton = await findMenuItem(5, title => title === addr[3]);
        // select the room
        roomButton.click();
        await delay(500);

        const apartmentStates = [isResidentAddr, isPermanentAddr, isOwner];
        const optionRows = dialog.querySelectorAll('.ant-modal-body form > div');
        for (let i = 0; i < optionRows.length; ++i) {
            const option = optionRows[i].querySelectorAll('div:last-child label.ant-radio-wrapper')[apartmentStates[i] ? 0 : 1];
            option.click();
            await delay(500);
        }

        dialog.querySelector('.ant-modal-footer button:last-child').click();
        await delay(1000);
    }

    function isCollectiveAddress(addr) {
        return Object.keys(COLLECTIVE_ADDRESSES).some(e => addr.startsWith(e));
    }

    function parseAddress(addr) {
        const RE_ADDR = /^(.+?)(\d+)弄(\d+)号(\d+)室$/;
        const result = RE_ADDR.exec(addr);
        if (result) {
            result.shift();
        }
        return result;
    }

    function currentVisibleTab() {
        return document.querySelector('.main > div > div > div > div:not(.ant-tabs):not([style*="display: none"])');
    }

    async function processUser(row) {
        const isShanghainese = row.querySelector('td:nth-child(5) > span > span').innerText.startsWith('上海市');
        const residentAddrStr = row.querySelector('td:nth-child(4) > span > span:last-child').innerText;
        const permanentAddrStr = row.querySelector('td:nth-child(5) > span > span:last-child').innerText;

        let [importButton, reportButton] = row.querySelectorAll('button');

        const residentAddr = parseAddress(residentAddrStr);
        const permanentAddr = parseAddress(permanentAddrStr);

        const isCollectiveResidentAddr = isCollectiveAddress(residentAddrStr);
        const isCollectivePermanentAddr = isCollectiveAddress(permanentAddrStr);

        const isLocalResidentAddr = residentAddr !== null && isLocalCommunityAddr(residentAddr);
        const isLocalPermanentAddr = permanentAddr !== null && isLocalCommunityAddr(permanentAddr);

        const realName = row.querySelector('td:nth-child(3) .realname').innerText;

        if (!isLocalResidentAddr && !isLocalPermanentAddr &&
            !isCollectiveResidentAddr && !isCollectivePermanentAddr) {
            console.log(`*** ${realName} moved away`);

            // report that the user has moved away
            reportButton.click();
            await delay(1000);

            const dialog = currentDialogElement();
            // click the moved away button
            dialog.querySelector('.ant-modal-body label').click();
            await delay(500);
            // click ok
            dialog.querySelector('.ant-modal-footer button:last-child').click();
            //document.querySelector('.ant-modal-footer button').click();
            return;
        }

        if (isCollectiveResidentAddr || isCollectivePermanentAddr) {
            row.querySelector('input[type=checkbox]').click();
            await delay(100);
            currentVisibleTab().querySelector('.table-page-search-wrapper button:last-child').click();
            await delay(500);

            const dialog = currentDialogElement();
            const collectiveAddr = isCollectiveResidentAddr ? residentAddrStr : permanentAddrStr;
            const longAddr = Object.keys(COLLECTIVE_ADDRESSES).find(k => collectiveAddr.startsWith(k));
            const path = COLLECTIVE_ADDRESSES[longAddr].split('/');
            path.push(longAddr)

            dialog.querySelector('.ant-cascader-picker').click();
            for (let i = 0; i < path.length; ++i) {
                const item = await findMenuItem(i, e => e === path[i]);
                item.click();
                await delay(100);
            }
            await waitUntilRequestDone(() => {
                dialog.querySelector('.btn-box button:last-child').click();
            });
        } else {
            importButton.click();
            await waitUntilPersonInfoHasLoaded()
            console.assert(isLocalResidentAddr || isLocalPermanentAddr, 'at least one address must be local');

            if (residentAddrStr === permanentAddrStr) {
                console.assert(isLocalResidentAddr && isLocalPermanentAddr);
                await addApartment(residentAddr, true, true, true);
            } else {
                if (isLocalResidentAddr) {
                    await addApartment(residentAddr, true, false, isShanghainese);
                }

                if (isLocalPermanentAddr) {
                    await addApartment(permanentAddr, false, true, isShanghainese);
                }
            }

            // save the info
            await waitUntilRequestDone(() =>  {
                document.querySelector('.peopleInfo .row-btn.ant-row button:last-child').click();
            });
        }

        await delay(100);
        // wait until loading has completed
        await waitUntilSpinningHasFinished(currentVisibleTab(), '.ant-spin-container');

        console.log(`*** finish importing ${realName} at ${residentAddrStr}`);
    }

    async function importNextUser() {
        let firstUserRow = currentVisibleTab().querySelector('.ant-table-scroll tbody tr');
        if (firstUserRow) {
            try {
                await processUser(firstUserRow);
                await delay(1000);
                if (!g_stop) {
                    importNextUser();
                } else {
                    g_stop = false;
                }
            } catch (e){
                console.log(e);
                g_stop = false;
            }
        } else {
            alert('finish importing');
        }
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === '1' && event.altKey) {
            importNextUser();
        }
        if (event.key === '2' && event.altKey) {
            console.log('trying to stop the importing');
            g_stop = true;
        }
    });
})();