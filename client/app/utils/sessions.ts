import { createCookieSessionStorage } from "@remix-run/node";

type SessionData = {
	spotify_access_token: string;
	spotify_refresh_token: string;
};

type SessionFlashData = {
	error: string;
};


const { getSession, commitSession, destroySession } =
	createCookieSessionStorage<SessionData, SessionFlashData>({
		cookie: {
			name: "__session",
			maxAge: 60 * 60 * 24 * 365
			// secure: true
		}
	})

export { getSession, commitSession, destroySession };