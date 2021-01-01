'use strict';

// ==UserScript==
// @name    Like All New Posts
// @author  ashen
// @version 2
// @grant    none
// @match https://www.juweitong.cn/*
// ==/UserScript==

const NUM_COMMUNITIES = 4;

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

function waitUntilLoadingFinishes() {
    return waitUntilCondition(() => !unsafeWindow.g_isLoading)
        .then(() => delay(500));
}

function waitUntilPageAttached() {
    return waitUntilCondition(() => unsafeWindow.g_attached)
        .then(() => delay(500));
}

function getRandomComment() {
    let comments = document.querySelector('div#replyList').querySelectorAll('pre');
    let comment = comments[Math.random() * comments.length | 0];
    return comment ? comment.innerText : null;
}

function canComment() {
    return document.querySelector('div.mi-reply-panel').children.length === 2;
}

function doComment(comment) {
    document.querySelector('div.mi-reply-panel').children[1].click();
    return delay(500)
        .then(() => document.querySelector('textarea#ReplyContent').value = comment)
        .then(() => {
            // post the comment
            document.querySelector('div.mi-edit-panel.bottom').lastElementChild.click();
            return delay(1000);
        });
}

function likeAllPosts(needComment) {
    // find all posts
    let posts = document.querySelectorAll('div.list-group-item.ui-1-article > a');
    console.log('number of posts: ' + posts.length);
    return new Promise(resolve => {
        likePostRecursive(posts, 0, resolve);
    });

    function likePostRecursive(posts, i, done) {
        if (i < posts.length) {
            // check if this is a new post
            if (posts[i].querySelector('span.ui-1-tag.mi-q-new')) {
                new Promise(resolve => {
                    // show the post
                    posts[i].click();
                    resolve();
                }).then(() => {
                    return waitUntilLoadingFinishes();
                }).then(() => {
                    // check if already liked
                    let likeButton = document.querySelector('div.mi-reply-panel > a');
                    if (likeButton.querySelector('span#cmdLike').innerText === '点赞') {
                        likeButton.click();
                        return delay(500)
                            .then(() => {
                                // check if we need to comment the post
                                if (needComment && canComment()) {
                                    let comment = getRandomComment();
                                    if (!comment) {
                                        do {
                                            comment = prompt('Please enter the comment', '');
                                        } while (!comment);
                                    }
                                    return doComment(comment);
                                }
                            });
                    }
                }).then(() => {
                    document.querySelector('a.mi-line-body').click();
                    return waitUntilLoadingFinishes();
                }).then(() => {
                    likePostRecursive(posts, i + 1, done);
                });
            } else {
                likePostRecursive(posts, i + 1, done);
            }
        } else {
            console.log('finish liking posts');
            done();
        }
    }
}

function back() {
    unsafeWindow.g_attached = false;
    document.querySelector('a.back').click();
    return waitUntilLoadingFinishes();
}

function visitNotices(needComment) {
    console.log('visit notices');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-notice');
    button.click();
    return waitUntilLoadingFinishes()
        .then(() => {
            document.querySelector('span.ui-1-sub-header-more').click();
            return waitUntilLoadingFinishes();
        })
        .then(() => likeAllPosts(needComment))
        .then(() => back())
        .then(() => back());
}

function visitMyNeighbors(needComment) {
    console.log('visit my neighbors');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-around');
    button.click();
    return waitUntilLoadingFinishes()
        .then(() => likeAllPosts(needComment))
        .then(() => back());
}

function visitPartyArea() {
    console.log('visit party area');
    let button = document.querySelector('span.iconfont.if-icon.if-icon-ccp');
    button.click();
    return waitUntilLoadingFinishes()
        .then(() => {
            document.querySelector('span.ui-1-sub-header-more').click();
            return waitUntilLoadingFinishes();
        })
        .then(() => likeAllPosts(false))
        .then(() => back())
        .then(() => back());
}

function changeMember(i) {
    document.querySelector('a#showChangeMember').click();
    return delay(1000)
        .then(() => {
            let members = document.querySelector('div.van-cell-group.van-hairline--top-bottom');
            members.children[i].click();
            return delay(1000);
        })
        .then(() => {
            document.querySelector('div.sqt-lib-roles-foot').lastElementChild.click();
        });
}

/*
function visitAllCommunities() {
  new Promise(resolve => {
    visitCommunityRecursive(0, resolve);
  })
  .then(() => alert('Finished'));
                          
    function visitCommunityRecursive(i, done) {
    console.log('visiting ' + i);
    if (i < NUM_COMMUNITIES) {
      let needComment = i === 0;

      changeMember(i + 1)
            .then(() => visitCommunityRecursive(i + 1, done));
    } else {
            done();
    }
  }
}*/

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
        let needComment = confirm('Need commenting?');
        visitNotices(needComment)
            .then(() => waitUntilPageAttached())
            .then(() => visitMyNeighbors(needComment))
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

