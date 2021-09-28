// ==UserScript==
// @name         Actual Population - Change Stats
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Fix Query Error
// @author       ashen
// @match        http://10.81.66.173/sh_syrk_gov/pages/report/reportAction.do?method=report_jcw_new*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    window.addEventListener('load', () => {
        document.querySelector("[name=jdmc]").setAttribute("id", "jdmc");
    });
})();

