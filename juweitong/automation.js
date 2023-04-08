'use strict';

// ==UserScript==
// @name    Like Posts
// @author  ashen
// @version 0.12
// @grant   GM_registerMenuCommand
// @match https://www.juweitong.cn/*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/ccweb2/common.js
// ==/UserScript==

/* global GM_registerMenuCommand, cc */

function delay(time) {
    return new Promise(resolve => {
        setTimeout(resolve, time);
    });
}

function waitUntilCondition(cond) {
    return new Promise(resolve => {
        // repeatedly checking the condition
        let timer = setInterval(() => {
            if (cond()) {
                resolve();
                clearInterval(timer);
            }
        }, 100);
    })
}

async function waitUntilLoadingFinishes() {
    await waitUntilCondition(() => !unsafeWindow.g_isLoading);
    return await delay(500);
}

async function waitUntilPageAttached() {
    await waitUntilCondition(() => unsafeWindow.g_attached);
    return await delay(500);
}

async function likePost(post, favText) {
    // check if this is a new post
    if (post.querySelector('span.ui-1-tag.mi-q-new')) {
        // show the post
        post.click();
        await waitUntilLoadingFinishes();
        // check if already liked
        let likeButton = document.querySelector('div.mi-reply-panel > a');
        if (likeButton.querySelector('span#cmdLike').innerText === favText) {
            likeButton.click();
            await delay(500);
        }
        document.querySelector('a.mi-line-body').click();
        await waitUntilLoadingFinishes();
    }
}

const POST_ARTICLE_CONFIG = {
    klass: 'div.list-group-item.ui-1-article > a',
    favText: '点赞'
};

const POST_SUBJECT_CONFIG = {
    klass: 'div.list-group-item.ui-1-advice > a',
    favText: '赞成'
};

async function likeAllPosts(postConfig) {
    // find all posts
    let posts = document.querySelectorAll(postConfig.klass);
    for (let post of posts) {
        await likePost(post, postConfig.favText);
    }
}

async function back() {
    unsafeWindow.g_attached = false;
    document.querySelector('a.back').click();
    await waitUntilLoadingFinishes();
}

async function visitNotices() {
    console.log('visit notices');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-notice');
    button.click();
    await waitUntilLoadingFinishes();
    document.querySelector('span.ui-1-sub-header-more').click();
    await new cc.RequestWaiter(r => /notice_list_more/.test(r.responseURL));
    await likeAllPosts(POST_ARTICLE_CONFIG);
    await back();
    return await back();
}

async function visitMyNeighbors() {
    console.log('visit my neighbors');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-around');
    button.click();
    await new cc.RequestWaiter(r => /around_help_list_more/.test(r.responseURL));
    await likeAllPosts(POST_ARTICLE_CONFIG);
    return await back();
}

async function visitPartyArea() {
    console.log('visit party area');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-ccp');
    button.click();
    await waitUntilLoadingFinishes();
    document.querySelector('span.ui-1-sub-header-more').click();
    await new cc.RequestWaiter(r => /ccp_list_more/.test(r.responseURL));
    await likeAllPosts(POST_ARTICLE_CONFIG);
    await back();
    return await back();
}

async function visitAutonomyBoard() {
    console.log('visit autonomy board');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-advice');
    button.click();
    await new cc.RequestWaiter(r => /proposal_list_more/.test(r.responseURL));
    await likeAllPosts(POST_SUBJECT_CONFIG);
    await back();
}

async function likeAll() {
    await visitNotices();
    await waitUntilPageAttached();
    await visitMyNeighbors();
    await waitUntilPageAttached();
    await visitPartyArea();
    await waitUntilPageAttached();
    await visitAutonomyBoard();
    await waitUntilPageAttached();
}

const KEY_COMMUNITIES = "communities";

function getUnvisitedCommunities() {
    return sessionStorage.getItem(KEY_COMMUNITIES)
            ?.split(';')
            .map(e => parseInt(e, 10));
}

function setUnvisitedCommunities(communities) {
    sessionStorage.setItem(KEY_COMMUNITIES, communities.join(';'));
}

