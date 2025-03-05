import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import queryString from 'query-string';

const generateRandomString = (length : number) => {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const values = crypto.getRandomValues(new Uint8Array(length));
	return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

export async function loader() {
	// login API route
	var state = generateRandomString(16);
	var scope = 'streaming user-read-playback-state user-modify-playback-state user-read-private user-read-email';

	return redirect('https://accounts.spotify.com/authorize?' +
		queryString.stringify({
			response_type: 'code',
			client_id: process.env.VITE_SPOTIFY_CLIENT_ID,
			scope: scope,
			redirect_uri: process.env.VITE_SPOTIFY_REDIRECT_URI,
			state: state
		}));
}