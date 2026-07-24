// shared-content.js - Common functionality for all streaming platforms
let currentLanguage = 'english';
let intervalId = null;
let watchedLanguages = ['english', 'spanish', 'french', 'german', 'russian', 'japanese', 'chinese', 'esperanto'];
let currentLanguageIndex = 0;
let isInitialized = false;
let trackingEnabled = true;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// URL change detection variables
let currentUrl = location.href;
let lastUrl = location.href;
let urlObserver = null;

// Precise tracking variables
let totalTime = 0;
let lastTime = 0;
let isPlaying = false;
let videoElement = null;

// Platform configuration
const PLATFORM_CONFIG = {
    youtube: {
        name: 'YouTube',
        urlPatterns: ['watch', 'shorts'],
        videoSelectors: ['video'],
        icon: '⏱️',
        font: "'Roboto', 'Arial', sans-serif"
    },
    netflix: {
        name: 'Netflix',
        urlPatterns: ['watch'],
        videoSelectors: ['video', '.VideoContainer video', '[data-uia="video-canvas"] video'],
        icon: '🎬',
        font: "'Netflix Sans', 'Helvetica Neue', 'Arial', sans-serif"
    },
    disneyplus: {
        name: 'Disney+',
        urlPatterns: ['play'],
        videoSelectors: ['video', '.video-player video', '[data-testid="video-player"] video'],
        icon: '🏰',
        font: "'Avenir Next', 'Helvetica Neue', 'Arial', sans-serif"
    },
    hbomax: {
        name: 'HBO Max',
        urlPatterns: ['video'],
        videoSelectors: ['video'],
        icon: '🎭',
        font: "'Helvetica Neue', 'Arial', sans-serif"
    },
    plex: {
        name: 'Plex',
        urlPatterns: ['web'],
        videoSelectors: ['video'],
        icon: '⏱️',
        font: "'Roboto', 'Arial', sans-serif"
    },
    dreamingspanish: {
        name: 'Dreaming Spanish',
        urlPatterns: ['watch'],
        videoSelectors: ['video', '.video-js video', '.vjs-tech'],
        icon: '🌟',
        font: "'Inter', 'Helvetica Neue', 'Arial', sans-serif"
    }
};

// Detect current platform
function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('netflix.com')) return 'netflix';
    if (hostname.includes('disneyplus.com')) return 'disneyplus';
    if (hostname.includes('hbomax.com') || hostname.includes('play.hbomax.com')) return 'hbomax';
    if (hostname.includes('127.0.0.1')) return 'plex';
    if (hostname.includes('app.dreaming.com')) return 'dreamingspanish';
    return null;
}

let currentPlatform = detectPlatform();
let platformConfig = PLATFORM_CONFIG[currentPlatform];

// Check if the extension context is still valid before making chrome API calls.
// Returns false (and silently stops) if the extension was reloaded/updated.
function isContextValid() {
    try {
        return !!chrome.runtime?.id;
    } catch (e) {
        return false;
    }
}

// Safely wrap any chrome API call — no-ops silently if context is gone.
function safeChrome(fn) {
    if (!isContextValid()) {
        console.log('MrTracksIt: Extension context invalidated, stopping.');
        stopTracking();
        return;
    }
    try {
        fn();
    } catch (e) {
        if (e.message?.includes('Extension context invalidated')) {
            stopTracking();
        } else {
            console.error('MrTracksIt error:', e);
        }
    }
}

// Load saved settings
function loadSettings() {
    return new Promise((resolve) => {
        if (!isContextValid()) { resolve(); return; }
        chrome.storage.local.get(['selectedLanguage', 'trackingEnabled'], (localResult) => {
            if (localResult.selectedLanguage) currentLanguage = localResult.selectedLanguage;
            if (localResult.trackingEnabled !== undefined) trackingEnabled = localResult.trackingEnabled;
            chrome.storage.sync.get(['watchedLanguages'], (syncResult) => {
            if (syncResult.watchedLanguages && syncResult.watchedLanguages.length > 0) {
                watchedLanguages = syncResult.watchedLanguages;
            }

            // Find current language index in watched languages
            currentLanguageIndex = watchedLanguages.indexOf(currentLanguage);
            if (currentLanguageIndex === -1) {
                currentLanguageIndex = 0;
                currentLanguage = watchedLanguages[0] || 'english';
            }

            console.log(`${platformConfig.name} - Settings loaded:`, {
                currentLanguage,
                trackingEnabled
            });
            resolve();
            }); // sync.get
        }); // local.get
    });
}

