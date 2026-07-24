// Global variables
let currentDate = new Date();
let selectedDate = null;
const DEFAULT_GOAL = 60; // Fallback for days with no recorded goal
let dailyGoal = DEFAULT_GOAL; // Effective goal for today's current language
let currentLanguage = 'english';
let watchedLanguages = ['english', 'spanish', 'french', 'german', 'russian', 'japanese', 'chinese', 'esperanto'];
let trackingEnabled = true;
let customTrackers = [];

// Streak flame state
const FLAME_STATES = { AT_RISK: 'at-risk', IN_PROGRESS: 'in-progress', SECURED: 'secured' };
let prevFlameState = null;

function getFlameState(loggedMinutes, goalMinutes) {
    if (goalMinutes <= 0) return FLAME_STATES.SECURED;
    if (loggedMinutes >= goalMinutes) return FLAME_STATES.SECURED;
    if (loggedMinutes > 0) return FLAME_STATES.IN_PROGRESS;
    return FLAME_STATES.AT_RISK;
}

function shouldPulse(state) {
    return state === FLAME_STATES.AT_RISK && new Date().getHours() >= 18;
}

function renderStreakFlame(loggedMinutes, goalMinutes, streakDays) {
    const state = getFlameState(loggedMinutes, goalMinutes);
    const flameEl  = document.querySelector('[data-streak-flame]');
    const numberEl = document.getElementById('dayStreakValue');
    const labelEl  = document.getElementById('streakStatusLabel');
    if (!flameEl || !numberEl || !labelEl) return;

    const STATES = Object.values(FLAME_STATES);
    numberEl.classList.remove(...STATES.map(s => `streak-number--${s}`));
    labelEl.classList.remove(...STATES.map(s => `streak-status-label--${s}`));

    numberEl.classList.add(`streak-number--${state}`);
    labelEl.classList.add(`streak-status-label--${state}`);

    const LABELS = { 'at-risk': 'AT RISK TODAY', 'in-progress': 'IN PROGRESS', 'secured': 'SECURED' };
    labelEl.textContent = LABELS[state];
    numberEl.textContent = streakDays;

    if (state === FLAME_STATES.SECURED) {
        flameEl.hidden = false;
        if (prevFlameState && prevFlameState !== FLAME_STATES.SECURED) {
            flameEl.classList.remove('streak-flame--ignite');
            void flameEl.offsetWidth;
            flameEl.classList.add('streak-flame--ignite');
        }
    } else {
        flameEl.hidden = true;
        flameEl.classList.remove('streak-flame--ignite');
    }
    prevFlameState = state;
}

// Language data with flag paths - ARRANGED IN ALPHABETICAL ORDER
const languageData = {
    'arabic': { name: 'Arabic', flag: 'flags/arabic.svg' },
    'chinese': { name: 'Chinese', flag: 'flags/chinese.svg' },
    'czech': { name: 'Czech', flag: 'flags/czech.svg' },
    'danish': { name: 'Danish', flag: 'flags/danish.svg' },
    'dutch': { name: 'Dutch', flag: 'flags/dutch.svg' },
    'english': { name: 'English', flag: 'flags/english.svg' },
    'esperanto': { name: 'Esperanto', flag: 'flags/esperanto.svg' },
    'finnish': { name: 'Finnish', flag: 'flags/finnish.svg' },
    'french': { name: 'French', flag: 'flags/french.svg' },
    'german': { name: 'German', flag: 'flags/german.svg' },
    'greek': { name: 'Greek', flag: 'flags/greek.svg' },
    'hebrew': { name: 'Hebrew', flag: 'flags/hebrew.svg' },
    'hindi': { name: 'Hindi', flag: 'flags/hindi.svg' },
    'hungarian': { name: 'Hungarian', flag: 'flags/hungarian.svg' },
    'indonesian': { name: 'Indonesian', flag: 'flags/indonesian.svg' },
    'italian': { name: 'Italian', flag: 'flags/italian.svg' },
    'japanese': { name: 'Japanese', flag: 'flags/japanese.svg' },
    'korean': { name: 'Korean', flag: 'flags/korean.svg' },
    'norwegian': { name: 'Norwegian', flag: 'flags/norwegian.svg' },
    'polish': { name: 'Polish', flag: 'flags/polish.svg' },
    'portuguese': { name: 'Portuguese', flag: 'flags/portuguese.svg' },
    'russian': { name: 'Russian', flag: 'flags/russian.svg' },
    'spanish': { name: 'Spanish', flag: 'flags/spanish.svg' },
    'swedish': { name: 'Swedish', flag: 'flags/swedish.svg' },
    'thai': { name: 'Thai', flag: 'flags/thai.svg' },
    'turkish': { name: 'Turkish', flag: 'flags/turkish.svg' },
    'ukrainian': { name: 'Ukrainian', flag: 'flags/ukrainian.svg' },
    'vietnamese': { name: 'Vietnamese', flag: 'flags/vietnamese.svg' }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    setupEventListeners();
    loadSettings();
});

// Apply theme and sync active button state
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    repaintCalendar();
    updateChart();
}

// Load settings from storage
function loadSettings() {
    // Local-only prefs: selectedLanguage, trackingEnabled, theme
    chrome.storage.local.get(['selectedLanguage', 'trackingEnabled', 'theme'], (localResult) => {
        if (localResult.selectedLanguage) currentLanguage = localResult.selectedLanguage;
        if (localResult.trackingEnabled !== undefined) trackingEnabled = localResult.trackingEnabled;
        applyTheme(localResult.theme || 'system');

        // Synced prefs: watchedLanguages, goalHistory
        chrome.storage.sync.get(['watchedLanguages', 'goalHistory'], (syncResult) => {
            if (syncResult.watchedLanguages && syncResult.watchedLanguages.length > 0) {
                watchedLanguages = syncResult.watchedLanguages;
            }

            // If the stored selectedLanguage isn't in the watched list, fall back
            if (!watchedLanguages.includes(currentLanguage) && watchedLanguages.length > 0) {
                currentLanguage = watchedLanguages[0];
                chrome.storage.local.set({ selectedLanguage: currentLanguage });
            }

            const today = getLocalToday();
            dailyGoal = getGoalForDate(currentLanguage, today, syncResult.goalHistory || {});
            document.getElementById('goalSepText').textContent = ` / ${dailyGoal} mins`;
            document.getElementById('goalInput').value = dailyGoal;

            updateCurrentLanguageDisplay();
            updateTrackingStatus();
            renderCalendar();
            updateProgressDisplay();
            updateStats();
            setupChart();
        });
    });
}

// Show growl notification
function showGrowlNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.getElementById('popup-lang-tracker-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'popup-lang-tracker-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'enabled' ? '#4CAF50' :
            type === 'disabled' ? '#f44336' :
                '#2196F3'
        };
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        font-family: sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 300px;
        word-wrap: break-word;
        border: 2px solid rgba(255, 255, 255, 0.2);
    `;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 18px;">${type === 'enabled' ? '✅' :
            type === 'disabled' ? '⏹️' :
                'ℹ️'
        }</div>
            <div>${message}</div>
        </div>
    `;

    document.body.appendChild(notification);

    // Force reflow and animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });

    // Animate out and remove
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification && notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 400);
    }, 2500);
}

