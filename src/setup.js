#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const axios = require('axios');
const ytdl = require('youtube-dl-exec');
const config = require('./config');
const ffmpeg = require('fluent-ffmpeg');
const {promisify} = require('util');
const {pipeline} = require('stream/promises');
const {createWriteStream} = require('fs');
const {existsSync, mkdirSync} = require('fs');
const {exec} = require('child_process');
const execAsync = promisify(exec);

require('dotenv').config();

// Configure axios with retry logic
const axiosRetry = require('axios-retry').default;  // Use .default for ES modules compatibility
const axiosInstance = axios.create();

// Apply retry configuration
axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: (retryCount) => {
        console.log(`Retry attempt: ${retryCount}`);
        return retryCount * 1000; // time interval between retries
    },
    retryCondition: (error) => {
        const { isNetworkOrIdempotentRequestError } = require('axios-retry');
        return isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
    }
});

// Configure concurrency based on CPU cores
const CONCURRENCY_LIMIT = Math.max(1, os.cpus().length - 1);
const semaphore = (max) => {
    const tasks = [];
    let count = 0;
    return async (fn) => {
        if (count >= max) await new Promise(resolve => tasks.push(resolve));
        count++;
        try {
            return await fn();
        } finally {
            count--;
            if (tasks.length > 0) tasks.shift()();
        }
    };
};

const withConcurrency = semaphore(CONCURRENCY_LIMIT);

// Cache for API responses
const responseCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour cache TTL

// Progress tracking
const progress = {
    total: 0,
    completed: 0,
    failed: 0,
    startTime: Date.now(),
    update: function () {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = this.completed / (elapsed || 1);
        const remaining = Math.round((this.total - this.completed) / rate);
        process.stdout.write(`\rProgress: ${this.completed}/${this.total} | ${this.failed} failed | ${Math.round(rate * 60)} items/min | ETA: ${remaining}s`);
    }
};

/**
 * Fetch all videos metadata from YouTube API with caching and retry logic
 */