// Show growl notification
function showGrowlNotification(message, type = 'info') {
    // Remove any existing notifications
    const notificationId = `${currentPlatform}-lang-tracker-notification`;
    const existingNotification = document.getElementById(notificationId);
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'info' ? '#4CAF50' :
            type === 'switch' ? '#2196F3' :
                type === 'enabled' ? '#4CAF50' :
                    type === 'disabled' ? '#f44336' :
                        '#4CAF50'
        };
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        font-family: ${platformConfig.font};
        font-size: 16px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 2147483647;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.4s ease;
        max-width: 350px;
    `;
    let iconHtml;
    if (type === 'enabled') {
        iconHtml = '✅';
    } else if (type === 'disabled') {
        iconHtml = '⏹️';
    } else if (type === 'flag') {
        const flagUrl = chrome.runtime.getURL('flags/' + currentLanguage + '.svg');
        iconHtml = '<img src="' + flagUrl + '" style="width:28px;height:28px;border-radius:5px;object-fit:cover;" />';
    } else {
        iconHtml = platformConfig.icon;
    }

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 20px; display:flex; align-items:center;">${iconHtml}</div>
            <div>${message}</div>
        </div>
    `;

    document.body.appendChild(notification);

    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification && notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 400);
    }, 3500);
}

// Toggle tracking on/off
function toggleTracking() {
    trackingEnabled = !trackingEnabled;
    safeChrome(() => chrome.storage.local.set({ trackingEnabled }));

    if (trackingEnabled) {
        if (isOnVideoPage(location.href)) {
            startTracking();
        }
        showGrowlNotification(`${platformConfig.name} Tracking ENABLED<br>(Ctrl+Shift+Y to switch languages)`, 'enabled');
    } else {
        stopTracking();
        showGrowlNotification(`${platformConfig.name} Tracking DISABLED<br>(Ctrl+Shift+D to re-enable)`, 'disabled');
    }

    console.log(`${platformConfig.name} - Tracking toggled:`, trackingEnabled ? 'ENABLED' : 'DISABLED');
}

function switchToNextLanguage() {
    if (watchedLanguages.length === 0) {
        watchedLanguages = ['english'];
        currentLanguageIndex = 0;
        currentLanguage = 'english';
    } else {
        currentLanguageIndex = (currentLanguageIndex + 1) % watchedLanguages.length;
        currentLanguage = watchedLanguages[currentLanguageIndex];
    }

    safeChrome(() => chrome.storage.local.set({ selectedLanguage: currentLanguage }));

    const capitalizedLanguage = currentLanguage.charAt(0).toUpperCase() + currentLanguage.slice(1);
    showGrowlNotification(`Switched to ${capitalizedLanguage}`, 'flag');

    console.log(`${platformConfig.name} - Switched to language:`, currentLanguage);
}

// Check if we're on a video page
function isOnVideoPage(url) {
    if (url === undefined) {
        return false;
    }
    for (const pattern of platformConfig.urlPatterns) {
        if (url.includes(pattern)) {
            return true;
        }
    }

    return false;
}

function findDisneyPlusVideo() {
    const videos = document.querySelectorAll('video');
    if (videos.length === 0) return null;

    // Disney+ usually has exactly one active video
    for (const v of videos) {
        if (!isNaN(v.duration) && v.duration > 0) {
            return v;
        }
    }
    return null;
}

// Find video element using platform-specific selectors
function findVideoElement() {
    // Special handling for Disney+ which uses hivePlayer
    if (currentPlatform === 'disneyplus') {
        const player = findDisneyPlusVideo();
        if (player) {
            console.log({
                currentTime: player.currentTime,
                paused: player.paused,
                duration: player.duration,
                readyState: player.readyState
            });
            return player;
        } else {
            console.log(`${platformConfig.name} - hivePlayer not found, will retry later`);
            return null;
        }
    }



    // For YouTube and Netflix, use DOM video elements
    for (const selector of platformConfig.videoSelectors) {
        const video = document.querySelector(selector);
        if (video) {
            console.log(`${platformConfig.name} - Found video element with selector:`, selector);
            return video;
        }
    }

    console.log(`${platformConfig.name} - No video element found`);
    return null;
}

// Precise tracking functions
function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 8);
}

function updateTime(currentTime) {
    if (isPlaying && trackingEnabled) {
        const timeWatched = currentTime - lastTime;

        // Only count time if it's a reasonable increment
        if (timeWatched > 0.01 && timeWatched < 5) {
            totalTime += timeWatched;

            // Send to background script every 10 seconds of watch time
            if (Math.floor(totalTime) % 10 === 0 && Math.floor(totalTime) > Math.floor(totalTime - timeWatched)) {
                // Calculate local date instead of UTC
                const today = new Date();
                const localDateString = today.getFullYear() + '-' +
                    String(today.getMonth() + 1).padStart(2, '0') + '-' +
                    String(today.getDate()).padStart(2, '0');

                console.log(`${platformConfig.name} - Sending 10 seconds for ${currentLanguage} on local date: ${localDateString}`);
                safeChrome(() => {
                    chrome.runtime.sendMessage({
                        type: 'track_time',
                        language: currentLanguage,
                        time: 10,
                        platform: currentPlatform,
                        date: localDateString
                    }).catch(error => {
                        if (!error.message?.includes('Extension context invalidated')) {
                            console.log(`${platformConfig.name} - Message sending failed:`, error);
                        }
                    });
                });
            }
        }

        lastTime = currentTime;
    }
}

