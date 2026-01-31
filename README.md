# ICTV

YouTube Playlist Video Player

## Description

This application is a web-based video player that displays random clips from YouTube playlists. It fetches videos from a YouTube channel, downloads them locally, and serves them through a web interface with a retro CRT TV aesthetic. Perfect for kiosk displays, waiting rooms, or static screens.

## Features

- Random video clip playback from your YouTube channel
- Retro CRT screen effect
- Video details overlay (category, title, subtitle)
- Snow/static effect between clips
- Cross-platform support (Windows, macOS, Linux)
- Kiosk mode with auto-launch script
- Accessible over local network

## Installation

1. Clone the repository: `git clone https://github.com/Jeremy-Bell/ictv.git`
2. Install dependencies: `cd ictv && npm install`
3. Create a `.env` file in the root directory of the project and add the following variables:

```
YOUTUBE_CHANNEL_ID=your_channel_id
YOUTUBE_API_KEY=your_api_key
```

4. Run `npm run setup` to download the videos from the playlist.

## Usage

### Standard Mode
Start the server and open in your browser manually:
```bash
npm start
```
Then open `http://localhost:3000` in your browser.

### Kiosk Mode (Recommended for static screens)
Launch the server and automatically open Chrome in kiosk mode with autoplay enabled:
```bash
npm run launch
```
This will:
- Start the server
- Open Chrome in fullscreen kiosk mode
- Enable audio/video autoplay without user interaction

### Network Access
The server is accessible from other devices on your local network. When started, it displays:
```
Server running at:
  Local:   http://localhost:3000
  Network: http://192.168.x.x:3000
```

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
- `SERVER.HOST`: Host to bind the server to (default: `'0.0.0.0'` - accessible on local network)

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

## Browser Requirements

For kiosk/static screen usage, Chrome or Chromium is recommended. The `npm run launch` command automatically configures Chrome with:
- `--autoplay-policy=no-user-gesture-required` - Allows audio/video autoplay
- `--kiosk` - Fullscreen kiosk mode
- `--disable-infobars` - Hides info bars

## Scripts

- `npm run setup` - Download videos from YouTube channel
- `npm start` - Start the server only
- `npm run launch` - Start server and open browser in kiosk mode
