import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
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
import { SPOTIFY_CURRENT_USER_PATH } from "./settings/spotify_api_endpoints";
import React from "react";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: styles },
];

export const loader = async ({request} : LoaderFunctionArgs) => {
	const result : {
		authenticated: boolean,
		hasPremium: boolean,
		accountID: null,
		displayName: string | null,
		playerPlaytree: {
			summary: PlaytreeSummary,
			playnodes: { [key: string]: Playnode },
			playroots: { [key: string]: Playroot },
			playscopes: Playscope[]
		} | null,
		userPlaytreeSummaries: PlaytreeSummary[] | null,
		accessToken: string | null,
		refreshToken: string | null,
		playtreeRemixServerAPIPath: string | undefined,
		playtreeServerAPIPath: string | undefined,
	} = {
		authenticated: false,
		hasPremium: false,
		accountID: null,
		displayName: null,
		playerPlaytree: null,
		userPlaytreeSummaries: null,
		accessToken: null,
		refreshToken: null,
		playtreeRemixServerAPIPath: process.env.PLAYTREE_REMIX_SERVER_API_PATH,
		playtreeServerAPIPath: process.env.PLAYTREE_SERVER_API_PATH,
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
	const playerRequest = await serverFetchWithToken(request, `${process.env.PLAYTREE_SERVER_API_PATH}/me/player` )
	const userPlaytreeSummariesRequest = await serverFetchWithToken(request, `${process.env.PLAYTREE_SERVER_API_PATH}/playtrees/me` as string)
	
	if (profileRequest.ok) {
		result.authenticated = true
		const profileJson = await profileRequest.json()
		result.hasPremium = profileJson.product === "premium"
		result.displayName = profileJson.display_name
		result.accountID = profileJson.id
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
		await serverFetchWithToken(request, `${process.env.PLAYTREE_SERVER_API_PATH}/me/player?playtree=${playtreeID}`, {
			method: "PUT"
		})
	}

	return null
}

export function ErrorBoundary() {
	return (<html>
		<head>
			<title>Something went wrong</title>
			<Meta/>
			<Links/>
		</head>
		<body>
			<Scripts/>
			<div className="h-screen bg-amber-100 justify-center p-8">
				<h1 className="font-markazi text-3xl text-green-600 mx-auto">Something went wrong.</h1>
				<Link className="font-markazi text-lg text-blue-400 underline" to="/">Try Again</Link>
			</div>
		</body>
	</html>)
}

export type TokenType = {accessToken: string | null, refreshToken: string | null}
export const Token = React.createContext<TokenType>({accessToken: null, refreshToken: null })
export type ServersType = { remix: string | null, playtree: string | null }
export const ServerPath = React.createContext<ServersType>({remix: null, playtree: null})

export default function App() {
	const data = useLoaderData<typeof loader>()
	const playerPlaytree = data.playerPlaytree ? playtreeFromJson(data.playerPlaytree) : null
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
				<ServerPath.Provider value={{ remix: data.playtreeRemixServerAPIPath ?? null, playtree: data.playtreeServerAPIPath ?? null}}>
					<Token.Provider value={{accessToken: data.accessToken, refreshToken: data.refreshToken}}>
						<div className="h-screen overflow-hidden flex">
							<UserSidebar userPlaytreeSummaries={userPlaytreeSummaries} />
							<div className="w-full flex flex-col">
								<Banner isAuthenticated={data.authenticated} accountID={data.accountID} displayName={data.displayName}/>
								<div className="w-full h-full overflow-y-auto">
									<Outlet key={location.pathname} />
								</div>
								<Player playtree={playerPlaytree} authenticatedWithPremium={data.authenticated && data.hasPremium} />
							</div>
						</div>
					</Token.Provider>
				</ServerPath.Provider>
			</body>
		</html>
	);
}