// Video event handlers
function handlePlay() {
    isPlaying = true;
    lastTime = videoElement.currentTime || 0;
    console.log(`${platformConfig.name} - Playback started.`);

    if (trackingEnabled) {
        // Always read the latest selectedLanguage from storage before showing the notification
        // so we never show the stale default 'english' if the user has changed it
        safeChrome(() => {
            chrome.storage.local.get('selectedLanguage', (result) => {
                if (result.selectedLanguage) currentLanguage = result.selectedLanguage;
                const capitalizedLanguage = currentLanguage.charAt(0).toUpperCase() + currentLanguage.slice(1);
                showGrowlNotification(`Now tracking ${capitalizedLanguage}`, 'flag');
            });
        });
    }
}

function handlePause() {
    isPlaying = false;
    updateTime(videoElement.currentTime || 0);
    console.log(`${platformConfig.name} - Playback paused.`);
}

function handleTimeUpdate() {
    if (isPlaying) {
        updateTime(videoElement.currentTime);
    }
}

function handleEnded() {
    updateTime(videoElement.currentTime || 0);
    console.log(`${platformConfig.name} - Playback ended.`);
}

function handleSeeking() {
    lastTime = videoElement.currentTime || 0;
    console.log(`${platformConfig.name} - Seeking, reset time tracking`);
}

// Start precise tracking
function startTracking() {
    if (!trackingEnabled) {
        console.log(`${platformConfig.name} - Tracking is disabled`);
        return;
    }

    videoElement = findVideoElement();
    if (!videoElement) {
        console.log(`${platformConfig.name} - No video element found`);
        return;
    }

    console.log(`${platformConfig.name} - Starting precise tracking for:`, currentLanguage);

    // Reset tracking variables
    totalTime = 0;
    lastTime = 0;
    isPlaying = false;

    // Add event listeners
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('ended', handleEnded);
    videoElement.addEventListener('seeking', handleSeeking);

    if (!videoElement.paused && !videoElement.ended && videoElement.currentTime > 0) {
        // Already playing
        handlePlay();
    }
    console.log(`${platformConfig.name} - Precise tracking initialized`);
}

// Stop tracking
function stopTracking() {
    if (videoElement) {
        videoElement.removeEventListener('play', handlePlay);
        videoElement.removeEventListener('pause', handlePause);
        videoElement.removeEventListener('timeupdate', handleTimeUpdate);
        videoElement.removeEventListener('ended', handleEnded);
        videoElement.removeEventListener('seeking', handleSeeking);
        videoElement = null;
    }



    isPlaying = false;
    console.log(`${platformConfig.name} - Stopped tracking`);
}

// Handle keyboard shortcuts
// Wait for video player to load
function waitForVideoPlayer() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = currentPlatform === 'disneyplus' ? 15 : 20;
        const checkInterval = currentPlatform === 'disneyplus' ? 2000 : 1000;

        const checkForPlayer = () => {
            attempts++;
            console.log(`${platformConfig.name} - Attempt ${attempts}/${maxAttempts} to find video player`);

            // Special check for Disney+ hivePlayer
            if (currentPlatform === 'disneyplus') {
                const player = window.hivePlayer;
                if (player) {
                    console.log(`${platformConfig.name} - hivePlayer found after ${attempts} attempts`);
                    resolve(player);
                    return;
                } else {
                    console.log(`${platformConfig.name} - window.hivePlayer not available yet (attempt ${attempts})`);
                }
            }

            const video = findVideoElement();

            if (video && isVideoReady(video)) {
                console.log(`${platformConfig.name} - Video player found after ${attempts} attempts`);
                resolve(video);
            } else if (attempts >= maxAttempts) {
                console.log(`${platformConfig.name} - Video player not found after ${maxAttempts} attempts`);
                resolve(null);
            } else {
                setTimeout(checkForPlayer, checkInterval);
            }
        };
        checkForPlayer();
    });
}

// Initialize tracking when on video page
async function initializeTracking() {
    if (!isOnVideoPage(location.href) || isInitialized) {
        return false;
    }

    console.log(`${platformConfig.name} - Initializing MrTracksIt`);

    await loadSettings();

    const video = await waitForVideoPlayer();

    if (!video) {
        console.log(`${platformConfig.name} - Failed to find video player`);
        return false;
    }

    isInitialized = true;
    startTracking();

    console.log(`${platformConfig.name} - MrTracksIt initialized successfully`);
    return true;
}

