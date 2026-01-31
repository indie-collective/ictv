#!/usr/bin/env node

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const config = require('./config');

// Use localhost for browser, even if server binds to 0.0.0.0
const url = `http://localhost:${config.SERVER.PORT}`;

const chromeFlags = [
    '--autoplay-policy=no-user-gesture-required',
    '--kiosk',
    '--disable-infobars',
    '--start-fullscreen',
    '--disable-session-crashed-bubble',
    '--disable-restore-session-state',
    '--noerrdialogs',
    url
];

function findChromePath() {
    const platform = os.platform();

    if (platform === 'win32') {
        // Windows paths
        const windowsPaths = [
            path.join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            // Edge as fallback
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(process.env['PROGRAMFILES'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ];

        const fs = require('fs');
        for (const p of windowsPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        // Fallback to PATH
        return 'chrome';

    } else if (platform === 'darwin') {
        // macOS paths
        const macPaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        ];

        const fs = require('fs');
        for (const p of macPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        // Fallback - try using open command with Chrome
        return 'google-chrome';

    } else {
        // Linux paths
        const linuxPaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        ];

        const fs = require('fs');
        for (const p of linuxPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        // Fallback to PATH
        return 'google-chrome';
    }
}

function launchBrowser() {
    const platform = os.platform();
    const chromePath = findChromePath();

    console.log(`Detected OS: ${platform}`);
    console.log(`Using browser: ${chromePath}`);
    console.log(`Opening: ${url}`);
    console.log('');
    console.log('Press Ctrl+C to stop the server and close the browser.');
    console.log('Press F11 or Alt+F4 to exit kiosk mode.');

    let browserProcess;

    if (platform === 'darwin') {
        // macOS needs special handling
        browserProcess = spawn('open', ['-a', 'Google Chrome', '--args', ...chromeFlags], {
            stdio: 'inherit',
            detached: true
        });
    } else {
        browserProcess = spawn(chromePath, chromeFlags, {
            stdio: 'inherit',
            detached: true
        });
    }

    browserProcess.on('error', (err) => {
        console.error('Failed to launch browser:', err.message);
        console.log('');
        console.log('Please make sure Chrome or Chromium is installed.');
        console.log('Or open this URL manually:', url);
    });

    browserProcess.unref();
}

// Start the server first, then launch browser
const server = require('./index');

// Give server time to start, then launch browser
setTimeout(launchBrowser, 1000);
