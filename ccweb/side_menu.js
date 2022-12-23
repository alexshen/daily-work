// ==UserScript==
// @name         Side Menu
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add entries for old pages
// @author       ashen
// @match        https://sqy.mzj.sh.gov.cn/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    function addMenu(text, path) {
        const proto = document.querySelector('aside ul[role=menu] li:first-child');
        const newMenu = proto.cloneNode(true);
        proto.parentNode.appendChild(newMenu);
        newMenu.querySelector('a').href = path;
        newMenu.querySelector('span').innerText = text;
        const icon = newMenu.querySelector('svg');
        icon.parentNode.removeChild(icon);
    }

    window.addEventListener("load", () => {
        addMenu('人房管理（旧）', '/communityorg/CommunityOrgList');
        addMenu('社区人口', '/person/PersonInfoList');
    });
})();