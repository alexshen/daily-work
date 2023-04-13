'use strict';

// ==UserScript==
// @name    Like Posts
// @author  ashen
// @version 0.19
// @grant   GM_registerMenuCommand
// @match https://www.juweitong.cn/*
// @require      https://raw.githubusercontent.com/alexshen/daily-work/main/ccweb2/common.js
// ==/UserScript==

/* global GM_registerMenuCommand, cc */

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
    return await cc.delay(500);
}

async function waitUntilPageAttached() {
    await waitUntilCondition(() => unsafeWindow.g_attached);
    return await cc.delay(500);
}

async function likePost(post, favText) {
    // show the post
    post.click();
    await waitUntilLoadingFinishes();
    // check if already liked
    let likeButton = document.querySelector("div.mi-reply-panel > a");
    if (likeButton.querySelector("span#cmdLike").innerText === favText) {
        likeButton.click();
        await new cc.RequestWaiter((r) => /title_like/.test(r.responseURL));
    }
    document.querySelector("a.mi-line-body").click();
    await waitUntilLoadingFinishes();
}

const POST_ARTICLE_CONFIG = {
    getPosts() {
        return document.querySelectorAll('div.list-group-item.ui-1-article > a');
    },
    favText: '点赞',
    async filter(post) {
        // only visit new posts
        return post.querySelector('span.ui-1-tag.mi-q-new') !== null;
    }
};

function createPostSubjectConfig(newPostOnly) {
    return {
        getPosts() {
            return document.querySelector('.navbar_list').querySelectorAll('div.list-group-item.ui-1-advice > a');
        },
        favText: '赞成',
        async filter(post) {
            if (newPostOnly) {
                return post.querySelector('span.ui-1-tag.mi-q-new');
            }
            if (post.querySelector('.ui-1-tag-unproposal')?.innerText !== '项目') {
                return false;
            }
            const url = window.location.origin + /'([^']+)'/.exec(post.getAttribute('href'))[1];
            const resp = await cc.doRequest(url, 'GET');
            const parser = new DOMParser();
            const doc = parser.parseFromString(resp, 'text/html');
            const likeButton = doc.querySelector("div.mi-reply-panel > a");
            return likeButton.querySelector("span#cmdLike").innerText === this.favText;
        }
    };
}

async function likeAllPosts(postConfig) {
    const posts = postConfig.getPosts();
    const results = await Promise.all(posts.map(p => postConfig.filter(p)));
    for (let i = 0; i < results.length; ++i) {
        if (results[i]) {
            await likePost(posts[i], postConfig.favText);
        }
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

async function visitDiscussionBoard(newPostsOnly) {
    console.log('visit discussion board');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-advice');
    button.click();
    await new cc.RequestWaiter(r => /proposal_list_more/.test(r.responseURL));
    // make sure the subjects tab is visible
    document.querySelector('div#slide-advice').click();
    await cc.delay(100);
    await likeAllPosts(createPostSubjectConfig(newPostsOnly));
    await back();
}

async function likeAll(newPostsOnly) {
    await visitNotices();
    await waitUntilPageAttached();
    await visitMyNeighbors();
    await waitUntilPageAttached();
    await visitPartyArea();
    await waitUntilPageAttached();
    await visitDiscussionBoard(newPostsOnly);
    await waitUntilPageAttached();
}

const KEY_COMMUNITIES = "communities";
const KEY_ONLY_NEW_POSTS = "only_new_posts";

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

function setVisitOnlyNewPosts(onlyNewPosts) {
    sessionStorage.setItem(KEY_ONLY_NEW_POSTS, onlyNewPosts ? 1 : 0);
}

function getVisitOnlyNewPosts() {
    return (sessionStorage.getItem(KEY_ONLY_NEW_POSTS) | 0) !== 0;
}

function removeVisitOnNewPosts() {
    sessionStorage.removeItem(KEY_ONLY_NEW_POSTS);
}

function cleanupAutoVisitStates() {
    removeUnvisitedCommunities();
    removeVisitOnNewPosts();
}

const VISIT_STATE_HAS_MORE = 0;
const VISIT_STATE_FINISHED = 1;
const VISIT_STATE_NOT_STARTED = 2;

async function tryContinueAutoVisit() {
    await new cc.RequestWaiter(r => /communities/.test(r.responseURL));

    let communites = getUnvisitedCommunities();
    if (communites === undefined) {
        return VISIT_STATE_NOT_STARTED;
    }
    if (communites.length) {
        await likeAll(getVisitOnlyNewPosts());
        return await trySwitchToNextCommunity() ? VISIT_STATE_HAS_MORE : VISIT_STATE_FINISHED;
    }
    // in case something went wrong
    cleanupAutoVisitStates();
    return VISIT_STATE_NOT_STARTED;
}

async function trySwitchToNextCommunity() {
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
        cleanupAutoVisitStates();
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
        await cc.delay(100);
    } while (!button);

    let panel;
    do {
        button.click();
        await cc.delay(100);
        panel = document.querySelector('.sqt-lib-roles-content');
    } while (!panel);
    await cc.delay(800);
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

    tryContinueAutoVisit().then((state) => {
        if (state === VISIT_STATE_FINISHED) {
            alert("Finished");
        }
    });

    GM_registerMenuCommand("Like All Communities", async () => {
        const newPostsOnly = confirm('Only new posts');
        setVisitOnlyNewPosts(newPostsOnly);
        await likeAll(newPostsOnly);
        if (!await trySwitchToNextCommunity()) {
            alert('Finished');
        }
    });

    GM_registerMenuCommand("Like All", () => {
        const newPostsOnly = confirm('Only new posts?');
        likeAll(newPostsOnly)
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

    GM_registerMenuCommand("Like Disccusion Board", () => {
        const onlyNewPosts = confirm('Only new posts?');
        visitDiscussionBoard(onlyNewPosts)
            .then(() => waitUntilPageAttached())
            .then(() => alert('Finished'));
    });
});

