import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	useFetcher,
	useLoaderData,
	useLocation
} from "@remix-run/react";

import Player from "./components/Player";

import styles from "./tailwind.css?url";
import UserSidebar from "./components/UserSidebar";
import Banner from "./components/Banner";
import { Playnode, Playroot, Playscope, playtreeFromJson, PlaytreeSummary } from "./types";
import { getSession } from "./sessions";
import { useEffect } from "react";
import { serverFetchWithToken } from "./utils/server-fetch-with-token.server";
import { PLAYTREE_SERVER_PLAYER_PATH, PLAYTREE_SERVER_USER_PLAYTREES_PATH, SPOTIFY_CURRENT_USER_PATH } from "./api_endpoints";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: styles },
];

export const loader = async ({request} : LoaderFunctionArgs) => {
	console.log("root loader with request", request)
	const result : {
		authenticated: boolean,
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

	console.log("requesting profile")
	const profileRequest = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	console.log("requesting player")
	const playerRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_PLAYER_PATH)
	console.log("requesting playtreeSummaries")
	const userPlaytreeSummariesRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_USER_PLAYTREES_PATH)

	if (profileRequest.ok) {
		result.authenticated = true
		console.log("reading profile body")
		result.displayName = (await profileRequest.json()).display_name
	}
	if (playerRequest.ok) {
		console.log("reading player body")
		result.playerPlaytree = await playerRequest.json()
	}
	if (userPlaytreeSummariesRequest.ok) {
		console.log("reading playtree summaries body")
		result.userPlaytreeSummaries = await userPlaytreeSummariesRequest.json()
	}

	const session = await getSession(cookie)
	return {
		...result,
		accessToken: session.get("spotify_access_token") ?? null,
		refreshToken: session.get("spotify_refresh_token") ?? null
	}
}

export const action = async ({ request }: ActionFunctionArgs) => {
	console.log("root action", request)
	const formData = await request.formData()
	const id = formData.get("playtreeID");
	console.log(`making PUT request for playtree=${id}`)
	await serverFetchWithToken(request, `${PLAYTREE_SERVER_PLAYER_PATH}?playtree=${id}`, {
		method: "PUT"
	})
	return { autoplay: true }
}

export default function App() {
	const data = useLoaderData<typeof loader>()
	const playerActionData = useFetcher<typeof action>({ key: "player" })
	const playerPlaytree = playtreeFromJson(data.playerPlaytree)
	const userPlaytreeSummaries = data.userPlaytreeSummaries
	const location = useLocation() // used for React resolution keys

	useEffect(() => {
		if (data.accessToken) {
			localStorage.setItem("spotify_access_token", data.accessToken)
		}
		if (data.refreshToken) {
			localStorage.setItem("spotify_refresh_token", data.refreshToken)
		}
	}, [])

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
				<UserSidebar userPlaytreeSummaries={userPlaytreeSummaries} />
				<div className="absolute left-64 w-[calc(100vw-16rem)] h-full">
					<Banner isAuthenticated={data.authenticated} displayName={data.displayName}/>
					<div className="absolute w-full h-[calc(100%-13rem)] top-16 -bottom-64">
						<Outlet key={location.pathname} />
					</div>
					<Player playtree={playerPlaytree} autoplay={playerActionData.data ? playerActionData.data.autoplay : undefined} />
				</div>
			</body>
		</html>
	);
}
