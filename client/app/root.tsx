import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ShouldRevalidateFunction,
	useFetcher,
	useLoaderData,
	useLocation
} from "@remix-run/react";

import Player from "./components/Player";

import styles from "./tailwind.css?url";
import UserSidebar from "./components/UserSidebar";
import Banner from "./components/Banner";
import { Playnode, Playroot, Playscope, playtreeFromJson, PlaytreeSummary } from "./types";
import { getSession } from "./utils/sessions";
import { serverFetchWithToken } from "./utils/server-fetch-with-token.server";
import { PLAYTREE_SERVER_PLAYER_PATH, PLAYTREE_SERVER_USER_PLAYTREES_PATH, SPOTIFY_CURRENT_USER_PATH } from "./settings/api_endpoints";
import React from "react";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: styles },
];

export const loader = async ({request} : LoaderFunctionArgs) => {
	const result : {
		authenticated: boolean,
		hasPremium: boolean,
		displayName: string | null,
		playerPlaytree: {
			summary: PlaytreeSummary,
			playnodes: { [key: string]: Playnode },
			playroots: { [key: string]: Playroot },
			playscopes: Playscope[]
		} | null,
		userPlaytreeSummaries: PlaytreeSummary[] | null,
		accessToken: string | null,
		refreshToken: string | null
	} = {
		authenticated: false,
		hasPremium: false,
		displayName: null,
		playerPlaytree: null,
		userPlaytreeSummaries: null,
		accessToken: null,
		refreshToken: null
	}

	const url = new URL(request.url)
	const justTriedParam : string | null = url.searchParams.get("just-tried")
	const justTriedLogout : boolean = justTriedParam ? justTriedParam === "logout" : false

	const cookie = request.headers.get("Cookie")
	if (justTriedLogout) {
		if (cookie === null || !cookie.includes("__session=")) {
			return result
		}
	}

	const profileRequest = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	const playerRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_PLAYER_PATH)
	const userPlaytreeSummariesRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_USER_PLAYTREES_PATH)

	if (profileRequest.ok) {
		result.authenticated = true
		const profileJson = await profileRequest.json()
		result.hasPremium = profileJson.product === "premium"
		result.displayName = profileJson.display_name
	}
	if (playerRequest.ok) {
		result.playerPlaytree = await playerRequest.json()
	}
	if (userPlaytreeSummariesRequest.ok) {
		result.userPlaytreeSummaries = await userPlaytreeSummariesRequest.json()
	}

	const session = await getSession(cookie)
	const accessToken = session.get("spotify_access_token") ?? null
	const refreshToken = session.get("spotify_refresh_token") ?? null

	return {
		...result,
		accessToken,
		refreshToken
	}
}

export const action = async ({ request }: ActionFunctionArgs) => {
	const formData = await request.formData()
	const playtreeID = formData.get("playtreeID");
	if (playtreeID) {
		await serverFetchWithToken(request, `${PLAYTREE_SERVER_PLAYER_PATH}?playtree=${playtreeID}`, {
			method: "PUT"
		})
	}

	return { autoplay: true }
}

export type TokenType = {accessToken: string | null, refreshToken: string | null}
export const Token = React.createContext<TokenType>({accessToken: null, refreshToken: null })

export default function App() {
	const data = useLoaderData<typeof loader>()
	const playerActionData = useFetcher<typeof action>({ key: "player" })
	const playerPlaytree = playtreeFromJson(data.playerPlaytree)
	const userPlaytreeSummaries = data.userPlaytreeSummaries
	const location = useLocation() // used for React resolution keys

	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body className="bg-amber-100">
				<Scripts />
				<Token.Provider value={{accessToken: data.accessToken, refreshToken: data.refreshToken}}>
					<div className="h-screen overflow-hidden flex">
						<UserSidebar userPlaytreeSummaries={userPlaytreeSummaries} />
						<div className="w-full flex flex-col">
							<Banner isAuthenticated={data.authenticated} displayName={data.displayName}/>
							<div className="w-full h-full overflow-y-auto">
								<Outlet key={location.pathname} />
							</div>
							<Player playtree={playerPlaytree} authenticatedWithPremium={data.authenticated && data.hasPremium} autoplay={playerActionData.data ? playerActionData.data.autoplay : undefined} />
						</div>
					</div>
				</Token.Provider>
			</body>
		</html>
	);
}