// Setup all event listeners
function setupEventListeners() {
    // Close button
    document.getElementById('closeSidePanel').addEventListener('click', () => {
        window.close();
    });

    // Calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Daily goal editing
    document.getElementById('dailyGoalButton').addEventListener('click', openGoalEditor);
    document.getElementById('goalSave').addEventListener('click', saveGoal);
    document.getElementById('goalCancel').addEventListener('click', closeGoalEditor);
    document.getElementById('goalInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); saveGoal(); }
        if (e.key === 'Escape') { e.preventDefault(); closeGoalEditor(); }
    });

    // Language selection dropdown
    document.getElementById('languageSelectionButton').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLanguageDropdown();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#langDropdown') && !e.target.closest('#languageSelectionButton')) {
            closeLangDropdown();
        }
    });

    // Tracking status toggle
    document.getElementById('trackingIndicator').addEventListener('click', toggleTracking);

    // Watched languages modal
    document.getElementById('watchedLanguagesButton').addEventListener('click', toggleWatchedLanguagesModal);
    document.getElementById('settingsBack').addEventListener('click', closeWatchedLanguagesModal);

    // Custom tracker modal
    document.getElementById('openCustomTrackerModalButton').addEventListener('click', openCustomTrackerModal);
    document.getElementById('closeCustomTrackerModal').addEventListener('click', closeCustomTrackerModal);
    document.getElementById('cancelCustomTrackerButton').addEventListener('click', closeCustomTrackerModal);
    document.getElementById('saveCustomTrackerButton').addEventListener('click', addCustomTracker);
    document.getElementById('ctSelectorType').addEventListener('change', (e) => {
        document.getElementById('ctCustomSelector').classList.toggle('hidden', e.target.value !== 'custom');
    });

    // Settings tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab));
    });

    // Manual entry modal
    document.getElementById('closeManualEntryModal').addEventListener('click', closeManualEntryModal);
    document.getElementById('addTimeButton').addEventListener('click', saveManualTime);
    document.getElementById('cancelManualEntry').addEventListener('click', closeManualEntryModal);
    document.getElementById('clearTimeButton').addEventListener('click', resetManualTime);

    // Replace original value when user starts typing a fresh number or +/-
    document.getElementById('manualMinutes').addEventListener('keydown', (e) => {
        const input = e.target;
        if (input.dataset.replaceOnType === 'true') {
            // Allow +/- to start a delta from original, or a digit to replace entirely
            if (e.key === '+' || e.key === '-') {
                input.dataset.replaceOnType = 'false';
                // Keep existing value as base, clear field so user types the delta
                input.value = e.key;
                input.dataset.current = input.dataset.original;
                e.preventDefault();
                return;
            } else if (e.key >= '0' && e.key <= '9') {
                input.dataset.replaceOnType = 'false';
                input.value = '';
                // dataset.current stays as original until applyDelta or save
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                input.dataset.replaceOnType = 'false';
            }
            // Any other key (Enter, Tab, etc.) falls through normally
        }
    });

    // Escape closes modal without saving
    document.getElementById('manualMinutes').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeManualEntryModal();
        }
    });

    // Enter: if value has +/-, apply delta and update field; if bare number, save
    document.getElementById('manualMinutes').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const input = document.getElementById('manualMinutes');
        const raw = input.value.trim();
        if (isDelta(raw)) {
            // Apply delta, show new total, keep modal open for another edit
            applyDelta(input);
        } else {
            // Bare number or already-resolved value — treat Enter as Save
            saveManualTime();
        }
    });

    // Confirmation modal
    document.getElementById('closeConfirmModal').addEventListener('click', closeConfirmModal);
    document.getElementById('confirmNo').addEventListener('click', closeConfirmModal);

    // Theme selector
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            chrome.storage.local.set({ theme });
            applyTheme(theme);
            updateChart();
        });
    });

    // Sync local → sync storage
    document.getElementById('syncLocalToSyncButton').addEventListener('click', migrateLocalToSync);

    // Export/Import functionality
    document.getElementById('exportDataButton').addEventListener('click', exportData);
    document.getElementById('importDataButton').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', importData);

    // Progress bar click
    const progressBarEl = document.getElementById('progressBar');
    if (progressBarEl) progressBarEl.addEventListener('click', openManualEntryModal);

    // Close modals when clicking overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        });
    });
}

// Get today's date as a local YYYY-MM-DD string (never UTC)
function getLocalToday() {
    const n = new Date();
    return n.getFullYear() + '-' +
        String(n.getMonth() + 1).padStart(2, '0') + '-' +
        String(n.getDate()).padStart(2, '0');
}

/**
 * Returns the effective daily goal (in minutes) for a given language on a given date.
 * Looks up goalHistory for the latest entry with date <= targetDate.
 * Falls back to DEFAULT_GOAL (60) for historical data recorded before this feature.
 */
function getGoalForDate(language, targetDate, goalHistory) {
    const entries = (goalHistory[language] || []).filter(e => e.date <= targetDate);
    if (entries.length === 0) return DEFAULT_GOAL;
    // Latest entry that is on or before targetDate
    return entries[entries.length - 1].goal;
}

// Heatmap helpers
const HEATMAP = {
    light: ['#d3ede2', '#9fe1cb', '#5dcaa5', '#1d9e75', '#0f6e56'],
    dark:  ['#0b3d31', '#0f5a48', '#13795f', '#1d9e75', '#3fc296'],
};

const HEATMAP_TEXT = {
    light: ['#0f6e56', '#0f6e56', '#04342c', '#e1f5ee', '#e1f5ee'],
    dark:  ['#cdeee2', '#cdeee2', '#e1f5ee', '#04342c', '#04342c'],
};

function currentTheme() {
    const t = document.documentElement.dataset.theme;
    return t === 'light' ? 'light' : 'dark';
}

function heatmapColor(minutes, goalMinutes) {
    if (!minutes || minutes <= 0) return null;
    const ramp = HEATMAP[currentTheme()];
    const ratio = minutes / Math.max(goalMinutes, 1);
    const t = Math.max(0, Math.min(1, ratio / 1.25));
    const idx = Math.round(t * (ramp.length - 1));
    return { color: ramp[idx], idx };
}

function tileTextColor(idx, theme) {
    return HEATMAP_TEXT[theme][idx] || HEATMAP_TEXT[theme][0];
}

function renderLegend() {
    const swatches = document.querySelector('.calendar-legend__swatches');
    if (!swatches) return;
    const ramp = HEATMAP[currentTheme()];
    swatches.innerHTML = ramp.map(c => `<i style="background:${c}"></i>`).join('');
}

