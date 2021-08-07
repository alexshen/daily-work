// ==UserScript==
// @name         Remove Collective Users
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Remove Collective Users
// @author       ashen
// @match        http://10.87.105.104/communityorg/CommunityOrgList
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/utils.js
// @grant        none
// ==/UserScript==

/* global cc, ccu */

(function () {
    "use strict";

    let g_running = false;

    // wait until the next request is finished
    function currentVisibleTab() {
        return document.querySelector(
            'div.personnel-detail'
        );
    }

    const REMOVE_COLLECTIVE_USER_URL = new URL(
        "/community-cloud/temporaryaddress/temporaryAddress/remove",
        window.document.location
    );

    async function removeUser(id) {
        await ccu.postJson(REMOVE_COLLECTIVE_USER_URL, {temporaryPersonId: id});
    }

    async function removeCurrentPageUsers() {
        for (let row of currentVisibleTab().querySelectorAll('div.ant-table-scroll tbody tr')) {
            const name = row.querySelector('td span.realname').innerText;
            const address = row.querySelector('td:nth-child(3) > span span:last-child').innerText;
            console.log(`removing ${name} at ${address}`);
            await removeUser(row.getAttribute('data-row-key'));
            await cc.delay(100);
            if (!g_running) {
                break;
            }
        }
        alert("*** finished");
    }

    const SHORTCUT_MANAGER = new cc.ShortcutManager();

    window.addEventListener('load', () => {
        SHORTCUT_MANAGER.register(cc.SHORTCUT.Alt, 'or', () => {
            if (!g_running && confirm("remove current page users?")) {
                g_running = true;
                removeCurrentPageUsers();
            } else if (g_running) {
                g_running = false;
            }
        });
    });

    document.addEventListener("keydown", e => SHORTCUT_MANAGER.onKeyDown(e));
    document.addEventListener("keyup", e => SHORTCUT_MANAGER.onKeyUp(e));
})();
