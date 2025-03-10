import { TokenType } from "../root"

const clientFetchWithToken = async (serverPath: string | undefined, token: TokenType, ...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
	if (!serverPath) {
		console.error("server path not defined")
		return new Response(null)
	}
	let options: any = args[1]

	if (!options) {
		options = {}
	}

	if (!options.headers) {
		options.headers = {}
	}

	let accessToken = token.accessToken ?? sessionStorage.getItem("spotify_access_token")
	let refreshToken = token.refreshToken

	if (!accessToken) {
		// if the access token does not exist but the refresh token does, hit the refresh endpoint
		if (refreshToken) {
			const refreshTokenResponse = await fetch(serverPath + "/refresh-token", { method: "POST" })
			if (!refreshTokenResponse.ok) {
				return new Response(JSON.stringify({ error: "Could not get access token with refresh token" }), { status: 401 })
			}

			const refreshTokenResponseBody = await refreshTokenResponse.json()
			accessToken = refreshTokenResponseBody.access_token
			sessionStorage.setItem("spotify_access_token", refreshTokenResponseBody.access_token)
		} else {
			return new Response(JSON.stringify({ error: "Do not have access token or refresh token" }), { status: 401 })
		}
	}

	options.headers.Authorization = "Bearer " + accessToken;
	args[1] = options
	const initialFetch = await fetch(...args)

	if (initialFetch.ok) {
		return initialFetch
	} else if (initialFetch.status === 401) {
		const refreshTokenResponse = await fetch(serverPath + "/refresh-token", { method: "POST" })
		if (!refreshTokenResponse.ok) {
			return new Response(JSON.stringify({ error: "Access token expired, and could not get new access token with refresh token" }), { status: 401 })
		}

		const refreshTokenResponseBody = await refreshTokenResponse.json()

		accessToken = refreshTokenResponseBody.access_token
		sessionStorage.setItem("spotify_access_token", refreshTokenResponseBody.access_token)

		if (args[1] && args[1].headers && (args[1].headers as any).Authorization) {
			(args[1].headers as any).Authorization = "Bearer " + accessToken;
		}

		return fetch(...args)
	} else {
		return initialFetch
	}
}

export { clientFetchWithToken }