function repaintCalendar() {
    document.querySelectorAll('.day[data-minutes]').forEach(cell => {
        const mins = +cell.dataset.minutes;
        const goal = +cell.dataset.goal;
        if (!mins || mins <= 0) return;
        const res = heatmapColor(mins, goal);
        if (!res) return;
        cell.style.background = res.color;
        const txt = tileTextColor(res.idx, currentTheme());
        cell.querySelectorAll('.day-number, .day-time').forEach(el => el.style.color = txt);
    });
    renderLegend();
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getDayStatus(minutes, goalMinutes) {
    if (goalMinutes <= 0) return 'complete';
    if (minutes >= goalMinutes) return 'complete';
    if (minutes > 0) return 'in-progress';
    return 'empty';
}

function renderCalendar() {
    const calendar = document.getElementById('calendar');
    const monthYear = document.getElementById('monthYear');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const todayStr = getLocalToday();

    // Single storage read for the whole month
    chrome.storage.sync.get(['goalHistory'], (goalResult) => {
    getDailyLanguageTime((dlt) => {
        const goalHistory = goalResult.goalHistory || {};

        // Clear and rebuild entirely inside the callback so concurrent calls don't interleave
        calendar.innerHTML = '';
        monthYear.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
            const h = document.createElement('div');
            h.className = 'day-header';
            h.textContent = d;
            calendar.appendChild(h);
        });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Blank cells before the 1st
        for (let i = 0; i < firstDay; i++) {
            const blank = document.createElement('div');
            blank.className = 'day empty-day';
            calendar.appendChild(blank);
        }

        const ds = (d) =>
            `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const minsFor = (d) => Math.floor(((dlt[ds(d)] || {})[currentLanguage] || 0) / 60);
        const goalFor = (d) => getGoalForDate(currentLanguage, ds(d), goalHistory);
        const metGoal = (d) => d >= 1 && d <= daysInMonth && minsFor(d) >= goalFor(d);

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = ds(day);
            const isFuture = dateStr > todayStr;
            const isToday = dateStr === todayStr;
            const mins = minsFor(day);
            const dayGoal = goalFor(day);
            const goalMet = !isFuture && mins >= dayGoal;
            const partial = !isFuture && mins > 0 && !goalMet;
            const hasMins = !isFuture && mins > 0;

            const cell = document.createElement('div');
            cell.className = 'day';

            if (hasMins) {
                cell.dataset.minutes = mins;
                cell.dataset.goal = dayGoal;
            }

            if (isFuture) {
                cell.classList.add('future-day');
            } else if (goalMet) {
                cell.classList.add('goal-met');
                const res = heatmapColor(mins, dayGoal);
                if (res) cell.style.background = res.color;
                const prevMet = metGoal(day - 1);
                const nextMet = metGoal(day + 1);
                if (!prevMet && !nextMet) cell.classList.add('streak-solo');
                else if (!prevMet) cell.classList.add('streak-start');
                else if (!nextMet) cell.classList.add('streak-end');
                else cell.classList.add('streak-mid');
            } else if (partial) {
                cell.classList.add('goal-not-met');
                const res = heatmapColor(mins, dayGoal);
                if (res) cell.style.background = res.color;
            }

            if (isToday) cell.classList.add('today');

            // Today in-progress ring
            if (isToday && mins > 0 && !goalMet) {
                const r = 16;
                const circumference = 2 * Math.PI * r;
                const pct = Math.max(0, Math.min(1, mins / Math.max(dayGoal, 1)));
                const offset = circumference * (1 - pct);
                const wrapper = document.createElement('div');
                wrapper.className = 'today-ring-wrapper';
                wrapper.innerHTML = `
                    <svg viewBox="0 0 40 40" class="mt-ring" aria-hidden="true">
                        <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--mt-track)" stroke-width="4"/>
                        <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--mt-amber)" stroke-width="4"
                                stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}"
                                stroke-dashoffset="${offset.toFixed(1)}"/>
                    </svg>
                    <span class="day-number mt-ring__label">${day}</span>
                `;
                cell.appendChild(wrapper);
            } else {
                const res = hasMins ? heatmapColor(mins, dayGoal) : null;
                const txt = res ? tileTextColor(res.idx, currentTheme()) : null;
                const numEl = document.createElement('div');
                numEl.className = 'day-number';
                if (txt) numEl.style.color = txt;
                numEl.textContent = day;
                cell.appendChild(numEl);

                if (hasMins) {
                    const timeEl = document.createElement('div');
                    timeEl.className = 'day-time';
                    if (txt) timeEl.style.color = txt;
                    timeEl.textContent = `${mins}m`;
                    cell.appendChild(timeEl);
                }
            }

            if (!isFuture) {
                cell.addEventListener('click', () => {
                    document.querySelectorAll('.day.selected')
                        .forEach(d => d.classList.remove('selected'));
                    cell.classList.add('selected');
                    selectedDate = dateStr;
                    openManualEntryModal();
                });
            }

            calendar.appendChild(cell);
        }
        renderLegend();
    }); // getDailyLanguageTime
    }); // goalHistory
}

// Update current language display
function updateCurrentLanguageDisplay() {
    const flagImg = document.getElementById('currentLanguageFlag');
    const langData = languageData[currentLanguage];
    if (langData && flagImg) {
        flagImg.src = langData.flag;
        flagImg.alt = langData.name;
    }
}

// Update tracking status display
function updateTrackingStatus() {
    const indicator = document.getElementById('trackingIndicator');
    if (!indicator) return;
    indicator.classList.toggle('disabled', !trackingEnabled);
    indicator.setAttribute('aria-pressed', trackingEnabled.toString());
}

// Toggle tracking status
function toggleTracking() {
    trackingEnabled = !trackingEnabled;
    chrome.storage.local.set({ trackingEnabled });
    updateTrackingStatus();

    // Show growl notification with simple message
    if (trackingEnabled) {
        showGrowlNotification('Tracking Enabled', 'enabled');
    } else {
        showGrowlNotification('Tracking Disabled', 'disabled');
    }

    console.log('Tracking toggled:', trackingEnabled ? 'ENABLED' : 'DISABLED');
}

// Update progress display
function updateProgressDisplay() {
    const today = getLocalToday();

    chrome.storage.sync.get(['goalHistory'], (result) => {
        const goalHistory = result.goalHistory || {};
    getDailyLanguageTime((dailyLanguageTime) => {
        const todayData = dailyLanguageTime[today] || {};
        const todayMinutes = Math.floor((todayData[currentLanguage] || 0) / 60);
        const todayGoal = getGoalForDate(currentLanguage, today, goalHistory);

        // Keep global dailyGoal in sync for other functions
        dailyGoal = todayGoal;

        const percentage = todayGoal > 0 ? (todayMinutes / todayGoal) * 100 : 0;
        const goalFill = document.getElementById('goalProgressFill');
        const barStatus = getDayStatus(todayMinutes, todayGoal);
        if (goalFill) {
            goalFill.style.width = `${Math.min(percentage, 100)}%`;
            goalFill.style.background = barStatus === 'complete' ? 'var(--mt-green-secured)' :
                                         barStatus === 'in-progress' ? 'var(--mt-amber)' : 'transparent';
        }

        const curEl = document.getElementById('goalCurValue');
        const sepEl = document.getElementById('goalSepText');
        if (curEl) {
            curEl.textContent = todayMinutes;
            curEl.style.color = barStatus === 'complete' ? 'var(--mt-green-secured)' : 'var(--mt-amber)';
        }
        if (sepEl) sepEl.textContent = ` / ${todayGoal} mins`;

        updateTrackingStatus();
    }); // getDailyLanguageTime
    }); // goalHistory
}

// Update statistics
function updateStats() {
    chrome.storage.sync.get(['goalHistory'], (result) => {
        const goalHistory = result.goalHistory || {};
    getDailyLanguageTime((dailyLanguageTime) => {

        // Calculate total hours for current language
        let totalSeconds = 0;
        for (const date in dailyLanguageTime) {
            if (dailyLanguageTime[date][currentLanguage]) {
                totalSeconds += dailyLanguageTime[date][currentLanguage];
            }
        }
        const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
        document.getElementById('totalHoursValue').textContent = totalHours;

        // Calculate day streak (ending yesterday)
        let streak = 0;
        let hasFlameToday = false;

        // Start from yesterday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        today.setDate(today.getDate());
        const todayStr = today.toLocaleDateString("en-CA");


        const todayData = dailyLanguageTime[todayStr];
        const todayMinutes =
            todayData && todayData[currentLanguage]
                ? Math.floor(todayData[currentLanguage] / 60)
                : 0;

        const todayGoalVal = getGoalForDate(currentLanguage, todayStr, goalHistory);
        if (todayMinutes >= todayGoalVal) {
            streak += 1;
            hasFlameToday = true;
        }

        let checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - 1); // start from yesterday

        while (true) {
            const dateStr = checkDate.toLocaleDateString("en-CA"); // or region-agnostic helper
            const dayData = dailyLanguageTime[dateStr];
            const dayMinutes =
                dayData && dayData[currentLanguage]
                    ? Math.floor(dayData[currentLanguage] / 60)
                    : 0;

            const pastGoal = getGoalForDate(currentLanguage, dateStr, goalHistory);
            if (dayMinutes >= pastGoal) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1); // go back one day
            } else {
                break; // stop streak
            }
        }
        renderStreakFlame(todayMinutes, todayGoalVal, streak);

    }); // getDailyLanguageTime
    }); // goalHistory
}

// Goal editing functions
function openGoalEditor() {
    document.getElementById('goalDisplay').style.display = 'none';
    document.getElementById('goalEditor').style.display = 'flex';
    document.getElementById('goalHint').style.display = 'block';
    const input = document.getElementById('goalInput');
    input.value = dailyGoal;
    input.focus();
    input.select();
}

function closeGoalEditor() {
    document.getElementById('goalEditor').style.display = 'none';
    document.getElementById('goalHint').style.display = 'none';
    document.getElementById('goalDisplay').style.display = 'flex';
}

function saveGoal() {
    const raw = parseInt(document.getElementById('goalInput').value, 10);
    if (Number.isFinite(raw) && raw > 0) {
        dailyGoal = Math.round(raw);
        const today = getLocalToday();
        chrome.storage.sync.get('goalHistory', (result) => {
            const goalHistory = result.goalHistory || {};
            if (!goalHistory[currentLanguage]) goalHistory[currentLanguage] = [];
            goalHistory[currentLanguage] = goalHistory[currentLanguage]
                .filter(e => e.date !== today);
            goalHistory[currentLanguage].push({ date: today, goal: dailyGoal });
            goalHistory[currentLanguage].sort((a, b) => a.date.localeCompare(b.date));
            chrome.storage.sync.set({ goalHistory }, () => {
                closeGoalEditor();
                renderCalendar();
                updateProgressDisplay();
                updateStats();
                updateChart();
            });
        });
    } else {
        closeGoalEditor();
    }
}

// Language selection modal
function toggleLanguageDropdown() {
    const dropdown = document.getElementById('langDropdown');
    if (dropdown.classList.contains('hidden')) {
        populateLangDropdown();
        dropdown.classList.remove('hidden');
    } else {
        dropdown.classList.add('hidden');
    }
}

function closeLangDropdown() {
    document.getElementById('langDropdown').classList.add('hidden');
}

function populateLangDropdown() {
    const dropdown = document.getElementById('langDropdown');
    dropdown.innerHTML = '';

    chrome.storage.sync.get(['goalHistory'], (result) => {
        const goalHistory = result.goalHistory || {};
        getDailyLanguageTime((dailyLanguageTime) => {
            watchedLanguages.forEach(langCode => {
                const langData = languageData[langCode];
                if (!langData) return;

                let totalSeconds = 0;
                for (const date in dailyLanguageTime) {
                    if (dailyLanguageTime[date][langCode]) {
                        totalSeconds += dailyLanguageTime[date][langCode];
                    }
                }
                const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;

                const item = document.createElement('div');
                item.className = 'lang-dropdown-item';
                if (langCode === currentLanguage) item.classList.add('selected');

                item.innerHTML = `
                    <img class="lang-dropdown-flag" src="${langData.flag}" alt="${langData.name}">
                    <div class="lang-dropdown-info">
                        <span class="lang-dropdown-name">${langData.name}</span>
                        <span class="lang-dropdown-hours">${totalHours}h total</span>
                    </div>
                `;

                item.addEventListener('click', () => {
                    currentLanguage = langCode;
                    chrome.storage.local.set({ selectedLanguage: currentLanguage });
                    chrome.storage.sync.get('goalHistory', (r) => {
                        const today = getLocalToday();
                        dailyGoal = getGoalForDate(currentLanguage, today, r.goalHistory || {});
                        document.getElementById('goalSepText').textContent = ` / ${dailyGoal} mins`;
                        document.getElementById('goalInput').value = dailyGoal;
                        updateCurrentLanguageDisplay();
                        renderCalendar();
                        updateProgressDisplay();
                        updateStats();
                        updateChart();
                        closeLangDropdown();
                    });
                });

                dropdown.appendChild(item);
            });

            const divider = document.createElement('div');
            divider.className = 'lang-dropdown-divider';
            dropdown.appendChild(divider);

            const manageItem = document.createElement('div');
            manageItem.className = 'lang-dropdown-item lang-dropdown-manage';
            manageItem.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                <span class="lang-dropdown-name">Manage Languages</span>
            `;
            manageItem.addEventListener('click', () => {
                closeLangDropdown();
                openWatchedLanguagesModal();
                switchSettingsTab('languages');
            });
            dropdown.appendChild(manageItem);
        });
    });
}

