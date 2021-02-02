// ==UserScript==
// @name         Update Form Users
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       ashen
// @match        http://10.87.105.104/datacollector/modules/FormManager2*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    let g_stop = false;

    function delay(duration) {
        return new Promise((resolved) => {
            setTimeout(resolved, duration);
        });
    }

    async function waitUntilSpinningHasFinished(parent, elementSelector) {
        const spinner = parent.querySelector(elementSelector);
        while (spinner.getAttribute("class").includes("ant-spin-blur")) {
            await delay(200);
        }
    }

    function updateTextValue(element, value) {
        element.value = value;
        // force update, otherwise vue won't pick up the change
        element.dispatchEvent(new Event("input"));
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

    function currentDialogElement() {
        return document.querySelector(
            '.ant-modal-root div.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content'
        );
    }

    async function waitUntilElementIsFound(
        elementSelector,
        root = document,
        retryCount = 20,
        initialDelay = 500,
        maxDelay = 2000
    ) {
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

    // wait until the submenu is loaded and return all the menu items
    async function waitUntilSubMenuHasLoaded(i) {
        let subMenu = await waitUntilElementIsFound(
            `.ant-cascader-menus:not([style*="display: none"]) ul:nth-child(${i + 1})`
        );
        if (!subMenu) {
            throw new Erorr(`sub menu ${i} not found`);
        }
        return Array.from(subMenu.querySelectorAll("li"));
    }

    async function findMenuItem(subMenuIndex, condition) {
        return (await waitUntilSubMenuHasLoaded(subMenuIndex)).find((e) =>
            condition(e.getAttribute("title"))
        );
    }

    const FORM_FIELDS = [
        [
            { field: "username" },
            { field: "idNumber" },
            { field: "residentAddress" },
            { field: ["populationType"] },
            { field: "phone" },
            { field: ["industry"] },
            { field: ["vaccineInjected"] },
            { field: "lastArrival", isDate: true },
            { field: ["sourceProvince", "sourceCity", "sourceDistrict"] },
            { field: "landOwner" },
            { field: "landOwnerPhone" },
            { field: ["comment"] },
        ],
        [
            { field: ["leave"] },
            { field: "leaveDate", isDate: true },
            { field: ["destProvince", "destCity", "destDistrict"] },
        ],
        [
            { field: ["hasVisitors"] },
            { field: "numVisitors" },
            { field: ["visitorProvince", "visitorCity", "visitorDistrict"] },
            { field: "visitDate", isDate: true },
        ],
        [{ field: ["signed"] }],
    ];

    function simulateTyping(source, text) {
        for (let key of text) {
            if (typeof key === "string") {
                const v = key.codePointAt(0);
                source.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        bubbles: true,
                        cancelable: true,
                        key: key,
                        keyCode: v,
                        charCode: v,
                    })
                );
            } else {
                source.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        bubbles: true,
                        cancelable: true,
                        key: key.key,
                        keyCode: key.keyCode,
                        charCode: key.charCode,
                    })
                );
            }
        }
    }

    class FormUpdator {
        constructor() {
            const pageUI = document.querySelector("#fillingRecord");
            this._idInput = pageUI.querySelector(".other-search > form > .ant-row:first-child > div:nth-child(2) input");
            this._isCompleteDropdown = pageUI.querySelector(
                ".other-search > form > .ant-row:last-child div[role=combobox]"
            );
            this._searchButton = pageUI.querySelector(".other-search > form > .ant-row:last-child button:nth-child(2)");
            this._resetButton = pageUI.querySelector(".other-search > form > .ant-row:last-child button:nth-child(1)");
            this._addButton = pageUI.querySelector("div.five button:first-child");
            this._tableUI = pageUI.querySelector("div.six");
        }

        async clearSearchFields() {
            this._resetButton.click();
        }

        async addUser(user) {
            this._addButton.click();
            await delay(500);
            await this._fillForm(user);
        }

        async updateUser(user) {
            this.clearSearchFields();
            await this.filterUsers({ idNumber: user.idNumber });
            const rows = Array.from(this.getUserRows());
            if (rows.length === 0) {
                await this.addUser(user);
            } else {
                if (rows.length > 1) {
                    throw new Error(`duplidate user ${user}`);
                }
                // start editing
                const resultEvent = await waitUntilRequestDone(() => {
                    rows[0].querySelector("td:last-child a:first-child").click();
                });

                // wait until the dialog is open
                await delay(500);

                if (resultEvent.target.status === 200) {
                    await this._fillForm(user);
                } else {
                    throw new Error(resultEvent);
                }
            }
        }

        async _fillForm(user) {
            const dialog = currentDialogElement();
            let moduleIndex = 0;
            for (let fmodule of dialog.querySelectorAll(".fModule")) {
                for (let i = 0; i < FORM_FIELDS[moduleIndex].length; ++i) {
                    const inputParentUI = fmodule.querySelector(
                        `.sonModule .ant-row.ant-form-item:nth-child(${i + 1})`
                    );
                    const config = FORM_FIELDS[moduleIndex][i];
                    // menu config
                    if (config.field instanceof Array) {
                        const firstItem = user[config.field[0]];
                        if (firstItem) {
                            // show the cascader menu or drop down menu
                            if (config.field.length === 1) {
                                inputParentUI.querySelector("div[role=combobox]").click();
                                await delay(500);
                                this._getDropdownItem(firstItem).click();
                            } else {
                                inputParentUI.querySelector("input").click();
                                await delay(500);
                                await this._selectCascaderMenuItems(user, config.field);
                            }
                            await delay(200);
                        }
                    } else {
                        if (user[config.field]) {
                            const input = inputParentUI.querySelector("input");
                            if (config.isDate) {
                                // show the calender ui
                                input.click();
                                await delay(500);
                                // input the date
                                const dateInput = document.querySelector(
                                    ".ant-calendar-panel input"
                                );
                                updateTextValue(dateInput, user[config.field]);
                                await delay(500);
                                simulateTyping(dateInput, [{ key: "Enter", keyCode: 13 }]);
                            } else {
                                updateTextValue(input, user[config.field]);
                            }
                            await delay(200);
                        }
                    }
                }
                ++moduleIndex;
            }

            await waitUntilRequestDone(() => {
                dialog.querySelector(".ant-modal-footer button:last-child").click();
            });
            await delay(500);
        }

        async filterUsers(criteria) {
            if (criteria.idNumber) {
                updateTextValue(this._idInput, criteria.idNumber || "");
            }

            if (typeof criteria.isComplete === "boolean") {
                await this._isCompleteDropdown.click();
                await delay(500);
                this._getDropdownItem(criteria.isComplete ? "是" : "否").click();
                await delay(500);
            }

            await waitUntilRequestDone(() => this._searchButton.click());
            await this._waitUntilSpinningHasFinished();
        }

        getUserRows() {
            return this._tableUI.querySelectorAll(".ant-table-body tr");
        }

        async deleteUser(row) {
            row.querySelector('td:last-child a:last-child').click();
            await delay(500);
            const dialog = currentDialogElement();
            await waitUntilRequestDone(() => dialog.querySelector("button:last-child").click());
        }

        _getDropdownItem(text) {
            const dropdownItems = document.querySelectorAll(
                '.ant-select-dropdown:not([style*="display: none"]) li'
            );
            for (let i = 0; i < dropdownItems.length; ++i) {
                if (dropdownItems[i].innerText === text) {
                    return dropdownItems[i];
                }
            }
            return null;
        }

        async _selectCascaderMenuItems(obj, fields) {
            for (let i = 0; i < fields.length; ++i) {
                const item = await findMenuItem(i, (e) => e === obj[fields[i]]);
                item.click();
            }
        }

        async _waitUntilSpinningHasFinished() {
            await delay(100);
            await waitUntilSpinningHasFinished(this._tableUI, ".ant-spin-container");
        }
    }

    function objectFromKeyValueArrays(keys, values) {
        const o = {};
        keys.forEach((e, i) => {
            o[e] = values[i];
        });
        return o;
    }

    async function readFile(blobOrFile, encoding = "utf-8") {
        return new Promise((resolve, reject) => {
            let reader = new FileReader();
            reader.readAsText(blobOrFile, encoding);
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            reader.onerror = reject;
        });
    }

    // the first line must contain the field names
    async function readUserRecords(filename) {
        const data = await readFile(filename);
        const [columnLine, ...recordLines] = data.split("\n");
        const columnNames = columnLine.split("\t");
        const users = [];
        for (let line of recordLines) {
            const user = objectFromKeyValueArrays(columnNames, line.split("\t"));
            users.push(user);
        }
        return users;
    }

    async function updateUsersWithFile(filename) {
        const formUpdator = new FormUpdator();
        const users = await readUserRecords(filename);
        for (let i = 0; i < users.length; ++i) {
            const user = users[i];
            if (await formUpdator.updateUser(user)) {
                console.log(
                    `[${i + 1}/${users.length}] updated ${user.username} with id ${user.idNumber}`
                );
            }
            await delay(500);
            if (g_stop) {
                break;
            }
        }
    }

    async function updateUsers() {
        const input = document.createElement("input");
        input.type = "file";
        input.onchange = (e) => {
            updateUsersWithFile(e.target.files[0])
                .then(() => "finished update")
                .finally(() => {
                    g_stop = false;
                });
        };
        input.click();
    }

    async function deleteIncompleteUsers() {
        const formUpdator = new FormUpdator();
        await formUpdator.filterUsers({ isComplete: false });

        try {
            let rows = formUpdator.getUserRows();
            while (rows.length && !g_stop) {
                const userRow = rows[0];
                const listRequestWaiter = new RequestWaiter(/https?.+\/list\?.+/);
                try {
                    await formUpdator.deleteUser(userRow);

                    const username = userRow.querySelector("td:nth-child(4)").innerText;
                    const idNumber = userRow.querySelector("td:nth-child(5)").innerText;
                    console.log(`deleted user ${username} with ${idNumber}`);

                    await listRequestWaiter.wait();
                } finally {
                    listRequestWaiter.dispose();
                }
                rows = formUpdator.getUserRows();
                await delay(500);
            }
        } finally {
            console.log("deleting stopped");
        }
    }

    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "1") {
            updateUsers();
        }
        if (e.altKey && e.key === "2") {
            g_stop = true;
            console.log("stop updating");
        }
        if (e.altKey && e.key === "3") {
            deleteIncompleteUsers();
        }
        if (e.altKey && e.key === "4") {
            g_stop = true;
            console.log("stop deleting");
        }
    });
})();
