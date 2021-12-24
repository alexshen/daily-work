// ==UserScript==
// @name         Disable anti-copy-paste restrictions
// @namespace    http://tampermonkey.net/
// @version      0.1
// @author       ashen
// @match        http://10.247.66.219:8080/bstz/frame.do
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* global GM_registerMenuCommand */

(function() {
    'use strict';

    function disableAntiCopyPaste(curWindow) {
        if (!curWindow || !curWindow.$) { return; }
        curWindow.$(curWindow.document).off('keydown');
        curWindow.$(curWindow.document).off('contextmenu');
        curWindow.$(curWindow.document).off('selectstart');
        for (let frame of curWindow.document.querySelectorAll('iframe')) {
            disableAntiCopyPaste(frame.contentWindow);
        }
    }

    GM_registerMenuCommand("Run", () => {
        disableAntiCopyPaste(unsafeWindow);
    });
})();