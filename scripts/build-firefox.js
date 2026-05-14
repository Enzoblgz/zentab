import { copyFileSync } from 'fs'

// Overwrite the Chrome manifest Vite copied with the Firefox one
copyFileSync('public/manifest.firefox.json', 'dist-firefox/manifest.json')
console.log('Firefox manifest written to dist-firefox/manifest.json')
