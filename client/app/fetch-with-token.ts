const clientFetchWithToken = async (...args: Parameters<typeof fetch>) : ReturnType<typeof fetch> => {
    let options : any = args[1]
    
    if (!options) {
        options = {}
    }
    
    if (!options.headers) {
        options.headers = {}
    }

    let accessToken  = localStorage.getItem("spotify_access_token")
    let refreshToken = localStorage.getItem("spotify_refresh_token")

    if (!accessToken) {
        // if the access token does not exist but the refresh token does, hit the refresh endpoint
        if (refreshToken) {
            const refreshTokenResponse = await fetch("/refresh-token", { method: "POST" })
            if (!refreshTokenResponse.ok) {
                window.location.href = "/login"
                return new Response(null)
            }

            const refreshTokenResponseBody = await refreshTokenResponse.json()
            accessToken = refreshTokenResponseBody.access_token
            localStorage.setItem("spotify_access_token", accessToken as string)
        } else {
            window.location.href = "/login"
            return new Response(null)
        }
    }

    options.headers.Authorization = "Bearer " + accessToken;
    
    args[1] = options
    const initialFetch = await fetch(...args)

    if (initialFetch.ok) {
        return initialFetch
    } else {
        const refreshTokenResponse = await fetch("/refresh-token", { method: "POST" })
        if (!refreshTokenResponse.ok) {
            window.location.href = "/login"
            return new Response(null)
        }

        const refreshTokenResponseBody = await refreshTokenResponse.json()

        accessToken = refreshTokenResponseBody.access_token
        localStorage.setItem("spotify_access_token", accessToken as string)

        if (args[1] && args[1].headers && (args[1].headers as any).Authorization) {
            (args[1].headers as any).Authorization = "Bearer " + accessToken;
        }

        return fetch(...args)
    }
}

export { clientFetchWithToken }