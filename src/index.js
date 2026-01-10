const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const app = express();
const puppeteer = require('puppeteer');

// Video stack management
class VideoStack {
    constructor() {
        this.stack = [];
        this.latestPath = '';
        this.initialized = false;
        this.lock = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            const files = await fs.promises.readdir('data');
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                this.latestPath = path.join('data', 'default.json');
            } else {
                const stats = await Promise.all(
                    jsonFiles.map(file => 
                        fs.promises.stat(path.join('data', file))
                            .then(stat => ({ file, mtime: stat.mtime }))
                    )
                );
                
                const latest = stats.sort((a, b) => b.mtime - a.mtime)[0];
                this.latestPath = path.join('data', latest.file);
            }
            
            await this.refresh();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize video stack:', error);
            throw error;
        }
    }

    async refresh() {
        if (this.lock) return;
        this.lock = true;
        
        try {
            if (this.stack.length === 0) {
                const data = await fs.promises.readFile(this.latestPath, 'utf-8');
                this.stack = JSON.parse(data);
            }
        } catch (error) {
            console.error('Failed to refresh video stack:', error);
            throw error;
        } finally {
            this.lock = false;
        }
    }

    async getRandomVideo() {
        if (this.stack.length === 0) {
            await this.refresh();
        }

        if (this.stack.length === 0) {
            throw new Error('No videos available in the stack');
        }

        const randomIndex = Math.floor(Math.random() * this.stack.length);
        return this.stack.splice(randomIndex, 1)[0];
    }
}

const videoStack = new VideoStack();

// Initialize video stack on startup
videoStack.initialize().catch(console.error);

// Serve static files from the PUBLIC directory
if (fs.existsSync(config.PATHS.PUBLIC)) {
    app.use(express.static(config.PATHS.PUBLIC));
}

// Add compression middleware
const compression = require('compression');
app.use(compression());

// Add cache control headers middleware
app.use((req, res, next) => {
    if (req.path.startsWith('/videos/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year for videos
    } else if (req.path === '/api/random-clip') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});

app.get('/api/random-clip', async (req, res) => {
    try {
        if (!videoStack.initialized) {
            await videoStack.initialize();
        }

        const randomVideo = await videoStack.getRandomVideo();

        res.json({
            video: `/videos/${randomVideo.contentDetails.videoId}.mp4`,
            id: randomVideo.contentDetails.videoId,
            title: randomVideo.snippet.title,
            formatted: randomVideo.formatted,
            type: randomVideo.type,
            duration: randomVideo.duration
        });
    } catch (error) {
        console.error('Error in /api/random-clip:', error);
        res.status(500).json({ error: 'Failed to get random clip' });
    }
});

// Serve video files with proper streaming and error handling
app.get('/videos/:filename', async (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    if (!/^[a-zA-Z0-9_\-]+\.mp4$/.test(filename)) {
        return res.status(400).send('Invalid filename');
    }

    const filePath = path.join(config.PATHS.VIDEOS, filename);
    
    try {
        // Check if file exists asynchronously
        await fs.promises.access(filePath, fs.constants.F_OK);
        const stat = await fs.promises.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            // Parse Range header
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            // Validate range
            if (start >= fileSize || end >= fileSize) {
                res.setHeader('Content-Range', `bytes */${fileSize}`);
                return res.status(416).send('Requested range not satisfiable');
            }

            const headers = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/mp4',
                'Cache-Control': 'public, max-age=31536000',
                'ETag': `"${stat.mtime.getTime()}"`,
                'Last-Modified': stat.mtime.toUTCString()
            };

            res.writeHead(206, headers);
            
            // Stream the video chunk
            const stream = fs.createReadStream(filePath, { start, end });
            
            // Handle stream errors
            stream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).send('Error streaming video');
                } else {
                    res.end();
                }
            });
            
            // Handle client disconnect
            req.on('close', () => {
                stream.destroy();
            });
            
            stream.pipe(res);
        } else {
            const headers = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
                'Cache-Control': 'public, max-age=31536000',
                'ETag': `"${stat.mtime.getTime()}"`,
                'Last-Modified': stat.mtime.toUTCString()
            };

            res.writeHead(200, headers);
            
            // Stream the entire video
            const stream = fs.createReadStream(filePath);
            
            // Handle stream errors
            stream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).send('Error streaming video');
                } else {
                    res.end();
                }
            });
            
            // Handle client disconnect
            req.on('close', () => {
                stream.destroy();
            });
            
            stream.pipe(res);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).send('Video not found');
        }
        console.error('Error serving video:', error);
        res.status(500).send('Internal server error');
    }
});

