'use strict';

// ==UserScript==
// @name    Like All New Posts
// @author  ashen
// @version 1
// @grant    none
// @match https://www.juweitong.cn/*
// ==/UserScript==

const NUM_COMMUNITIES = 4;

function delay(time) {
    return new Promise(resolve => {
        setTimeout(resolve, time);
    });
}

function getRandomComment() {
    let comments = document.querySelector('div#replyList').querySelectorAll('pre');
    let comment = comments[Math.random() * comments.length];
    return comment ? comment.innerText : null;
}

function canComment() {
    return document.querySelector('div.mi-reply-panel').children.length === 2;
}

async function doComment(comment) {
    document.querySelector('div.mi-reply-panel').children[1].click();
    await delay(500);
    document.querySelector('textarea#ReplyContent').value = comment;
    // post the comment
    document.querySelector('div.mi-edit-panel.bottom').lastElementChild.click();
    await delay(1000);
}

async function likeAllPosts(needComment) {
    // find all posts
    let posts = document.querySelectorAll('div.list-group-item.ui-1-article > a');
    console.log('number of posts: ' + posts.length);

    for (let post of posts) {
        // check if this is a new post
        if (post.querySelector('span.ui-1-tag.mi-q-new')) {
            post.click();
            await delay(1500)
            // check if already liked
            let likeButton = document.querySelector('div.mi-reply-panel > a');
            if (likeButton.querySelector('span#cmdLike').innerText === '点赞') {
                likeButton.click();
                await delay(500)
                // check if we need to comment the post
                if (needComment && canComment()) {
                    let comment = getRandomComment();
                    if (!comment) {
                        do {
                            comment = prompt('Please enter the comment', '');
                        } while (!comment);
                    }
                    await doComment(comment);
                }
            }
            document.querySelector('a.mi-line-body').click();
            await delay(1500);
        }
    }
}

function back() {
    document.querySelector('a.back').click();
    return delay(1500);
}

async function visitNotices(needComment) {
    document.querySelector('span.iconfont.if-icon.if-icon-notice').click();
    await delay(1500);
    document.querySelector('span.ui-1-sub-header-more').click();
    await delay(1500);
    await likeAllPosts(needComment);
    await back();
    await back();
}

async function visitMyNeighbors(needComment) {
    document.querySelector('span.iconfont.if-icon.if-icon-around').click();
    await delay(1500);
    await likeAllPosts(needComment);
    await back();
}

async function visitPartyArea() {
    document.querySelector('span.iconfont.if-icon.if-icon-ccp').click();
    await delay(1500);
    document.querySelector('span.ui-1-sub-header-more').click();
    await delay(1500);
    await likeAllPosts(false);
    await back();
    await back();
}

async function changeMember(i) {
    document.querySelector('a#showChangeMember').click();
    await delay(1000);
    let members = document.querySelector('div.van-cell-group.van-hairline--top-bottom');
    members.children[i].click();
    await delay(1000);
    document.querySelector('div.sqt-lib-roles-foot').lastElementChild.click();
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
    if (evt.ctrlKey && evt.key === '1') {
        let needComment = confirm('Need commenting?');
        visitNotices(needComment)
            .then(() => visitMyNeighbors(needComment))
            .then(() => visitPartyArea())
            .then(() => alert('Finished'));
    }
    if (evt.altKey && evt.code.startsWith('Digit')) {
        let i = parseInt(evt.code.substr(5));
        if (i > 0) {
            changeMember(i - 1);
        }
    }
});