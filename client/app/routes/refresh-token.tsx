import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { commitSession, getSession } from "../sessions";
import queryString from "query-string";

export async function loader() {
	return null
}

export async function action({
	request
}: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 })
	}

	const session = await getSession(
		request.headers.get("Cookie")
	);

	const refreshToken = session.get("refreshToken")
	if (!refreshToken) {
		return new Response("No refresh token provided", { status: 400 })
	}

	const querys = queryString.stringify({
		grant_type: 'refresh_token',
		refresh_token: session.get("refreshToken")
	})

	const refreshResponse = await fetch('https://accounts.spotify.com/api/token?' + querys, {
		method: "POST",
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			'Authorization': 'Basic ' + (new (Buffer as any).from(process.env.VITE_SPOTIFY_CLIENT_ID + ':' + process.env.VITE_SPOTIFY_CLIENT_SECRET).toString('base64')),
		},
	})

	if (refreshResponse.ok) {
		const accessToken = await refreshResponse.json()
		session.set("accessToken", accessToken.access_token)

		return new Response(JSON.stringify(accessToken), {
			headers: {
				"Set-Cookie": await (commitSession(session))
			}
		})
	} else {
		return refreshResponse
	}
}