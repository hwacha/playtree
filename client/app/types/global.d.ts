import type { Spotify } from '@types/spotify-web-playback-sdk';

export {};

declare global {
  interface Window {
    Spotify: typeof Spotify; // Add this line!
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}
