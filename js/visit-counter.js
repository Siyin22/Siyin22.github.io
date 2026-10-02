(function () {
    'use strict';

    var script = document.querySelector('script[data-goatcounter]');
    if (!script) return;

    var endpoint = new URL(script.dataset.goatcounter);
    // Ignore query strings so links with tracking parameters share one counter.
    var pagePath = window.location.pathname;
    window.goatcounter = window.goatcounter || {};
    window.goatcounter.path = pagePath;
    window.goatcounter.no_events = true;

    document.querySelectorAll('[data-visit-counter]').forEach(function (counter) {
        var value = counter.querySelector('[data-visit-value]');
        var unit = counter.querySelector('[data-visit-unit]');
        var path = counter.dataset.visitCounter === 'TOTAL' ? 'TOTAL' : pagePath;
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 10000);

        value.textContent = '加载中';
        fetch(endpoint.origin + '/counter/' + encodeURIComponent(path) + '.json', {
            signal: controller.signal,
            credentials: 'omit'
        }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        }).then(function (data) {
            if (typeof data.count !== 'string' || !/^\d[\d,]*$/.test(data.count)) {
                throw new Error('Invalid count');
            }
            value.textContent = data.count;
            unit.hidden = false;
        }).catch(function () {
            value.textContent = '暂不可用';
            unit.hidden = true;
        }).finally(function () {
            clearTimeout(timeout);
        });
    });
})();