// Settings view
function switchSettingsTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.tab === tab)
    );
    document.querySelectorAll('.settings-tab-panel').forEach(panel =>
        panel.classList.toggle('hidden', panel.id !== 'tab-' + tab)
    );
}

function toggleWatchedLanguagesModal() {
    const isOpen = !document.getElementById('settingsView').classList.contains('hidden');
    if (isOpen) {
        closeWatchedLanguagesModal();
    } else {
        openWatchedLanguagesModal();
    }
}

function openWatchedLanguagesModal() {
    switchSettingsTab('general');
    populateWatchedLanguagesModal();
    loadCustomTrackers();
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('settingsView').classList.remove('hidden');
    document.getElementById('watchedLanguagesButton').classList.add('active');
}

function closeWatchedLanguagesModal() {
    document.getElementById('settingsView').classList.add('hidden');
    document.getElementById('mainView').classList.remove('hidden');
    document.getElementById('watchedLanguagesButton').classList.remove('active');
    updateChart();
}

function populateWatchedLanguagesModal() {
    const watchedGrid = document.getElementById('watchedLanguagesGrid');
    const availableGrid = document.getElementById('availableLanguagesGrid');

    watchedGrid.innerHTML = '';
    availableGrid.innerHTML = '';

    // Populate watched languages
    watchedLanguages.forEach(langCode => {
        const langData = languageData[langCode];
        if (!langData) return;

        const item = document.createElement('div');
        item.className = 'watched-language-item';
        item.innerHTML = `
            <img class="watched-language-flag" src="${langData.flag}" alt="${langData.name}">
            <div class="watched-language-name">${langData.name}</div>
            <button class="remove-language-button" data-language="${langCode}">×</button>
        `;

        watchedGrid.appendChild(item);
    });

    // Get available languages in alphabetical order
    const availableLanguages = Object.keys(languageData)
        .filter(langCode => !watchedLanguages.includes(langCode))
        .sort();

    // Populate available languages
    availableLanguages.forEach(langCode => {
        const langData = languageData[langCode];
        const item = document.createElement('div');
        item.className = 'available-language-item';
        item.innerHTML = `
            <img class="available-language-flag" src="${langData.flag}" alt="${langData.name}">
            <div class="available-language-name">${langData.name}</div>
        `;

        item.addEventListener('click', () => {
            if (!watchedLanguages.includes(langCode)) {
                watchedLanguages.push(langCode);
                chrome.storage.sync.set({ watchedLanguages });
                populateWatchedLanguagesModal();
            }
        });

        availableGrid.appendChild(item);
    });

    // Add remove button listeners
    document.querySelectorAll('.remove-language-button').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const langCode = button.dataset.language;
            showRemoveLanguageConfirmation(langCode);
        });
    });
}

function saveWatchedLanguages() {
    // language changes are auto-saved on click; nothing to save here
}

