import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import queryString from "query-string";
import { commitSession, getSession } from "../utils/sessions";

export async function loader({
	request
}: LoaderFunctionArgs) {
	// callback API route
	let { searchParams } = new URL(request.url);

	const code = searchParams.get("code")
	const state = searchParams.get("state");

	if (state === null) {
		redirect("/?just-tried=login&first-visit=false")
	} else {
		const query = queryString.stringify({
			code: code,
			redirect_uri: process.env.PLAYTREE_REMIX_SERVER_API_PATH + "/callback",
			grant_type: 'authorization_code'
		})
		const tokenResponse = await fetch('https://accounts.spotify.com/api/token?' + query, {
			method: "POST",
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'Authorization': 'Basic ' + (new (Buffer as any).from(process.env.PLAYTREE_SPOTIFY_CLIENT_ID + ':' + process.env.PLAYTREE_SPOTIFY_CLIENT_SECRET).toString('base64')),
			},
		})

		if (tokenResponse.status === 200) {
			const accessToken : any = await tokenResponse.json()

			const session = await getSession(
				request.headers.get("Cookie")
			);

			session.set("spotify_access_token", accessToken.access_token)
			session.set("spotify_refresh_token", accessToken.refresh_token)

			return redirect("/?just-tried=login&first-visit=false", {
				headers: {
					"Set-Cookie": await commitSession(session),
				},
			})
		} else {
			return redirect("/?just-tried=login&first-visit=false")
		}
	}
}