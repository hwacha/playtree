import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import queryString from "query-string";
import { commitSession, getSession } from "../sessions";

export async function loader({
	request
}: LoaderFunctionArgs) {
	// callback API route
	let { searchParams } = new URL(request.url);

	const code = searchParams.get("code")
	const state = searchParams.get("state");

	if (state === null) {
		redirect("/?authentication-success=false")
	} else {
		const query = queryString.stringify({
			code: code,
			redirect_uri: process.env.VITE_SPOTIFY_REDIRECT_URI,
			grant_type: 'authorization_code'
		})
		const tokenResponse = await fetch('https://accounts.spotify.com/api/token?' + query, {
			method: "POST",
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'Authorization': 'Basic ' + (new (Buffer as any).from(process.env.VITE_SPOTIFY_CLIENT_ID + ':' + process.env.VITE_SPOTIFY_CLIENT_SECRET).toString('base64')),
			},
		})

		if (tokenResponse.status === 200) {
			const accessToken : any = await tokenResponse.json()

			const session = await getSession(
				request.headers.get("Cookie")
			);

			session.set("spotify_access_token", accessToken.access_token)
			session.set("spotify_refresh_token", accessToken.refresh_token)

			return redirect("/?authentication-success=true", {
				headers: {
					"Set-Cookie": await commitSession(session),
				},
			})
		} else {
			return redirect("/?authentication-success=false")
		}
	}
}