function persistLanguageChange() {
    chrome.storage.sync.set({ watchedLanguages });
    if (!watchedLanguages.includes(currentLanguage) && watchedLanguages.length > 0) {
        currentLanguage = watchedLanguages[0];
        chrome.storage.local.set({ selectedLanguage: currentLanguage });
        updateCurrentLanguageDisplay();
        renderCalendar();
        updateProgressDisplay();
        updateStats();
    }
}

// Remove language confirmation
function showRemoveLanguageConfirmation(langCode) {
    const langData = languageData[langCode];
    document.getElementById('confirmMessage').textContent =
        `Are you sure you want to remove ${langData.name} from tracking?`;

    const confirmYes = document.getElementById('confirmYes');
    confirmYes.onclick = () => {
        const removeHistory = document.getElementById('removeHistoryCheckbox').checked;
        removeLanguage(langCode, removeHistory);
        closeConfirmModal();
    };

    document.getElementById('confirmModal').classList.remove('hidden');
}

function removeLanguage(langCode, removeHistory) {
    // Remove from watched languages
    watchedLanguages = watchedLanguages.filter(lang => lang !== langCode);
    chrome.storage.sync.set({ watchedLanguages });

    // Switch away if the removed language was active
    if (currentLanguage === langCode && watchedLanguages.length > 0) {
        currentLanguage = watchedLanguages[0];
        chrome.storage.local.set({ selectedLanguage: currentLanguage });
        updateCurrentLanguageDisplay();
        renderCalendar();
        updateProgressDisplay();
        updateStats();
    }

    if (removeHistory) {
        // Remove all historical data for this language
        getDailyLanguageTime((dailyLanguageTime) => {
            for (const date in dailyLanguageTime) {
                if (dailyLanguageTime[date][langCode]) {
                    delete dailyLanguageTime[date][langCode];
                    if (Object.keys(dailyLanguageTime[date]).length === 0) {
                        delete dailyLanguageTime[date];
                    }
                }
            }
            setDailyLanguageTime(dailyLanguageTime, () => {
                renderCalendar();
                updateStats();
            });
        });
    }

    populateWatchedLanguagesModal();
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    document.getElementById('removeHistoryCheckbox').checked = false;
}

// Cache dailyLanguageTime and goalHistory for use in save/clear functions
let cachedDailyLanguageTime = {};
let cachedGoalHistory = {};

function openManualEntryModal() {
    if (!currentLanguage) return;

    chrome.storage.sync.get(['goalHistory'], (result) => {
        const goalHistory = result.goalHistory || {};
    getDailyLanguageTime((dailyLanguageTime) => {

        cachedDailyLanguageTime = dailyLanguageTime;
        cachedGoalHistory = goalHistory;

        // Parse date safely (append T00:00:00 to avoid UTC offset shifting the day)
        const date = new Date(selectedDate + 'T00:00:00');
        if (isNaN(date.getTime())) {
            closeManualEntryModal();
            return;
        }

        // Update modal header date — "Saturday, May 2, 2026"
        document.getElementById('modalDate').textContent =
            date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        // Show current logged minutes in the input
        const currentTime = (dailyLanguageTime[selectedDate] || {})[currentLanguage] || 0;
        const currentMinutes = Math.round(currentTime / 60);
        const input = document.getElementById('manualMinutes');
        input.value = currentMinutes;
        // Store original so Cancel can revert; current tracks the live committed value
        input.dataset.original = currentMinutes;
        input.dataset.current = currentMinutes;

        const validationMessage = document.getElementById('validationMessage');
        validationMessage.classList.add('hidden');
        validationMessage.textContent = '';

        input.dataset.replaceOnType = 'true';
        document.getElementById('manualEntryModal').classList.remove('hidden');
        setTimeout(() => {
            input.focus();
            input.setSelectionRange(0, 0);
        }, 50);
    }); // getDailyLanguageTime
    }); // goalHistory
}

function closeManualEntryModal() {
    // Revert input to original value so a re-open shows stale state correctly
    const input = document.getElementById('manualMinutes');
    if (input.dataset.original !== undefined) {
        input.value = input.dataset.original;
    }
    document.getElementById('manualEntryModal').classList.add('hidden');
    selectedDate = null;
    document.querySelectorAll('.day.selected').forEach(d => d.classList.remove('selected'));
}

/**
 * applyDelta — parses the raw input string, which may be a bare number,
 * "+N", or "-N", applies the delta to the current displayed value,
 * clamps to [0, 1440], updates the input, and returns the new total.
 * Returns null if the input is empty/invalid.
 */
/**
 * isDelta — returns true if the raw value starts with + or -
 */
function isDelta(raw) {
    return raw.startsWith('+') || (raw.startsWith('-') && raw.length > 1);
}

/**
 * applyDelta — applies the input value as either a delta (+/-N) or
 * an absolute number, clamped to [0, 1440].
 * Updates input.value and input.dataset.current.
 * Returns the new total, or null if invalid/empty.
 */
function applyDelta(input) {
    const raw = input.value.trim();
    if (raw === '' || raw === '+' || raw === '-') return null;

    const current = parseInt(input.dataset.current ?? '0', 10);
    let newTotal;

    if (isDelta(raw)) {
        const delta = parseInt(raw, 10);
        if (isNaN(delta)) return null;
        newTotal = Math.max(0, Math.min(1440, current + delta));
    } else {
        const abs = parseInt(raw, 10);
        if (isNaN(abs)) return null;
        newTotal = Math.max(0, Math.min(1440, abs));
    }

    input.value = newTotal;
    input.dataset.current = newTotal;
    return newTotal;
}

function saveManualTime() {
    const input = document.getElementById('manualMinutes');
    const validationMessage = document.getElementById('validationMessage');

    if (!selectedDate) return;

    // Resolve the input value to a final minute count
    const raw = input.value.trim();
    let newTotalMinutes;
    if (isDelta(raw)) {
        // e.g. "+10" or "-5" — apply against current baseline
        newTotalMinutes = applyDelta(input);
        if (newTotalMinutes === null) return;
    } else {
        // Bare number — use it directly, clamped to [0, 1440]
        const parsed = parseInt(raw, 10);
        if (isNaN(parsed)) return;
        newTotalMinutes = Math.max(0, Math.min(1440, parsed));
    }

    // Write directly to this language's shard — avoids overwriting concurrent
    // background tracking writes that land between the snapshot read and the write.
    const year = parseInt(selectedDate.slice(0, 4));
    const dayIdx = String(dateToDayIndex(selectedDate));
    const shardKey = dltKey(currentLanguage, year);

    chrome.storage.sync.get(shardKey, (result) => {
        const shard = result[shardKey] || {};
        if (newTotalMinutes === 0) {
            delete shard[dayIdx];
        } else {
            shard[dayIdx] = newTotalMinutes * 60;
        }
        chrome.storage.sync.set({ [shardKey]: shard }, () => {
            renderCalendar();
            updateProgressDisplay();
            updateStats();
            updateChart();
            closeManualEntryModal();
        });
    });
}

function resetManualTime() {
    if (!selectedDate) return;

    // Write directly to this language's shard — avoids overwriting concurrent
    // background tracking writes for other days.
    const year = parseInt(selectedDate.slice(0, 4));
    const dayIdx = String(dateToDayIndex(selectedDate));
    const shardKey = dltKey(currentLanguage, year);

    chrome.storage.sync.get(shardKey, (result) => {
        const shard = result[shardKey] || {};
        const currentTimeSeconds = shard[dayIdx] || 0;

        if (currentTimeSeconds === 0) {
            const validationMessage = document.getElementById('validationMessage');
            validationMessage.textContent = 'No watch time recorded for this day yet.';
            validationMessage.className = 'validation-message error';
            validationMessage.classList.remove('hidden');
            return;
        }

        delete shard[dayIdx];
        chrome.storage.sync.set({ [shardKey]: shard }, () => {
            renderCalendar();
            updateProgressDisplay();
            updateStats();
            updateChart();
            closeManualEntryModal();
        });
    });
}

