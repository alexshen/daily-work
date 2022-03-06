'use strict';

// ==UserScript==
// @name    Like All New Posts
// @author  ashen
// @version 0.4
// @grant    none
// @match https://www.juweitong.cn/*
// ==/UserScript==

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

async function likePost(post) {
    // check if this is a new post
    if (post.querySelector('span.ui-1-tag.mi-q-new')) {
        // show the post
        post.click();
        await waitUntilLoadingFinishes();
        // check if already liked
        let likeButton = document.querySelector('div.mi-reply-panel > a');
        if (likeButton.querySelector('span#cmdLike').innerText === '点赞') {
            likeButton.click();
            await delay(500);
        }
        document.querySelector('a.mi-line-body').click();
        await waitUntilLoadingFinishes();
    }
}

async function likeAllPosts() {
    // find all posts
    let posts = document.querySelectorAll('div.list-group-item.ui-1-article > a');
    console.log('number of posts: ' + posts.length);
    for (let post of posts) {
        await likePost(post);
    }
    console.log('finish liking posts');
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
    await waitUntilLoadingFinishes();
    await likeAllPosts();
    await back();
    return await back();
}

async function visitMyNeighbors() {
    console.log('visit my neighbors');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-around');
    button.click();
    await waitUntilLoadingFinishes();
    await likeAllPosts();
    return await back();
}

async function visitPartyArea() {
    console.log('visit party area');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-ccp');
    button.click();
    await waitUntilLoadingFinishes();
    document.querySelector('span.ui-1-sub-header-more').click();
    await waitUntilLoadingFinishes();
    await likeAllPosts(false);
    await back();
    return await back();
}

async function changeMember(i) {
    document.querySelector('a#showChangeMember').click();
    await delay(1000);
    let members = document.querySelector('div.van-cell-group.van-hairline--top-bottom');
    members.children[i].click();
    await delay(1000);
    document.querySelector('div.sqt-lib-roles-foot').lastElementChild.click();
}

document.addEventListener('keydown', evt => {
    if (!unsafeWindow.g_isPatched) {
        console.log('patching');

        var script = unsafeWindow.document.createElement('script');
        script.type = 'text/javascript';
        script.innerText = "\
			let orgOnAttached = mi.page.onAttached;\
			mi.page.onAttached = function () {\
                console.log('Page attached');\
                g_attached = true;\
                return orgOnAttached.apply(mi.page, arguments);\
    		};\
            let orgLoadingToast = mi.loadingToast;\
            mi.loadingToast = function () {\
                console.log('Loading ' + Date.now());\
                g_isLoading = true;\
                let t = orgLoadingToast.apply(mi, arguments);\
                let orgHide = t.hide;\
                t.hide = function () {\
                    console.log('Loading finished ' + Date.now());\
                    g_isLoading = false;\
                    return orgHide.apply(t, arguments);\
                };\
                return t;\
            };";
        unsafeWindow.document.getElementsByTagName('head')[0].appendChild(script);

        unsafeWindow.g_isPatched = true;
        console.log('patched');
    }

    if (evt.ctrlKey && evt.key === '1') {
        visitNotices()
            .then(() => waitUntilPageAttached())
            .then(() => visitMyNeighbors())
            .then(() => waitUntilPageAttached())
            .then(() => visitPartyArea())
            .then(() => waitUntilPageAttached())
            .then(() => alert('Finished'));
    }
    if (evt.altKey && evt.code.startsWith('Digit')) {
        let i = parseInt(evt.code.substr(5));
        if (i > 0) {
            changeMember(i - 1);
        }
    }
});

