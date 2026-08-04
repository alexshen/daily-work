// ==UserScript==
// @name         自动更新联系方式 (基于备注中的phone)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  当对话框显示时，若备注字段包含 "电话:12345" 或 "phone:12345"，则自动将联系方式字段修改为该号码
// @author       You
// @match        https://jczl.sh.cegn.cn/web/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 可选：限定哈希路径（如需精确控制可取消注释）
    if (!location.hash.includes('/resident/sqHouseInfo/index')) return;

    // 避免重复处理同一个联系方式元素
    const processedSet = new WeakSet();

    // 从备注文本中提取 phone: 后的数字
    function extractPhoneFromRemark(remarkText) {
        if (!remarkText) return null;
        const match = remarkText.match(/(?:电话|phone)\s*[:：]\s*(\d+)/i);
        return match ? match[1] : null;
    }

    // 更新指定 dialog 中的联系方式字段
    function updateContactInDialog(dialogEl) {
        if (!dialogEl || !dialogEl.isConnected) return false;

        // 查找备注字段和联系方式字段
        const allColumnInfo = dialogEl.querySelectorAll('.column-info');
        let remarkColumn = null;
        let contactColumn = null;

        for (const col of allColumnInfo) {
            const titleSpan = col.querySelector('.title');
            if (!titleSpan) continue;
            const titleText = titleSpan.innerText.trim();
            if (titleText.includes('备注：')) {
                remarkColumn = col;
            } else if (titleText.includes('联系方式：')) {
                contactColumn = col;
            }
            if (remarkColumn && contactColumn) break;
        }

        if (!remarkColumn || !contactColumn) return false;

        // 获取备注内容
        const remarkDetail = remarkColumn.querySelector('.detail');
        if (!remarkDetail) return false;
        const remarkText = remarkDetail.innerText.trim();
        const phoneNumber = extractPhoneFromRemark(remarkText);
        if (!phoneNumber) return false;

        // 获取联系方式展示元素（通常是 .title 内的 span 或文本节点）
        let contactSpan = contactColumn.querySelector('.title span');
        if (!contactSpan) {
            const titleEl = contactColumn.querySelector('.title');
            if (titleEl) {
                const children = titleEl.childNodes;
                for (let node of children) {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && node.textContent.trim() !== '联系方式：') {
                        contactSpan = node;
                        break;
                    } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') {
                        contactSpan = node;
                        break;
                    }
                }
            }
        }
        if (!contactSpan) return false;

        // 避免重复更新相同的号码
        if (processedSet.has(contactSpan) && contactSpan.innerText === phoneNumber) return false;

        const oldNumber = contactSpan.innerText;
        if (oldNumber !== phoneNumber) {
            contactSpan.innerText = phoneNumber;
            processedSet.add(contactSpan);
            console.log(`[脚本] 已更新联系方式：${oldNumber} → ${phoneNumber} (来自备注)`);
            return true;
        }
        return false;
    }

    // 扫描所有可见的对话框
    function processVisibleDialogs() {
        const allDialogs = document.querySelectorAll('div[role="dialog"].el-dialog');
        let updated = false;
        allDialogs.forEach(dialog => {
            const wrapper = dialog.closest('.el-dialog__wrapper');
            const isVisible = wrapper ? (window.getComputedStyle(wrapper).display !== 'none') : true;
            if (isVisible) {
                if (updateContactInDialog(dialog)) updated = true;
            }
        });
        return updated;
    }

    // 防抖处理
    let debounceTimer = null;
    function onDomChange() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            processVisibleDialogs();
        }, 300);
    }

    // 启动 MutationObserver
    function startObserver() {
        const observer = new MutationObserver((mutationsList) => {
            let shouldCheck = false;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    shouldCheck = true;
                    break;
                }
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const target = mutation.target;
                    if (target.classList && target.classList.contains('el-dialog__wrapper')) {
                        shouldCheck = true;
                        break;
                    }
                }
            }
            if (shouldCheck) onDomChange();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });

        // 页面加载完成后立即尝试一次
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(processVisibleDialogs, 500));
        } else {
            setTimeout(processVisibleDialogs, 500);
        }
    }

    startObserver();
})();