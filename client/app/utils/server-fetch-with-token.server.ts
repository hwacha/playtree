import { redirect } from "@remix-run/react"
import { commitSession, getSession } from "../sessions"
import { REMIX_SERVER_API_PATH } from "../api_endpoints"

export const serverFetchWithToken = async (request: Request, ...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
	let options: any = args[1]
	if (!options) {
		options = {}
	}
	if (!options.headers) {
		options.headers = {}
	}

	const session = await getSession(request.headers.get("Cookie"))
	let accessToken = session.get("spotify_access_token")
	const refreshToken = session.get("spotify_refresh_token")

	if (!accessToken) {
		// if the access token does not exist but the refresh token does, hit the refresh endpoint
		if (refreshToken) {
			const refreshTokenResponse = await fetch(REMIX_SERVER_API_PATH + "/refresh-token", { method: "POST" })
			if (!refreshTokenResponse.ok) {
				return new Response("Could not get access token with refresh token", { status: 401 })
			}

			const refreshTokenResponseBody = await refreshTokenResponse.json()
			accessToken = refreshTokenResponseBody.access_token
		} else {
			return new Response("Do not have access token or refresh token", { status: 401 })
		}
	}

	options.headers.Authorization = "Bearer " + accessToken;
	args[1] = options
	const initialFetch = await fetch(...args)

	if (initialFetch.ok) {
		return new Response(initialFetch.body, {
			headers: { ...initialFetch.headers, "Set-Cookie": await commitSession(session) }
		})
	} else if (initialFetch.status === 401) { // this indicates reauthentication is worth trying
		const refreshTokenResponse = await fetch(REMIX_SERVER_API_PATH + "/refresh-token", { method: "POST" })
		if (!refreshTokenResponse.ok) {
			return new Response("Access token expired, and could not get new access token with refresh token", { status: 401 })
		}

		const refreshTokenResponseBody = await refreshTokenResponse.json()

		accessToken = refreshTokenResponseBody.access_token

		if (args[1] && args[1].headers) {
			(args[1].headers as any).Authorization = "Bearer " + accessToken;
			(args[1].headers as any)["Set-Cookie"] = await commitSession(session)
		}

		return fetch(...args)
	} else {
		return initialFetch
	}
}