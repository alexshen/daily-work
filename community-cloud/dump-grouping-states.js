function dumpGroupingStates() {
    const groups = document.querySelectorAll(".room .flex-item");
    const roomStates = [];
    for (let group of groups) {
        const addressComps = group
            .querySelector(".title .text-wrap [title]:last-child")
            .innerText.split("/");
        const long = addressComps[3].match(/\d+/);
        const unit = addressComps[4].match(/\d+/);
        for (let roomState of group.querySelectorAll(".menu span")) {
            const room = roomState.innerText.trim();
            // if style is present, it's included
            roomStates.push(
                [[long, unit, room].join("-"), roomState.hasAttribute("style") ? 1 : 0].join("\t")
            );
        }
    }
    console.log(roomStates.join("\n"));
}