function removeUnvisitedCommunities() {
    sessionStorage.removeItem(KEY_COMMUNITIES);
}

async function tryContinueAutoVisit() {
    await new cc.RequestWaiter(r => /communities/.test(r.responseURL));

    let communites = getUnvisitedCommunities();
    if (communites?.length) {
        await likeAll();
        return await tryVisitNextCommunity();
    }
    return false;
}

async function tryVisitNextCommunity() {
    let visible = false;
    let communities = getUnvisitedCommunities();
    if (communities === undefined) {
        visible = true;
        await showCommunityPanel();
        communities = getCommunitiesFromPanel();
        console.log("unvisited communities:" + communities.length);
        if (communities.length === 1) {
            dismissCommunityPanel(false);
            return false;
        }
    }
    communities.shift();
    if (communities.length === 0) {
        removeUnvisitedCommunities();
        return false;
    }
    if (!visible) {
        await showCommunityPanel();
    }
    selectCommunity(communities[0]);
    dismissCommunityPanel(true);
    setUnvisitedCommunities(communities);
    return true;
}

function getCommunitiesFromPanel() {
    const communities = [];
    const radioButtons = document.querySelectorAll('.sqt-lib-roles-content .van-radio');
    radioButtons.forEach((button, i) => {
        const checked = button.getAttribute('aria-checked') === "true";
        if (checked) {
            communities.unshift(i);
        } else {
            communities.push(i);
        }
    });
    return communities;
}

async function showCommunityPanel() {
    let button;
    do {
        button = document.querySelector('.ui-1-ct-header-index');
        await delay(100);
    } while (!button);

    let panel;
    do {
        button.click();
        await delay(100);
        panel = document.querySelector('.sqt-lib-roles-content');
    } while (!panel);
    await delay(800);
}

function dismissCommunityPanel(ok) {
    document.querySelector(`.sqt-lib-roles-foot div:nth-child(${ok + 1})`).click();
}

function selectCommunity(index) {
    document.querySelectorAll('.sqt-lib-roles-content .van-radio')[index].click();
}


window.addEventListener('load', () => {
    if (!unsafeWindow.g_isPatched) {
        var script = unsafeWindow.document.createElement('script');
        script.type = 'text/javascript';
        script.innerText = "\
			let orgOnAttached = mi.page.onAttached;\
			mi.page.onAttached = function () {\
                g_attached = true;\
                return orgOnAttached.apply(mi.page, arguments);\
    		};\
            let orgLoadingToast = mi.loadingToast;\
            mi.loadingToast = function () {\
                g_isLoading = true;\
                let t = orgLoadingToast.apply(mi, arguments);\
                let orgHide = t.hide;\
                t.hide = function () {\
                    g_isLoading = false;\
                    return orgHide.apply(t, arguments);\
                };\
                return t;\
            };";
        unsafeWindow.document.getElementsByTagName('head')[0].appendChild(script);
        unsafeWindow.g_isPatched = true;
    }

    tryContinueAutoVisit().then(hasMore => {
        if (!hasMore) {
            alert('Finished');
        }
    });

    GM_registerMenuCommand("Like All Communities", async () => {
        await likeAll();
        if (!await tryVisitNextCommunity()) {
            alert('Finished');
        }
    });

    GM_registerMenuCommand("Like All", () => {
        likeAll()
            .then(() => alert('Finished'));
    });

    GM_registerMenuCommand("Like Notices", () => {
        visitNotices()
            .then(() => waitUntilPageAttached())
            .then(() => alert('Finished'));
    });

    GM_registerMenuCommand("Like My Neighbors", () => {
        visitMyNeighbors()
            .then(() => waitUntilPageAttached())
            .then(() => alert('Finished'));
    });

    GM_registerMenuCommand("Like Party Area", () => {
        visitPartyArea()
            .then(() => waitUntilPageAttached())
            .then(() => alert('Finished'));
    });

    GM_registerMenuCommand("Like Autonomy Board", () => {
        visitAutonomyBoard()
            .then(() => waitUntilPageAttached())
            .then(() => alert('Finished'));
    });
});

