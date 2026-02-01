const path = require('path');

module.exports = {
    // Paths
    PATHS: {
        VIDEOS: path.join(__dirname, '..', 'videos'),
        PUBLIC: path.join(__dirname, '..', 'public')
    },

    SETUP: {
        VIDEO_QUALITY: 'bestvideo[height<=1080][ext=mp4]/mp4',
        REMOVE_SHORTS: true,
        VIDEOS_BLACKLIST: [
            'U6HvY9GPApk',  // GGJ 2016 : Hello de Rennes
            'Or8qO8xkN2w',  // OctoJam 2020 - Grande Soirée de Lancement  !
            'LHCAKPGRnCk',  // TVR Soir - Présentation du Stunfest et de la Stunjam 2021
            'hsGxdTX60lo',  // Stunjam 2021 - Soirée de lancement
            'AI34z41g-ic',  // Octojam 2021 : Soirée de lancement
            '93gAzPb1GrA',  // GGJ 2022 Rennes : Lancement !
            '20s6vCuW_58',  // InJam France : soirée de lancement !
            'ir2TvKyNDRw',  // Lancement, thème et brainstorm de la GLOBAL GAME JAM Rennes 2024
            'hPodCbaX920',  // Point d'avancement des projets de la GLOBAL GAME JAM Rennes 2024
            'yLnIdOR_vKs',  // Global Game Jam 2025 : le lancement, thème et brainstorm !
        ],
        COOKIES_FROM_BROWSER: "firefox",
    },

    // Server configuration
    SERVER: {
        PORT: process.env.PORT || 3000,
        HOST: '0.0.0.0',
    },

    // UI settings
    UI: {
        CRT_EFFECT: true,
        VIDEO_DETAILS: true
    },

    // VIDEO settings
    VIDEO: {
        CLIP_DURATION: 60,
        SNOW_DURATION_MS: 500,

        CROP_BOUNDS: {
            podcast: {
                START: 120,
                END: 120
            },
            jam: {
                START: 300,
                END: 400
            },
            stunfest: {
                START: 10,
                END: 10
            },
            misc: {
                START: 400,
                END: 400
            }
        },

        OVERRIDES: {
            /*'sQxLDY8Epqk': {
                VOLUME: 0.3,
                START: 100,
                END: 100
            }*/
        }

    },
};
