# ICTV

YouTube Playlist Video Player

## Description

This application is a simple video player that allows users to play YouTube playlists. It uses the YouTube API to fetch
videos from a playlist and then uses FFmpeg to download and play the videos.

## Installation

1. Clone the repository: `git clone https://github.com/Jeremy-Bell/ictv.git`
2. Install dependencies: `cd ictv && npm install`
3. Create a `.env` file in the root directory of the project and add the following variables:

```
YOUTUBE_CHANNEL_ID=your_channel_id
YOUTUBE_API_KEY=your_api_key
```

4. Run `npm run setup` to download the videos from the playlist.
5. Run `npm start` to start the server.

## Configuration

The application can be configured using the `src/config.js` file. Here are the available configuration options:

### Paths
- `PATHS.VIDEOS`: Directory where videos are stored (default: `'../videos'`)
- `PATHS.PUBLIC`: Public directory for static files (default: `'../public'`)

### Setup Options
- `SETUP.VIDEO_QUALITY`: Preferred video quality (default: `'bestvideo[height<=1080][ext=mp4]/mp4'`)
- `SETUP.REMOVE_SHORTS`: Whether to filter out YouTube Shorts (default: `true`)
- `SETUP.VIDEOS_BLACKLIST`: Array of video IDs to exclude from processing
- `SETUP.COOKIES_FROM_BROWSER`: Browser to use for authentication cookies (e.g., `"firefox"`)

### Server Configuration
- `SERVER.PORT`: Port to run the server on (default: `3000` or value from `process.env.PORT`)
- `SERVER.HOST`: Host to bind the server to (default: `'localhost'`)

### UI Settings
- `UI.CRT_EFFECT`: Enable/disable CRT screen effect (default: `true`)
- `UI.VIDEO_DETAILS`: Show/hide video details overlay (default: `true`)

### Video Settings
- `VIDEO.CLIP_DURATION`: Default duration for video clips in seconds (default: `30`)
- `VIDEO.SNOW_DURATION_MS`: Duration of the "snow" effect in milliseconds (default: `500`)
- `VIDEO.CROP_BOUNDS`: Object containing crop settings for different video types:
  - `podcast`: Start/end crop times in seconds
  - `jam`: Start/end crop times in seconds
  - `stunfest`: Start/end crop times in seconds
  - `misc`: Start/end crop times in seconds

### Environment Variables
The following environment variables can be set:
- `PORT`: Override the default server port
- `YOUTUBE_API_KEY`: Required for fetching video metadata
- `YOUTUBE_CHANNEL_ID`: The YouTube channel ID to fetch videos from

### Example Configuration
```javascript
{
  "SETUP": {
    "REMOVE_SHORTS": true,
    "VIDEO_QUALITY": "best[height<=720]"
  },
  "SERVER": {
    "PORT": 4000
  },
  "UI": {
    "CRT_EFFECT": true
  }
}
```

### Blacklisting Videos
To exclude specific videos, add their YouTube video IDs to the `VIDEOS_BLACKLIST` array in the `SETUP` section.