// ── Custom Trackers ───────────────────────────────────────────────────────────

function loadCustomTrackers() {
    chrome.storage.sync.get(['customTrackers'], (result) => {
        customTrackers = result.customTrackers || [];
        renderCustomTrackers();
    });
}

function renderCustomTrackers() {
    const list = document.getElementById('customTrackersList');
    if (!list) return;
    list.innerHTML = '';

    if (customTrackers.length === 0) {
        list.innerHTML = `
            <div class="mt-empty">
                <div class="mt-empty__icon">📺</div>
                <p class="mt-empty__title">No custom trackers yet</p>
                <p class="mt-empty__hint">Track time on a specific show, site, or activity.</p>
            </div>
        `;
        return;
    }

    customTrackers.forEach((tracker, index) => {
        const item = document.createElement('div');
        item.className = 'custom-tracker-item';
        const pattern = tracker.urlPattern ? `  ·  /${tracker.urlPattern}` : '  ·  all pages';
        item.innerHTML = `
            <div class="custom-tracker-info">
                <span class="custom-tracker-name">${tracker.name}</span>
                <span class="custom-tracker-meta">${tracker.hostname}${pattern}</span>
            </div>
            <button class="remove-custom-tracker-btn" data-index="${index}" title="Remove">✕</button>
        `;
        list.appendChild(item);
    });

    list.querySelectorAll('.remove-custom-tracker-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            customTrackers.splice(parseInt(btn.dataset.index), 1);
            chrome.storage.sync.set({ customTrackers });
            renderCustomTrackers();
        });
    });
}

function openCustomTrackerModal() {
    document.getElementById('ctName').value = '';
    document.getElementById('ctHostname').value = '';
    document.getElementById('ctUrlPattern').value = '';
    document.getElementById('ctSelectorType').value = 'video';
    document.getElementById('ctCustomSelector').value = '';
    document.getElementById('ctCustomSelector').classList.add('hidden');
    document.getElementById('customTrackerModal').classList.remove('hidden');
}

function closeCustomTrackerModal() {
    document.getElementById('customTrackerModal').classList.add('hidden');
}

function addCustomTracker() {
    const name        = document.getElementById('ctName').value.trim();
    const hostname    = document.getElementById('ctHostname').value.trim().replace(/^https?:\/\//, '').split('/')[0];
    const urlPattern  = document.getElementById('ctUrlPattern').value.trim();
    const selectorType = document.getElementById('ctSelectorType').value;
    const customSel   = document.getElementById('ctCustomSelector').value.trim();

    if (!name || !hostname) {
        showGrowlNotification('Name and hostname are required', 'disabled');
        return;
    }

    if (customTrackers.some(t => t.hostname === hostname)) {
        showGrowlNotification(`Tracker for ${hostname} already exists`, 'disabled');
        return;
    }

    const videoSelector = selectorType === 'custom' ? (customSel || 'video') : selectorType;

    customTrackers.push({ name, hostname, urlPattern, videoSelector });
    chrome.storage.sync.set({ customTrackers });
    renderCustomTrackers();
    closeCustomTrackerModal();
    showGrowlNotification(`Tracker added for ${hostname}`, 'enabled');
}

// ── Storage helpers ───────────────────────────────────────────────────────────
// Structure: {language}_{year} → { dayIndex: seconds }
// dayIndex is 0-based day of year (Jan 1 = 0, Dec 31 = 364/365)

function dateToDayIndex(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.round((d - start) / 86400000);
}

function dayIndexToDate(year, dayIndex) {
    const d = new Date(year, 0, 1 + dayIndex);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
}

function dltKey(lang, year) { return lang + '_' + year; }

// Expand all storage formats into a single flat dailyLanguageTime object.
// Reads new {lang}_{year} keys and legacy dlt_YYYY / dailyLanguageTime keys.
function expandDlt(rawData) {
    const dlt = {};
    const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    // New format: {lang}_{year} → { dayIndex: seconds }
    // Must NOT match "dlt_YYYY" — those are the old shard format handled below.
    for (const key in rawData) {
        const match = key.match(/^([a-z]+)_(\d{4})$/);
        if (match && match[1] !== 'dlt') {
            const lang = match[1], year = parseInt(match[2]);
            const shard = rawData[key];
            if (typeof shard !== 'object' || shard === null) continue;
            for (const dayIdx in shard) {
                const seconds = shard[dayIdx];
                if (typeof seconds !== 'number') continue; // skip corrupted nested objects
                const dateStr = dayIndexToDate(year, parseInt(dayIdx));
                if (!dlt[dateStr]) dlt[dateStr] = {};
                dlt[dateStr][lang] = (dlt[dateStr][lang] || 0) + seconds;
            }
        }
    }

    // Legacy dlt_YYYY shards: { "YYYY-MM-DD": { lang: seconds } }
    for (const key in rawData) {
        if (/^dlt_\d{4}$/.test(key)) {
            const shard = rawData[key];
            if (typeof shard !== 'object' || shard === null) continue;
            for (const dateStr in shard) {
                if (!isDateStr(dateStr)) continue; // skip bare day-index keys from mixed-format data
                const langs = shard[dateStr];
                if (typeof langs !== 'object' || langs === null) continue;
                if (!dlt[dateStr]) dlt[dateStr] = {};
                for (const lang in langs) {
                    const v = langs[lang];
                    if (typeof v === 'number') {
                        dlt[dateStr][lang] = Math.max(dlt[dateStr][lang] || 0, v);
                    }
                }
            }
        }
    }

    // Legacy flat dailyLanguageTime key: { "YYYY-MM-DD": { lang: seconds } }
    if (rawData.dailyLanguageTime && typeof rawData.dailyLanguageTime === 'object') {
        for (const dateStr in rawData.dailyLanguageTime) {
            if (!isDateStr(dateStr)) continue; // skip bare numbers or other garbage keys
            const langs = rawData.dailyLanguageTime[dateStr];
            if (typeof langs !== 'object' || langs === null) continue;
            if (!dlt[dateStr]) dlt[dateStr] = {};
            for (const lang in langs) {
                const v = langs[lang];
                if (typeof v === 'number') dlt[dateStr][lang] = Math.max(dlt[dateStr][lang] || 0, v);
            }
        }
    }

    return dlt;
}

// Shard a flat dailyLanguageTime object into {lang}_{year} keys.
function shardDlt(dlt) {
    const shards = {};
    for (const dateStr in dlt) {
        const year = parseInt(dateStr.slice(0, 4));
        const dayIdx = String(dateToDayIndex(dateStr));
        for (const lang in dlt[dateStr]) {
            const key = dltKey(lang, year);
            if (!shards[key]) shards[key] = {};
            shards[key][dayIdx] = dlt[dateStr][lang];
        }
    }
    return shards;
}

function writeShardedDlt(shards, callback) {
    const keys = Object.keys(shards);
    if (keys.length === 0) return callback(null);
    let i = 0;
    function next() {
        if (i >= keys.length) return callback(null);
        const key = keys[i++];
        chrome.storage.sync.set({ [key]: shards[key] }, () => {
            if (chrome.runtime.lastError) return callback(chrome.runtime.lastError.message);
            next();
        });
    }
    next();
}

function getDailyLanguageTime(callback) {
    chrome.storage.sync.get(null, (syncData) => {
        chrome.storage.local.get(null, (localData) => {
            const dlt = expandDlt(syncData);
            // Merge in any legacy data that may still live in local storage.
            // Take the max so we never lose seconds from either source.
            const localDlt = expandDlt(localData);
            for (const date in localDlt) {
                if (!dlt[date]) dlt[date] = {};
                for (const lang in localDlt[date]) {
                    dlt[date][lang] = Math.max(dlt[date][lang] || 0, localDlt[date][lang]);
                }
            }
            callback(dlt);
        });
    });
}

// Write dlt in new format, removing any shard keys no longer present.
function setDailyLanguageTime(dlt, callback) {
    chrome.storage.sync.get(null, (all) => {
        const shards = shardDlt(dlt);

        // Keys to remove: legacy formats + existing shards not in the new data
        const keysToRemove = Object.keys(all).filter(k =>
            k === 'dailyLanguageTime' ||
            /^dlt_\d{4}$/.test(k) ||
            (/^[a-z]+_\d{4}$/.test(k) && !(k in shards))
        );

        const doWrite = () => writeShardedDlt(shards, () => { if (callback) callback(); });
        if (keysToRemove.length > 0) {
            chrome.storage.sync.remove(keysToRemove, doWrite);
        } else {
            doWrite();
        }
    });
}

// Migrate chrome.storage.local data into chrome.storage.sync.
// dailyLanguageTime is sharded into per-year keys to stay under the 8KB/item limit.
function migrateLocalToSync() {
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = 'Reading local storage…';
    statusEl.className = 'sync-status';

    chrome.storage.local.get(null, (localData) => {
        if (chrome.runtime.lastError) {
            statusEl.textContent = '✕ Could not read local data';
            statusEl.className = 'sync-status error';
            return;
        }

        if (!localData || Object.keys(localData).length === 0) {
            statusEl.textContent = 'No local data found';
            statusEl.className = 'sync-status';
            return;
        }

        chrome.storage.sync.get(null, (syncData) => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = '✕ Could not read sync storage';
                statusEl.className = 'sync-status error';
                return;
            }

            // ── Merge dailyLanguageTime ──────────────────────────────────────
            const localDlt  = localData.dailyLanguageTime || {};
            const syncDlt   = expandDlt(syncData);
            const mergedDlt = Object.assign({}, localDlt);
            for (const date in syncDlt) {
                if (!mergedDlt[date]) {
                    mergedDlt[date] = syncDlt[date];
                } else {
                    for (const lang in syncDlt[date]) {
                        mergedDlt[date][lang] = Math.max(
                            mergedDlt[date][lang] || 0,
                            syncDlt[date][lang]
                        );
                    }
                }
            }

            // ── Merge goalHistory ────────────────────────────────────────────
            const localGoals  = localData.goalHistory  || {};
            const syncGoals   = syncData.goalHistory   || {};
            const mergedGoals = Object.assign({}, localGoals);
            for (const lang in syncGoals) {
                if (!mergedGoals[lang]) {
                    mergedGoals[lang] = syncGoals[lang];
                } else {
                    const combined = [...mergedGoals[lang], ...syncGoals[lang]];
                    const byDate = {};
                    combined.forEach(e => { byDate[e.date] = e; });
                    mergedGoals[lang] = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
                }
            }

            // ── Write settings ───────────────────────────────────────────────
            // Only synced keys go to sync storage
            const settings = {
                goalHistory:      mergedGoals,
                watchedLanguages: syncData.watchedLanguages  || localData.watchedLanguages,
            };
            // Local-only keys stay in local storage
            const localSettings = {};
            if (localData.selectedLanguage) localSettings.selectedLanguage = localData.selectedLanguage;
            if (localData.trackingEnabled !== undefined) localSettings.trackingEnabled = localData.trackingEnabled;
            if (Object.keys(localSettings).length > 0) chrome.storage.local.set(localSettings);

            statusEl.textContent = 'Writing settings…';
            chrome.storage.sync.set(settings, () => {
                if (chrome.runtime.lastError) {
                    statusEl.textContent = '✕ Settings write failed: ' + chrome.runtime.lastError.message;
                    statusEl.className = 'sync-status error';
                    return;
                }

                // ── Write sharded dlt keys ───────────────────────────────────
                statusEl.textContent = 'Writing watch time…';
                const shards = shardDlt(mergedDlt);
                writeShardedDlt(shards, (err) => {
                    if (err) {
                        statusEl.textContent = '✕ Watch time write failed: ' + err;
                        statusEl.className = 'sync-status error';
                        return;
                    }

                    // Remove old flat dailyLanguageTime key if present
                    chrome.storage.sync.remove('dailyLanguageTime', () => {
                        statusEl.textContent = '✓ Migrated successfully';
                        statusEl.className = 'sync-status success';
                        loadSettings();
                        renderCalendar();
                        updateProgressDisplay();
                        updateStats();
                        updateChart();
                        setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'sync-status'; }, 4000);
                    });
                });
            });
        });
    });
}