// Serve the main HTML page
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Server and browser management
class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isShuttingDown = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
    }

    async launchBrowser(serverUrl) {
        if (this.isShuttingDown) return;

        try {
            this.browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-zygote',
                    '--disable-gpu',
                    '--autoplay-policy=no-user-gesture-required',
                ],
                ignoreDefaultArgs: ['--mute-audio', '--hide-scrollbars'],
                defaultViewport: null
            });

            const context = this.browser.defaultBrowserContext();
            await context.overridePermissions(serverUrl, []);
            
            const pages = await this.browser.pages();
            this.page = pages[0];
            await this.page.setDefaultNavigationTimeout(60000); // 60 seconds timeout

            this.setupPageHandlers(serverUrl);
            this.retryCount = 0; // Reset retry count on successful launch

            console.log('Browser launched successfully');
            return this.page;
        } catch (error) {
            console.error('Failed to launch browser:', error);
            await this.cleanup();
            this.retryLaunch(serverUrl);
            return null;
        }
    }

    setupPageHandlers(serverUrl) {
        if (!this.page) return;

        // Remove existing listeners to prevent duplicates
        this.page.removeAllListeners('error');
        this.page.removeAllListeners('pageerror');
        this.page.removeAllListeners('console');

        this.page.on('error', async (error) => {
            console.error('Page error:', error.message);
            await this.handlePageError();
        });

        this.page.on('pageerror', (error) => {
            console.error('Page error:', error.message);
        });

        this.page.on('console', (msg) => {
            console.log(`[Browser Console] ${msg.text()}`);
        });
    }

    async handlePageError() {
        if (!this.page || this.isShuttingDown) return;

        try {
            const body = await this.page.$('body');
            if (body) {
                await body.evaluate((element) => {
                    element.className = 'error';
                });
            }
            
            if (!this.isShuttingDown) {
                console.log('Reloading page due to error...');
                await this.page.reload({ waitUntil: 'networkidle2' });
            }
        } catch (error) {
            console.error('Error handling page error:', error);
            await this.cleanup();
        }
    }

    async retryLaunch(serverUrl) {
        if (this.isShuttingDown || this.retryCount >= this.maxRetries) {
            console.error('Max retries reached, giving up');
            return;
        }

        this.retryCount++;
        const delay = this.retryDelay * this.retryCount;
        
        console.log(`Retrying browser launch in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        
        setTimeout(async () => {
            if (!this.isShuttingDown) {
                await this.launchBrowser(serverUrl);
            }
        }, delay);
    }

    async cleanup() {
        this.isShuttingDown = true;
        
        if (this.browser) {
            try {
                const pages = await this.browser.pages();
                await Promise.all(pages.map(page => page.close().catch(console.error)));
                await this.browser.close();
            } catch (error) {
                console.error('Error during browser cleanup:', error);
            } finally {
                this.browser = null;
                this.page = null;
            }
        }
    }
}

const browserManager = new BrowserManager();

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await browserManager.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Shutting down...');
    await browserManager.cleanup();
    process.exit(0);
});

// Replace the existing server initialization code with this:
const server = app.listen(config.SERVER.PORT, config.SERVER.HOST, async () => {
    const {address, port} = server.address();
    const host = address.match(/^::/) ? 'localhost' : address;
    const serverUrl = `http://${host}:${port}`;

    console.log(`Server running at ${serverUrl}`);
    
    // Launch browser after server starts
    browserManager.launchBrowser(serverUrl).then(async (page) => {
        if (page) {
            try {
                console.log('Opening browser...');
                await page.goto(serverUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 30000 // 30 seconds timeout
                });
                await main(page, serverUrl, config);
            } catch (error) {
                console.error('Failed to load page:', error);
            }
        }
    });
});

