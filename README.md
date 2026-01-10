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