// Export/Import functionality
function exportData() {
    chrome.storage.sync.get(null, (syncAll) => {
        chrome.storage.local.get(null, (localAll) => {
            // Merge sync + local so legacy local-storage data is included.
            const dlt = expandDlt(syncAll);
            const localDlt = expandDlt(localAll);
            for (const date in localDlt) {
                if (!dlt[date]) dlt[date] = {};
                for (const lang in localDlt[date]) {
                    dlt[date][lang] = Math.max(dlt[date][lang] || 0, localDlt[date][lang]);
                }
            }
            const data = {
                dailyLanguageTime: dlt,
                goalHistory: syncAll.goalHistory || {},
                watchedLanguages: syncAll.watchedLanguages || [],
                exportDate: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mrtracksit-data-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    });
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (data.dailyLanguageTime) {
                const toStore = { watchedLanguages: data.watchedLanguages || [] };
                if (data.goalHistory) toStore.goalHistory = data.goalHistory;
                chrome.storage.sync.set(toStore, () => { // watchedLanguages + goalHistory synced
                setDailyLanguageTime(data.dailyLanguageTime, () => {
                    loadSettings();
                    renderCalendar();
                    updateProgressDisplay();
                    updateStats();
                    updateChart();
                    alert('Data imported successfully!');
                }); // setDailyLanguageTime
                }); // sync.set
            }
        } catch (error) {
            alert('Error importing data: Invalid file format');
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// Refresh all UI — called on focus and on storage changes
function refreshAll() {
    loadSettings();
    renderCalendar();
    updateProgressDisplay();
    updateStats();
    updateChart();
}

// Pull latest sync data whenever the side panel regains focus
// (catches changes written by another machine while this panel was closed)
window.addEventListener('focus', () => refreshAll());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll();
});

// Listen for storage changes to update display
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        // Synced keys: lang_YYYY shards, legacy dlt_YYYY, goalHistory, watchedLanguages
        const hasDltChange = Object.keys(changes).some(k =>
            k === 'dailyLanguageTime' ||
            /^dlt_\d{4}$/.test(k) ||
            (/^[a-z]+_\d{4}$/.test(k) && !k.startsWith('dlt_'))
        );
        if (hasDltChange || changes.goalHistory || changes.watchedLanguages) {
            setTimeout(() => refreshAll(), 100);
        }
    }

    if (namespace === 'local') {
        // Local-only keys: selectedLanguage, trackingEnabled
        if (changes.selectedLanguage) {
            currentLanguage = changes.selectedLanguage.newValue;
            setTimeout(() => refreshAll(), 100);
        }
        if (changes.trackingEnabled !== undefined) {
            trackingEnabled = changes.trackingEnabled.newValue;
            updateTrackingStatus();
        }
    }
});
// ═══════════════════════════════════════════════════
// WATCH TIME CHART — pure Canvas 2D, no external libs
// ═══════════════════════════════════════════════════
let chartPeriod = 7; // 7, 30, 90, or 180
let _chartPts = [];   // {x, y} in CSS px — set each render for hover
let _chartDates = []; // date strings matching _chartPts
let _chartMins = [];  // minutes matching _chartPts