async function fetchAllVideosMetadata(channelId, apiKey, nextPageToken = null, uploadsPlaylistId = null) {
    const cacheKey = `videos_${channelId}_${nextPageToken || 'initial'}`;
    const cached = responseCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`Using cached response for ${cacheKey}`);
        return cached.data;
    }

    try {
        if (!uploadsPlaylistId) {
            const channelUrl = `https://www.googleapis.com/youtube/v3/channels` +
                `?part=contentDetails&id=${channelId}&key=${apiKey}`;

            const channelResponse = await axiosInstance.get(channelUrl, {timeout: 10000});
            uploadsPlaylistId = channelResponse.data.items[0]?.contentDetails?.relatedPlaylists?.uploads;

            if (!uploadsPlaylistId) {
                throw new Error('Could not find uploads playlist');
            }
        }

        let nextUrl = `https://www.googleapis.com/youtube/v3/playlistItems` +
            `?part=snippet,contentDetails&maxResults=50&playlistId=${uploadsPlaylistId}&key=${apiKey}`;

        if (nextPageToken) {
            nextUrl += `&pageToken=${nextPageToken}`;
        }

        console.log(`Fetching: ${nextUrl}`);
        const response = await axiosInstance.get(nextUrl, {timeout: 15000});

        if (!response.data?.items) {
            throw new Error('Invalid API response format');
        }

        let result = [...response.data.items];

        // Process next page if available
        if (response.data.nextPageToken) {
            const nextItems = await fetchAllVideosMetadata(
                channelId,
                apiKey,
                response.data.nextPageToken,
                uploadsPlaylistId
            );
            result = result.concat(nextItems);
        }

        // Filter and deduplicate
        const uniqueVideos = Array.from(new Map(
            result.map(item => [item.contentDetails.videoId, item])
        ).values());

        const filteredVideos = uniqueVideos.filter(videoMetadata =>
            !config.SETUP.REMOVE_SHORTS || !videoMetadata.snippet.title.includes('shorts')
        );

        // Cache the result
        responseCache.set(cacheKey, {
            data: filteredVideos,
            timestamp: Date.now()
        });

        return filteredVideos;
    } catch (error) {
        console.error('Error fetching videos:', error.message);

        // Try to use cached data if available
        if (cached?.data?.length) {
            console.log('Falling back to cached data');
            return cached.data;
        }

        // Try to load from backup file
        try {
            const files = await fs.readdir('data');
            const latestFile = files
                .filter(file => file.endsWith('.json'))
                .sort((a, b) =>
                    fs.statSync(path.join('data', b)).mtime -
                    fs.statSync(path.join('data', a)).mtime
                )[0];

            if (latestFile) {
                const latestPath = path.join('data', latestFile);
                console.log(`Using latest backup: ${latestPath}`);
                const data = await fs.readFile(latestPath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (backupError) {
            console.error('Error loading backup:', backupError.message);
        }

        throw error; // Re-throw if no fallback available
    }
}

/**
 * Download a video with retry logic and progress tracking
 */
async function downloadVideo(videoId, options = {}, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    const outPath = path.join(__dirname, '..', 'videos', `${videoId}.mp4`);
    const tempPath = `${outPath}.tmp`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Ensure videos directory exists
    const videosDir = path.dirname(outPath);
    if (!existsSync(videosDir)) {
        await fs.mkdir(videosDir, {recursive: true});
    }

    const downloadOptions = {
        o: tempPath,
        f: config.SETUP.VIDEO_QUALITY,
        'cookies-from-browser': config.SETUP.COOKIES_FROM_BROWSER,
        'no-check-certificate': true,
        'prefer-free-formats': true,
        'socket-timeout': 30000, // 30 seconds
        'retries': 3,
        'fragment-retries': 3,
        'buffer-size': '16M',
        'http-chunk-size': '4M',
        ...options
    };

    try {
        // Check if file already exists
        if (existsSync(outPath)) {
            const stats = await fs.stat(outPath);
            if (stats.size > 0) {
                console.log(`\nSkipping already downloaded video: ${videoId}`);
                return true;
            }
        }

        console.log(`\nDownloading video (attempt ${attempt}): ${videoId}`);

        // Use ytdl with progress tracking
        const ytdlProcess = ytdl(url, downloadOptions);

        ytdlProcess.on('progress', ({percent, total}) => {
            process.stdout.write(`\rDownloading: ${(percent * 100).toFixed(1)}% (${formatBytes(total)})`);
        });

        await ytdlProcess;

        // Rename temp file to final name
        if (existsSync(tempPath)) {
            await fs.rename(tempPath, outPath);
            console.log(`\nDownload completed: ${outPath}`);
            return true;
        } else {
            throw new Error('Download completed but output file not found');
        }
    } catch (error) {
        console.error(`\nError downloading video ${videoId}:`, error.message);

        // Clean up temp file if it exists
        if (existsSync(tempPath)) {
            await fs.unlink(tempPath).catch(console.error);
        }

        // Retry logic
        if (attempt < MAX_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff
            console.log(`Retrying in ${delay / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return downloadVideo(videoId, options, attempt + 1);
        }

        throw error;
    }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Process video metadata and add additional information
 */
async function processVideoMetadata(videoMetadatas) {
    return videoMetadatas
        .filter(video => !config.SETUP.VIDEOS_BLACKLIST.includes(video.contentDetails.videoId))
        .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt))
        .map(video => {
            const videoTitle = video.snippet.title;

            // Set video type
            video.type = videoTitle.match(/(Indie & Co|Rétrospective)/i) ? 'podcast' :
                videoTitle.match(/Stunfest/i) ? 'stunfest' :
                    videoTitle.match(/(Jam|GGJ)/i) ? 'jam' : 'misc';

            // Format video metadata
            video.formatted = {};
            const formatted = videoTitle.replace(/[^\w\u00C0-\u00FF\s|\-()&:?',\.]/g, '').trim();

            if (video.type === 'podcast') {
                video.formatted.category = 'Indie & Co';
                video.formatted.title = formatted.split(/\s-\s/)[0];
                video.formatted.subtitle = formatted.split(/\s-\s/)[1]?.split(/\s\|\s/)[0] || '';
            } else if (video.type === 'stunfest') {
                video.formatted.category = 'Stunfest';
                video.formatted.title = formatted.split(/^Stunfest\s/)[1] || formatted;
            } else {
                video.formatted.title = formatted;
            }

            return video;
        });
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err || !metadata?.format?.duration) {
                console.error(`Error getting duration for ${videoPath}:`, err?.message || 'Unknown error');
                resolve(0); // Return 0 if duration can't be determined
            } else {
                resolve(metadata.format.duration);
            }
        });
    });
}

/**
 * Process a single video (download and get metadata)
 */
async function processVideo(video, index, total) {
    const videoId = video.contentDetails.videoId;
    const videoPath = path.join(__dirname, '..', 'videos', `${videoId}.mp4`);

    try {
        // Download video if it doesn't exist
        if (!existsSync(videoPath)) {
            console.log(`\n[${index + 1}/${total}] Downloading: ${video.snippet.title}`);
            await downloadVideo(videoId);
        } else {
            console.log(`\n[${index + 1}/${total}] Already exists: ${video.snippet.title}`);
        }

        // Get video duration
        video.duration = await getVideoDuration(videoPath);

        progress.completed++;
        progress.update();

        return video;
    } catch (error) {
        console.error(`\nError processing video ${videoId}:`, error.message);
        progress.failed++;
        progress.update();
        return null;
    }
}

/**
 * Save metadata to file with proper error handling
 */
async function saveMetadata(metadata) {
    try {
        const dataDir = path.join(__dirname, '..', 'data');
        if (!existsSync(dataDir)) {
            await fs.mkdir(dataDir, {recursive: true});
        }

        const timestamp = new Date().toISOString()
            .replace(/:/g, '-')
            .replace(/\./g, '');

        const outPath = path.join(dataDir, `${timestamp}.json`);
        await fs.writeFile(outPath, JSON.stringify(metadata, null, 2), 'utf-8');

        console.log(`\nMetadata saved to: ${outPath}`);
        return outPath;
    } catch (error) {
        console.error('Error saving metadata:', error.message);
        throw error;
    }
}

/**
 * Main entry point
 */
async function main() {
    try {
        // Validate environment variables
        if (!process.env.YOUTUBE_CHANNEL_ID || !process.env.YOUTUBE_API_KEY) {
            throw new Error('Missing required environment variables: YOUTUBE_CHANNEL_ID and YOUTUBE_API_KEY must be set');
        }

        console.log('Starting video metadata fetch...');
        const videoMetadatas = await fetchAllVideosMetadata(
            process.env.YOUTUBE_CHANNEL_ID,
            process.env.YOUTUBE_API_KEY
        );

        if (!videoMetadatas?.length) {
            throw new Error('No videos found. Check your API key and channel ID.');
        }

        console.log(`\nFound ${videoMetadatas.length} videos. Processing metadata...`);
        const processedVideos = await processVideoMetadata(videoMetadatas);

        // Initialize progress tracking
        progress.total = processedVideos.length;
        progress.completed = 0;
        progress.failed = 0;
        progress.startTime = Date.now();

        console.log(`\nProcessing ${processedVideos.length} videos (${CONCURRENCY_LIMIT} concurrent downloads)...`);

        // Process videos with concurrency control
        const results = [];
        const batchSize = 10; // Process in smaller batches to avoid memory issues

        for (let i = 0; i < processedVideos.length; i += batchSize) {
            const batch = processedVideos.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map((video, idx) =>
                    withConcurrency(() =>
                        processVideo(video, i + idx, processedVideos.length)
                    )
                )
            );

            // Filter out any failed videos
            results.push(...batchResults.filter(Boolean));

            // Save progress after each batch
            if (i + batchSize < processedVideos.length) {
                console.log(`\nProcessed batch ${i / batchSize + 1}/${Math.ceil(processedVideos.length / batchSize)}`);
            }
        }

        // Final save with all videos
        const savedPath = await saveMetadata(results);

        // Print summary
        const elapsed = (Date.now() - progress.startTime) / 1000;
        console.log(`\n=== Processing Complete ===`);
        console.log(`Total videos: ${results.length}`);
        console.log(`Successfully processed: ${progress.completed}`);
        console.log(`Failed: ${progress.failed}`);
        console.log(`Time taken: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
        console.log(`Average speed: ${(results.length / (elapsed / 60)).toFixed(1)} videos/min`);
        console.log(`Metadata saved to: ${savedPath}`);

    } catch (error) {
        console.error('\nFatal error in main process:', error.message);
        process.exit(1);
    }
}

// Run with proper error handling
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});