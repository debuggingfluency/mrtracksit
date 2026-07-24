// Firefox: sidebar opens automatically when the user clicks the browser action button.
// No need to call sidebarAction.open() explicitly.

// ── Storage helpers ───────────────────────────────────────────────────────────
// Structure: {language}_{year} → { dayIndex: seconds }
// dayIndex is 0-based day of year (Jan 1 = 0, Dec 31 = 364/365)

function dateToDayIndex(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.round((d - start) / 86400000);
}

function dltKey(lang, year) { return lang + '_' + year; }

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'close_side_panel') {
        if (sender.tab) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'close_window' });
        }
        return;
    }

    if (message.type === 'track_time') {
        const getLocalDate = () => {
            const now = new Date();
            return now.getFullYear() + '-' +
                   String(now.getMonth() + 1).padStart(2, '0') + '-' +
                   String(now.getDate()).padStart(2, '0');
        };

        const today = message.date || getLocalDate();
        const { language, time, platform } = message;
        const year = parseInt(today.slice(0, 4));
        const dayIdx = String(dateToDayIndex(today));
        const shardKey = dltKey(language, year);

        chrome.storage.sync.get(shardKey, (result) => {
            const shard = result[shardKey] || {};
            console.log(`Background: Tracking ${time}s for ${language} on ${platform} on ${today}`);
            shard[dayIdx] = (shard[dayIdx] || 0) + time;
            chrome.storage.sync.set({ [shardKey]: shard }, () => {
                if (chrome.runtime.lastError) {
                    console.error('track_time write failed:', chrome.runtime.lastError.message);
                }
            });
        });
        return;
    }

    if (message.type === 'add_manual_time') {
        const { date, language, minutes } = message;
        const year = parseInt(date.slice(0, 4));
        const dayIdx = String(dateToDayIndex(date));
        const shardKey = dltKey(language, year);

        chrome.storage.sync.get(shardKey, (result) => {
            const shard = result[shardKey] || {};
            const newTotal = Math.max(0, (shard[dayIdx] || 0) + minutes * 60);
            if (newTotal === 0) {
                delete shard[dayIdx];
            } else {
                shard[dayIdx] = newTotal;
            }
            chrome.storage.sync.set({ [shardKey]: shard }, () => {
                sendResponse({ success: true });
            });
        });
        return true;
    }
});
