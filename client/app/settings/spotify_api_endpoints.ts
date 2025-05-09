const SPOTIFY_API_PATH = "https://api.spotify.com/v1"

export const SPOTIFY_SEARCH_API_PATH = (query: string) => {
	return `${SPOTIFY_API_PATH}/search?q=${query}&type=track`
}

export const SPOTIFY_CURRENT_USER_PATH = `${SPOTIFY_API_PATH}/me`
export const SPOTIFY_PLAYER_PATH = `${SPOTIFY_CURRENT_USER_PATH}/player`
export const SPOTIFY_PLAY_PATH = `${SPOTIFY_PLAYER_PATH}/play`
export const SPOTIFY_PAUSE_PATH = `${SPOTIFY_PLAYER_PATH}/pause`
