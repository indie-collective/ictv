const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { readdir, stat, readFile } = fs.promises;
const config = require('./config');

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

        const files = await readdir('data');
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            this.latestPath = path.join('data', 'default.json');
        } else {
            const stats = await Promise.all(
                jsonFiles.map(async f => ({ file: f, mtime: (await stat(path.join('data', f))).mtime }))
            );
            this.latestPath = path.join('data', stats.sort((a, b) => b.mtime - a.mtime)[0].file);
        }

        await this.refresh();
        this.initialized = true;
    }

    async refresh() {
        if (this.lock || this.stack.length > 0) return;
        this.lock = true;
        try {
            this.stack = JSON.parse(await readFile(this.latestPath, 'utf-8'));
        } finally {
            this.lock = false;
        }
    }

    async getRandomVideo() {
        if (this.stack.length === 0) await this.refresh();
        if (this.stack.length === 0) throw new Error('No videos available');
        return this.stack.splice(Math.floor(Math.random() * this.stack.length), 1)[0];
    }
}

const app = express();
const videoStack = new VideoStack();

// Initialize on startup
videoStack.initialize().catch(console.error);

// Middleware
app.use(compression());
fs.existsSync(config.PATHS.PUBLIC) && app.use(express.static(config.PATHS.PUBLIC));

app.use((req, res, next) => {
    const cacheRules = {
        '/videos/': 'public, max-age=31536000',
        '/api/': 'no-cache, no-store, must-revalidate'
    };
    for (const [prefix, value] of Object.entries(cacheRules)) {
        if (req.path.startsWith(prefix)) {
            res.setHeader('Cache-Control', value);
            break;
        }
    }
    next();
});

// API endpoints
app.get('/api/config', (req, res) => res.json({ UI: config.UI, VIDEO: config.VIDEO }));

app.get('/api/random-clip', async (req, res) => {
    try {
        if (!videoStack.initialized) await videoStack.initialize();
        const video = await videoStack.getRandomVideo();
        res.json({
            video: `/videos/${video.contentDetails.videoId}.mp4`,
            id: video.contentDetails.videoId,
            title: video.snippet.title,
            formatted: video.formatted,
            type: video.type,
            duration: video.duration
        });
    } catch (error) {
        console.error('Error in /api/random-clip:', error);
        res.status(500).json({ error: 'Failed to get random clip' });
    }
});

// Helper to stream video with error handling
const streamVideo = (res, req, filePath, start, end, headers) => {
    res.writeHead(start !== undefined ? 206 : 200, headers);
    const stream = fs.createReadStream(filePath, start !== undefined ? { start, end } : undefined);
    stream.on('error', err => {
        console.error('Stream error:', err);
        res.headersSent ? res.end() : res.status(500).send('Error streaming video');
    });
    req.on('close', () => stream.destroy());
    stream.pipe(res);
};

// Serve video files with streaming
app.get('/videos/:filename', async (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    if (!/^[a-zA-Z0-9_\-]+\.mp4$/.test(filename)) return res.status(400).send('Invalid filename');

    const filePath = path.join(config.PATHS.VIDEOS, filename);

    try {
        const fileStat = await stat(filePath);
        const { size } = fileStat;
        const baseHeaders = {
            'Content-Type': 'video/mp4',
            'Cache-Control': 'public, max-age=31536000',
            'ETag': `"${fileStat.mtime.getTime()}"`,
            'Last-Modified': fileStat.mtime.toUTCString()
        };

        if (req.headers.range) {
            const [startStr, endStr] = req.headers.range.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end = endStr ? parseInt(endStr, 10) : size - 1;

            if (start >= size || end >= size) {
                res.setHeader('Content-Range', `bytes */${size}`);
                return res.status(416).send('Requested range not satisfiable');
            }

            streamVideo(res, req, filePath, start, end, {
                ...baseHeaders,
                'Content-Range': `bytes ${start}-${end}/${size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1
            });
        } else {
            streamVideo(res, req, filePath, undefined, undefined, { ...baseHeaders, 'Content-Length': size });
        }
    } catch (error) {
        if (error.code === 'ENOENT') return res.status(404).send('Video not found');
        console.error('Error serving video:', error);
        res.status(500).send('Internal server error');
    }
});

// Serve the main HTML page
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Start server
const server = app.listen(config.SERVER.PORT, config.SERVER.HOST, () => {
    const { port } = server.address();
    console.log(`Server running at:`);
    console.log(`  Local:   http://localhost:${port}`);

    // Show network addresses
    const nets = require('os').networkInterfaces();
    for (const iface of Object.values(nets)) {
        for (const net of iface) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`  Network: http://${net.address}:${port}`);
            }
        }
    }
});

// Graceful shutdown
const shutdown = signal => () => {
    console.log(`${signal} received. Shutting down...`);
    server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));

module.exports = server;
