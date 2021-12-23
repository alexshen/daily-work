// ==UserScript==
// @name         Update Form Users
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Update user records with data from a file
// @author       ashen
// @match        http://sqy.mzj.sh.gov.cn/datacollector/modules/FormManager2*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global cc */
/* global GM_registerMenuCommand */

(function () {
    "use strict";

    let g_stop = false;

    async function waitUntilSpinningHasFinished(parent, elementSelector) {
        const spinner = parent.querySelector(elementSelector);
        while (spinner.getAttribute("class").includes("ant-spin-blur")) {
            await cc.delay(200);
        }
    }

    function updateTextValue(element, value) {
        element.value = value;
        // force update, otherwise vue won't pick up the change
        element.dispatchEvent(new Event("input"));
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
            await cc.delay(curDelay);
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
            throw new Error(`sub menu ${i} not found`);
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
            await cc.delay(500);
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
                const resp = await cc.waitUntilRequestDone(() => {
                    rows[0].querySelector("td:last-child a:first-child").click();
                });

                // wait until the dialog is open
                await cc.delay(500);

                if (resp.status === 200) {
                    await this._fillForm(user);
                } else {
                    throw new Error(resp);
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
                                await cc.delay(500);
                                this._getDropdownItem(firstItem).click();
                            } else {
                                inputParentUI.querySelector("input").click();
                                await cc.delay(500);
                                await this._selectCascaderMenuItems(user, config.field);
                            }
                            await cc.delay(200);
                        }
                    } else {
                        if (user[config.field]) {
                            const input = inputParentUI.querySelector("input");
                            if (config.isDate) {
                                // show the calender ui
                                input.click();
                                await cc.delay(500);
                                // input the date
                                const dateInput = document.querySelector(
                                    ".ant-calendar-panel input"
                                );
                                updateTextValue(dateInput, user[config.field]);
                                await cc.delay(500);
                                simulateTyping(dateInput, [{ key: "Enter", keyCode: 13 }]);
                            } else {
                                updateTextValue(input, user[config.field]);
                            }
                            await cc.delay(200);
                        }
                    }
                }
                ++moduleIndex;
            }

            await cc.waitUntilRequestDone(() => {
                dialog.querySelector(".ant-modal-footer button:last-child").click();
            });
            await cc.delay(500);
        }

        async filterUsers(criteria) {
            if (criteria.idNumber) {
                updateTextValue(this._idInput, criteria.idNumber || "");
            }

            if (typeof criteria.isComplete === "boolean") {
                await this._isCompleteDropdown.click();
                await cc.delay(500);
                this._getDropdownItem(criteria.isComplete ? "是" : "否").click();
                await cc.delay(500);
            }

            await cc.waitUntilRequestDone(() => this._searchButton.click());
            await this._waitUntilSpinningHasFinished();
        }

        getUserRows() {
            return this._tableUI.querySelectorAll(".ant-table-body tr");
        }

        async deleteUser(row) {
            row.querySelector('td:last-child a:last-child').click();
            await cc.delay(500);
            const dialog = currentDialogElement();
            await cc.waitUntilRequestDone(() => dialog.querySelector("button:last-child").click());
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
            await cc.delay(100);
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
            await cc.delay(500);
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
                const listRequestWaiter = new cc.RequestWaiter(request => {
                    return /https?.+\/list\?.+/.test(request.responseURL);
                });
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
                await cc.delay(500);
            }
        } finally {
            console.log("deleting stopped");
        }
    }

    window.addEventListener("load", () => {
        GM_registerMenuCommand("Update Users", () => {
            updateUsers();
        });
        GM_registerMenuCommand("Delete Incomplete Users", () => {
            deleteIncompleteUsers();
        });
        GM_registerMenuCommand("Stop Operations", () => {
            g_stop = true;
        });
    });
})();
