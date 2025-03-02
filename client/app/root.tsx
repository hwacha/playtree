import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ShouldRevalidateFunctionArgs,
	useFetcher,
	useLoaderData,
	useLocation
} from "@remix-run/react";

import Player from "./components/Player";

import styles from "./tailwind.css?url";
import UserSidebar from "./components/UserSidebar";
import Banner from "./components/Banner";
import { playtreeFromJson } from "./types";
import { getSession } from "./sessions";
import { useEffect } from "react";
import { serverFetchWithToken } from "./utils/server-fetch-with-token.server";
import { PLAYTREE_SERVER_PLAYER_PATH, PLAYTREE_SERVER_USER_PLAYTREES_PATH, SPOTIFY_CURRENT_USER_PATH } from "./api_endpoints";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: styles },
];

type AuthenticationStatus = "NOT_TRIED" | "SUCCESS" | "FAILURE"

export const loader = async ({request} : LoaderFunctionArgs) => {
	const url = new URL(request.url)
	const authenticationSuccess = url.searchParams.get("authentication-success")

	let authenticationStatus : AuthenticationStatus = "NOT_TRIED"
	if (authenticationSuccess !== undefined) {
		if (authenticationSuccess === "true") {
			authenticationStatus = "SUCCESS"
		} else if (authenticationSuccess === "false") {
			authenticationStatus = "FAILURE"
		}
	}

	// we tried to (re)authenticate, and it failed.
	if (authenticationStatus === "FAILURE") {
		return {
			authenticationStatus: authenticationStatus,
			displayName: null,
			playerPlaytree: null,
			userPlaytreeSummaries: null,
			accessToken: null,
			refreshToken: null
		}
	}

	const session = await getSession(request.headers.get("Cookie"))

	if (authenticationStatus === "NOT_TRIED") {
		// check there's no access token stored as a cookie
		
		if (!session.get("accessToken")) {
			return {
				authenticationStatus: authenticationStatus,
				displayName: null,
				playerPlaytree: null,
				userPlaytreeSummaries: null,
				accessToken: null,
				refreshToken: null
			}
		}
	}

	const profileRequest = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	const profileJson = await profileRequest.json()

	const playerRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_PLAYER_PATH)
	const playerPlaytreeJson = await playerRequest.json()

	const userPlaytreeSummariesRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_USER_PLAYTREES_PATH)
	const userPlaytreeSummariesJson = await userPlaytreeSummariesRequest.json()

	return {
		authenticationStatus: "SUCCESS",
		displayName: profileJson.display_name,
		playerPlaytree: playerPlaytreeJson,
		userPlaytreeSummaries: userPlaytreeSummariesJson,
		accessToken: session.get("accessToken"),
		refreshToken: session.get("refreshToken")
	}
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs): boolean {
	if (!actionResult) {
		return false
	}
	if (!actionResult.revalidate) {
		return false
	}
	return defaultShouldRevalidate
}

export const action = async ({ request }: ActionFunctionArgs) => {
	const formData = await request.formData()
	const id = formData.get("playtreeID");
	await fetch(`http://localhost:8080/me/player?playtree=${id}`, {
		method: "PUT"
	})
	return { autoplay: true, revalidate: true }
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
				<div className="absolute left-48 w-[calc(100vw-12rem)] h-full">
					<Banner isAuthenticated={data.authenticationStatus === "SUCCESS"} displayName={data.displayName}/>
					<div className="absolute w-full h-[calc(100%-13rem)] top-16 -bottom-64">
						<Outlet key={location.pathname} />
					</div>
					<Player playtree={playerPlaytree} autoplay={playerActionData.data ? playerActionData.data.autoplay : undefined} />
				</div>
			</body>
		</html>
	);
}
