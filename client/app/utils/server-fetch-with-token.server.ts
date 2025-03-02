import { redirect } from "@remix-run/react"
import { commitSession, getSession } from "../sessions"

export const serverFetchWithToken = async (request: Request, ...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
	let options: any = args[1]

	if (!options) {
		options = {}
	}

	if (!options.headers) {
		options.headers = {}
	}

	const session = await getSession(request.headers.get("Cookie"))
	let accessToken = session.get("accessToken")
	const refreshToken = session.get("refreshToken")

	if (!accessToken) {
		// if the access token does not exist but the refresh token does, hit the refresh endpoint
		if (refreshToken) {
			const refreshTokenResponse = await fetch("/refresh-token", { method: "POST" })
			if (!refreshTokenResponse.ok) {
				throw redirect("/login")
			}

			const refreshTokenResponseBody = await refreshTokenResponse.json()
			accessToken = refreshTokenResponseBody.access_token
		} else {
			throw redirect("/login")
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
		const refreshTokenResponse = await fetch("/refresh-token", { method: "POST" })
		if (!refreshTokenResponse.ok) {
			throw redirect("/login")
		}

		const refreshTokenResponseBody = await refreshTokenResponse.json()

		accessToken = refreshTokenResponseBody.access_token

		if (args[1] && args[1].headers) {
			(args[1].headers as any).Authorization = "Bearer " + accessToken;
			(args[1].headers as any)["Set-Cookie"] = await commitSession(session)
		}

		return fetch(...args)
	}

	throw redirect("/?authentication-success=false")
}