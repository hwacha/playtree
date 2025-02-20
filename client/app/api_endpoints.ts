export const MOCK_SEARCH_API_PATH = (query : string) => {
    return `http://localhost:8081/search?q=${query}`
}

export const SPOTIFY_SEARCH_API_PATH = (query : string) => {
    return `https://api.spotify.com/v1/search?q=${query}&type=track`
}