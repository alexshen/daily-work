// ==UserScript==
// @name         Intercept Login Data
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Intercept login requests so that we can save X-Access-Token for later use
// @author       ashen
// @match        http://sqy.mzj.sh.gov.cn/user/login*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/community-cloud/common.js
// @grant        none
// ==/UserScript==

/* global cc */

(function () {
    'use strict';

    async function waitForCaLoginFinishes() {
        const waiter = new cc.RequestWaiter(request => {
            return /.+\/community-cloud\/sys\/caLogin$/.test(request.responseURL);
        });
        const result = JSON.parse((await waiter).response).result;
        window.localStorage.setItem("__X-Access-Token", result.token);
        console.log("X-Access-Token", result.token);
    }

    window.onload = () => {
        waitForCaLoginFinishes();
    };
})();