async function main(page, serverUrl) {
    const body = await page.$('body');
    await body.evaluate((element, config) => {
        if (config.UI.CRT_EFFECT) {
            element.classList.add('crt');
        }
    }, config);

    const videoPlayer = await page.$('#videoPlayer');

    const snow = await page.$('#snow');
    await snow.evaluate((element) => {
        const audio = element.querySelector('audio');
        audio.volume = 0;
        audio.play();
    });
    const showSnow = async (fixedLogo = false) => {
        await snow.evaluate((element, fixedLogo) => {
            const classList = element.classList;
            if(!fixedLogo) {
                classList.remove('white');
                if (Math.random() < 0.5) {
                    classList.add('white');
                }
            }
            element.style.zIndex = 1;
            const audio = element.querySelector('audio');
            audio.volume = 1;
        }, fixedLogo);
    };
    await page.exposeFunction('showSnow', showSnow);
    const hideSnow = async () => {
        await snow.evaluate((element) => {
            element.style.zIndex = -1;
            const audio = element.querySelector('audio');
            audio.volume = 0;
        });
    };
    await page.exposeFunction('hideSnow', hideSnow);

    const videoDetails = await page.$('#details');
    const videoCategory = await page.$('#category');
    const videoTitle = await page.$('#title');
    const videoSubtitle = await page.$('#subtitle');

    const playRandomClip = async () => {
        if (config.UI.VIDEO_DETAILS) {
            await videoDetails.evaluate((details) => {
                details.style.animation = `none`;
            });
            await videoCategory.evaluate((category) => {
                category.style.animation = `none`;
            });
        }

        await showSnow();

        await videoPlayer.evaluate((video) => {
            video.volume = 0;
        });

        const response = await fetch(`${serverUrl}/api/random-clip`).then(res => res.json());
        if (response.error) {
            throw new Error(response.error);
        }

        const type = response.type;
        let {START: startingBound, END: endingBound} = config.VIDEO.CROP_BOUNDS[type];

        startingBound = config.VIDEO.OVERRIDES[response.id]?.START || startingBound;
        endingBound = config.VIDEO.OVERRIDES[response.id]?.END || endingBound;

        await videoPlayer.evaluate((video, response, config, videoDetails, videoCategory, videoTitle, videoSubtitle, startingBound, endingBound) => {
            video.src = response.video;

            const duration = response.duration;

            if (duration - (startingBound + endingBound) > 0) {
                video.currentTime = Math.random() * (duration - (startingBound + endingBound) - config.VIDEO.CLIP_DURATION) + startingBound;
            } else {
                video.currentTime = Math.floor(Math.random() * (duration - config.VIDEO.CLIP_DURATION));
            }

            setTimeout(() => {
                video.play();

                if (config.UI.VIDEO_DETAILS) {
                    videoDetails.style.animation = `enterX ${config.VIDEO.CLIP_DURATION / 3}s forwards`;
                }

                if (response.title.match(/(trailer|aftermovie)/ig)) {
                    video.volume = 0.3;
                } else {
                    video.volume = 1;
                }

                video.volume = config.VIDEO.OVERRIDES[response.id]?.VOLUME || video.volume;

                hideSnow();
            }, config.VIDEO.SNOW_DURATION_MS)

            if (config.UI.VIDEO_DETAILS) {
                videoCategory.innerText = response.formatted.category || '';
                videoCategory.style.animation = `enterY ${config.VIDEO.CLIP_DURATION / 60}s ${config.VIDEO.CLIP_DURATION / 6}s ease-in-out forwards`;
                videoTitle.innerText = response.formatted.title
                videoSubtitle.innerText = response.formatted.subtitle || '';
            }

        }, response, config, videoDetails, videoCategory, videoTitle, videoSubtitle, startingBound, endingBound);
        console.log(`Playing "${response.title}" (${response.id})`)
    };
    await page.exposeFunction('playRandomClip', playRandomClip);

    async function start() {
        await showSnow(true);

        // Set 2s of snow, then start
        let countdown = 2;

        // Use countdown to count down, then play another random clip
        setInterval(async () => {
            if (countdown === 0) {
                countdown = config.VIDEO.CLIP_DURATION;
                playRandomClip();
            } else {
                countdown--;
            }
        }, 1000);
    }

    await start();
}