function setupChart() {
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            chartPeriod = parseInt(tab.dataset.period);
            updateChart();
        });
    });
    updateChart();
}

function updateChart() {
    chrome.storage.sync.get(['goalHistory'], (goalResult) => {
    getDailyLanguageTime((dlt) => {
        const result = goalResult; // keep compat
        const goalHistory = goalResult.goalHistory || {};
        const todayStr = getLocalToday();

        const windowDates = lastNDays(todayStr, chartPeriod);

        const minutes = windowDates.map(d =>
            Math.floor(((dlt[d] || {})[currentLanguage] || 0) / 60)
        );

        renderChart(windowDates, minutes, goalHistory);
    }); // getDailyLanguageTime
    }); // goalHistory
}

function lastNDays(todayStr, n) {
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(todayStr + 'T00:00:00');
        d.setDate(d.getDate() - i);
        dates.push(d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0'));
    }
    return dates;
}

function fillDateRange(startStr, endStr) {
    const dates = [];
    const cur = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    while (cur <= end) {
        dates.push(cur.getFullYear() + '-' +
            String(cur.getMonth() + 1).padStart(2, '0') + '-' +
            String(cur.getDate()).padStart(2, '0'));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function renderChart(dates, minutes, goalHistory) {
    const canvas = document.getElementById('watchTimeChart');
    const emptyEl = document.getElementById('chartEmpty');
    const avgEl = document.getElementById('chartAvg');
    const bestEl = document.getElementById('chartBest');
    const daysEl = document.getElementById('chartDays');

    if (!canvas) return;

    const hasData = minutes.some(m => m > 0);

    if (!hasData) {
        emptyEl.classList.remove('hidden');
        const tmpCtx = canvas.getContext('2d');
        tmpCtx.clearRect(0, 0, canvas.width, canvas.height);
        avgEl.textContent = '—';
        bestEl.textContent = '—';
        daysEl.textContent = '—';
        return;
    }

    emptyEl.classList.add('hidden');

    // Summary stats (active days only)
    const activeMins = minutes.filter(m => m > 0);
    const avgMins = Math.round(activeMins.reduce((a, b) => a + b, 0) / activeMins.length);
    const bestMins = Math.max(...minutes);
    avgEl.textContent = `${avgMins}m`;
    bestEl.textContent = `${bestMins}m`;
    daysEl.textContent = `${activeMins.length}`;

    // CSS variables → colours
    const lineCol     = cssVar('--mt-chart-line')  || cssVar('--hit-bg');
    const gridCol     = cssVar('--mt-chart-grid')  || cssVar('--border');
    const labelCol    = cssVar('--mt-chart-axis')  || cssVar('--text-3');
    const goalCol     = cssVar('--mt-chart-goal')  || cssVar('--text-2');
    const surfaceCol  = cssVar('--surface');
    const fillStart   = cssVar('--mt-chart-fill-start');
    const fillEnd     = cssVar('--mt-chart-fill-end');

    // Size canvas to container (HiDPI-aware)
    const container = canvas.parentElement;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const padL = 36, padR = 26, padT = 12, padB = 28;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const n = dates.length;

    // Y scale — use max of all per-day goals and best minutes
    const maxGoal = Math.max(...dates.map(d => getGoalForDate(currentLanguage, d, goalHistory)));
    const niceMax = niceNumber(Math.max(bestMins, maxGoal + 1));
    const yTicks = makeYTicks(niceMax, 4);

    function xPx(i) { return padL + (i / Math.max(n - 1, 1)) * chartW; }
    function yPx(val) { return padT + chartH - (val / niceMax) * chartH; }

    // Grid lines + Y labels
    ctx.font = '500 9px "DM Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTicks.forEach(tick => {
        const y = yPx(tick);
        ctx.fillStyle = labelCol;
        ctx.fillText(tick + 'm', padL - 6, y);
        ctx.strokeStyle = gridCol;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + chartW, y);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Per-day goal line — draw segments between goal change points
    // Group consecutive dates with the same goal into segments
    if (dates.length > 0) {
        ctx.strokeStyle = goalCol;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let drawing = false;
        for (let i = 0; i < n; i++) {
            const g = getGoalForDate(currentLanguage, dates[i], goalHistory);
            const gy = yPx(g);
            if (!drawing) { ctx.moveTo(xPx(i), gy); drawing = true; }
            else { ctx.lineTo(xPx(i), gy); }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Data points
    const pts = minutes.map((m, i) => ({ x: xPx(i), y: yPx(m) }));

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    grad.addColorStop(0, fillStart || hexToRgba(lineCol, 0.25));
    grad.addColorStop(1, fillEnd   || hexToRgba(lineCol, 0.02));

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
    ctx.lineTo(pts[0].x, padT + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots (only when not too dense)
    if (n <= 31) {
        minutes.forEach((m, i) => {
            ctx.beginPath();
            ctx.arc(xPx(i), yPx(m), 3, 0, Math.PI * 2);
            ctx.fillStyle = lineCol;
            ctx.fill();
            ctx.strokeStyle = surfaceCol;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }

    // X-axis labels
    const maxXLabels = Math.floor(chartW / 38);
    const step = Math.max(1, Math.ceil(n / maxXLabels));
    const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    ctx.fillStyle = labelCol;
    ctx.font = '500 9px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < n; i++) {
        if (i % step !== 0) continue;
        const [, mo, dy] = dates[i].split('-');
        ctx.fillText(`${monthAbbr[parseInt(mo) - 1]} ${parseInt(dy)}`, xPx(i), padT + chartH + 6);
    }

    // Store for hover tooltip
    _chartPts   = pts;
    _chartDates = dates;
    _chartMins  = minutes;

    // Hover tooltip
    const tipEl = document.getElementById('mt-tip');
    if (tipEl) {
        const monthAbbr2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            let best = 0, bestD = Infinity;
            _chartPts.forEach((p, i) => {
                const d = Math.abs(p.x - mouseX);
                if (d < bestD) { bestD = d; best = i; }
            });
            const p = _chartPts[best];
            const [, mo, dy] = _chartDates[best].split('-');
            const label = `${monthAbbr2[parseInt(mo)-1]} ${parseInt(dy)}`;
            tipEl.hidden = false;
            tipEl.style.left = `${p.x}px`;
            tipEl.style.top  = `${p.y}px`;
            tipEl.innerHTML = `<div class="mt-tip__day">${label}</div><div class="mt-tip__val">${Math.round(_chartMins[best])}m</div>`;
        };
        canvas.onmouseleave = () => { tipEl.hidden = true; };
    }
}

// ── Canvas helpers ────────────────────────────────────────────────────────────
function niceNumber(val) {
    if (val <= 0) return 10;
    const exp = Math.floor(Math.log10(val));
    const frac = val / Math.pow(10, exp);
    const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
    return nice * Math.pow(10, exp);
}

function makeYTicks(maxVal, count) {
    const step = maxVal / count;
    const ticks = [];
    for (let i = 1; i <= count; i++) ticks.push(Math.round(step * i));
    return ticks;
}

function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Redraw on panel resize
window.addEventListener('resize', () => updateChart());
