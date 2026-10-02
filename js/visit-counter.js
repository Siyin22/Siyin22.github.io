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

    // Load independently of the theme's blocking scripts and external CDNs.
    var tracker = document.createElement('script');
    tracker.async = true;
    tracker.src = script.dataset.tracker;
    document.head.appendChild(tracker);

    var snapshotController = new AbortController();
    var snapshotTimeout = setTimeout(function () { snapshotController.abort(); }, 5000);
    var snapshot = fetch(script.dataset.snapshot, { credentials: 'omit', signal: snapshotController.signal })
        .then(function (response) {
            if (!response.ok) throw new Error('Snapshot HTTP ' + response.status);
            return response.json();
        }).catch(function () { return null; })
        .finally(function () { clearTimeout(snapshotTimeout); });

    function validCount(count) {
        return typeof count === 'string' && /^\d[\d,.\s\u00a0\u202f]*$/.test(count);
    }

    function formatUpdatedAt(updatedAt) {
        var date = new Date(updatedAt);
        if (isNaN(date.getTime())) return '';
        var parts = {};
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(date).forEach(function (part) { parts[part.type] = part.value; });
        return parts.year + '-' + Number(parts.month) + '-' + Number(parts.day) +
            ' ' + parts.hour + ':' + parts.minute;
    }

    document.querySelectorAll('[data-visit-counter]').forEach(function (counter) {
        var value = counter.querySelector('[data-visit-value]');
        var unit = counter.querySelector('[data-visit-unit]');
        var updated = counter.querySelector('[data-visit-updated]');
        var path = counter.dataset.visitCounter === 'TOTAL' ? 'TOTAL' : pagePath;
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 10000);
        var hasCount = false;
        var liveFinished = false;

        function showCount(count, updatedAt) {
            value.textContent = count;
            unit.hidden = false;
            var formatted = formatUpdatedAt(updatedAt);
            updated.textContent = formatted ? '（截止' + formatted + '）' : '';
            updated.hidden = !formatted;
            counter.title = formatted ? '最近成功获取计数的时间（北京时间）；统计数据可能有缓存延迟' : '';
            hasCount = true;
        }

        value.textContent = '加载中';
        snapshot.then(function (data) {
            if (liveFinished || !data || data.siteUrl !== endpoint.origin || !data.counts) return;
            var entry = data.counts[path];
            if (entry && validCount(entry.count)) {
                showCount(entry.count, entry.updatedAt);
            }
        });
        fetch(endpoint.origin + '/counter/' + encodeURIComponent(path) + '.json', {
            signal: controller.signal,
            credentials: 'omit'
        }).then(function (response) {
            // GoatCounter returns JSON with count "0" and status 404 when a
            // new article has no records yet. Other failures are not zeroes.
            if (!response.ok && response.status !== 404) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json().then(function (data) {
                if (response.status === 404 && data.count !== '0') {
                    throw new Error('HTTP 404 without an empty counter');
                }
                return data;
            });
        }).then(function (data) {
            if (!validCount(data.count)) {
                throw new Error('Invalid count');
            }
            liveFinished = true;
            showCount(data.count, new Date());
        }).catch(function (error) {
            if (!hasCount) {
                // Wait for the same-origin snapshot before declaring failure.
                snapshot.then(function () {
                    if (!hasCount) {
                        value.textContent = '暂不可用';
                        unit.hidden = true;
                    }
                });
            }
            console.warn('Visit counter could not load (' + path + '):', error);
        }).finally(function () {
            clearTimeout(timeout);
        });
    });
})();