async function tryInitializeTrackingUntilPass(maxTries = 10) {
    for (let i = 0; i < maxTries; i++) {
        const passed = await initializeTracking();
        if (passed) {
            return;
        }
        await delay(1000);
    }
}

// Check if a video element is actually live and loaded
function isVideoReady(video) {
    return video.isConnected && (video.readyState > 0 || !!video.currentSrc);
}

// Clean up when leaving video page
function cleanup() {
    stopTracking();
    isInitialized = false;

    totalTime = 0;
    lastTime = 0;
    isPlaying = false;
    videoElement = null;

    const notificationId = `${currentPlatform}-lang-tracker-notification`;
    const existingNotification = document.getElementById(notificationId);
    if (existingNotification) {
        existingNotification.remove();
    }

    console.log(`${platformConfig.name} - Cleaned up tracking`);
}

// Watch for URL changes
function checkForUrlChange() {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        cleanup();
        // Delay lets the SPA finish swapping the video element before we search for it
        setTimeout(() => tryInitializeTrackingUntilPass(), 1500);
    }
}

// Platform-specific initialization
function initializePlatformTracker() {
    urlObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkForUrlChange();
        }
    });

    urlObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    setInterval(checkForUrlChange, 2000);

    function initializeOnLoad() {
        // Disney+ needs more time for hivePlayer to become available
        const delay = currentPlatform === 'disneyplus' ? 8000 :
            currentPlatform === 'netflix' ? 3000 :
            currentPlatform === 'dreamingspanish' ? 3000 : 2000;
        setTimeout(async () => {
            if (isOnVideoPage(location.href)) {
                await initializeTracking();
            }
        }, delay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeOnLoad);
    } else {
        initializeOnLoad();
    }

    if (isContextValid()) chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            // selectedLanguage and trackingEnabled are local-only
            if (changes.selectedLanguage) {
                currentLanguage = changes.selectedLanguage.newValue;
                currentLanguageIndex = watchedLanguages.indexOf(currentLanguage);
                if (currentLanguageIndex === -1) currentLanguageIndex = 0;
            }
            if (changes.trackingEnabled !== undefined) {
                trackingEnabled = changes.trackingEnabled.newValue;
                if (isOnVideoPage(location.href)) {
                    if (trackingEnabled) startTracking();
                    else stopTracking();
                }
            }
        }

        if (namespace === 'sync') {
            // watchedLanguages is synced across devices
            if (changes.watchedLanguages) {
                watchedLanguages = changes.watchedLanguages.newValue || [];
                if (!watchedLanguages.includes(currentLanguage)) {
                    if (watchedLanguages.length > 0) {
                        currentLanguage = watchedLanguages[0];
                        currentLanguageIndex = 0;
                        safeChrome(() => chrome.storage.local.set({ selectedLanguage: currentLanguage }));
                    }
                } else {
                    currentLanguageIndex = watchedLanguages.indexOf(currentLanguage);
                }
            }
        }
    });

    window.addEventListener('focus', () => {
        if (isOnVideoPage(location.href) && !isInitialized) {
            initializeTracking();
        }
    });

    console.log(`${platformConfig.name} MrTracksIt content script loaded`);
}

// Initialize only if we detected a supported platform and avoid duplicate initialization
if (platformConfig) {
    if (!window.languageTrackerInitialized) {
        window.languageTrackerInitialized = true;
        console.log(`${platformConfig.name} MrTracksIt loading...`);
        initializePlatformTracker();
    } else {
        console.log(`${platformConfig.name} MrTracksIt already initialized, skipping`);
    }
} else if (isContextValid()) {
    // Unknown built-in platform — check user-defined custom trackers
    chrome.storage.sync.get(['customTrackers'], (result) => {
        const trackers = result.customTrackers || [];
        const hostname = window.location.hostname;
        const match = trackers.find(t => hostname.includes(t.hostname));
        if (!match) {
            console.log('Unknown platform, MrTracksIt not initialized');
            return;
        }
        if (window.languageTrackerInitialized) return;

        currentPlatform = 'custom_' + match.hostname.replace(/\./g, '_');
        PLATFORM_CONFIG[currentPlatform] = {
            name: match.name,
            urlPatterns: match.urlPattern ? [match.urlPattern] : [''],
            videoSelectors: [match.videoSelector || 'video'],
            icon: '🎬',
            font: "'Arial', sans-serif"
        };
        platformConfig = PLATFORM_CONFIG[currentPlatform];

        window.languageTrackerInitialized = true;
        console.log(`${match.name} (custom tracker) loading...`);
        initializePlatformTracker();
    });
}
