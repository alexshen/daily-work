'use strict';

window.cc = (function() {

    /** 
     * return a promise which delays for a period of time
     * @param durationMs milliseconds to delay
     * @returns a promise
     * */ 
    function delay(durationMs) {
        return new Promise((resolved) => {
            setTimeout(resolved, durationMs);
        });
    }

    return {
        delay: delay
    };
})();