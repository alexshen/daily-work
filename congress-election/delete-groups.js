function removeGroup(id, success, failure) {
    jQuery.ajax({
        url:
            "http://10.83.70.77:9080/sh_renda/constituency.do?methodName=delGroup&id=" +
            id +
            "&t=" +
            new Date().getTime(),
        type: "post",
        success: function (response) {
            if (response) {
                success();
            } else {
                failure();
            }
        },
    });
}

function removeGroupsFrom(first) {
    const iframe = document.querySelector('iframe[name=queryBody][src*=findGroupList]');
    const parentDoc = iframe ? iframe.contentDocument : document;
    const rows = parentDoc.querySelectorAll('#table_data tbody tr');
    //console.log(rows);
    const groups = [];
    for (let i = 1 + first; i < rows.length - 1; ++i) {
        const id = rows[i].querySelector('td:first-child input').value;
        const name = rows[i].querySelector('td:nth-child(4)').innerText;
        groups.push({ id: id, name: name});
    }

    (function helper(i) {
        const {id, name} = groups[i];
        removeGroup(id, () => {
            console.log(`removed ${id} ${name}`);
            if (i + 1 < groups.length) {
                helper(i + 1);
            } else {
                console.log('all removed');
            }
        }, () => {
            console.log(`failed to remove ${id} ${name}`);
        });
    })(0);
}
