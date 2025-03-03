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
import { Playnode, Playroot, Playscope, playtreeFromJson, PlaytreeSummary } from "./types";
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

	const result : {
		authenticationStatus: AuthenticationStatus,
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
		authenticationStatus: "FAILURE",
		displayName: null,
		playerPlaytree: null,
		userPlaytreeSummaries: null,
		accessToken: null,
		refreshToken: null
	}

	// we tried to (re)authenticate, and it failed.
	if (authenticationStatus === "FAILURE") {
		return result
	}

	const session = await getSession(request.headers.get("Cookie"))

	if (authenticationStatus === "NOT_TRIED") {
		// check there's no access token stored as a cookie
		if (!session.get("accessToken")) {
			return {
				...result,
				authenticationStatus: authenticationStatus
			}
		}
	}

	const profileRequest = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	const playerRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_PLAYER_PATH)
	const userPlaytreeSummariesRequest = await serverFetchWithToken(request, PLAYTREE_SERVER_USER_PLAYTREES_PATH)

	if (profileRequest.ok) {
		result.displayName = (await profileRequest.json()).display_name
	}
	if (playerRequest.ok) {
		result.playerPlaytree = await playerRequest.json()
	}
	if (userPlaytreeSummariesRequest.ok) {
		result.userPlaytreeSummaries = await userPlaytreeSummariesRequest.json()
	}

	return {
		...result,
		authenticationStatus: "SUCCESS",
		accessToken: session.get("accessToken") ?? null,
		refreshToken: session.get("refreshToken") ?? null
	}
}

export const action = async ({ request }: ActionFunctionArgs) => {
	const formData = await request.formData()
	const id = formData.get("playtreeID");
	await serverFetchWithToken(request, `${PLAYTREE_SERVER_PLAYER_PATH}?playtree=${id}`, {
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
				<div className="absolute left-64 w-[calc(100vw-16rem)] h-full">
					<Banner isAuthenticated={data.authenticationStatus === "SUCCESS"} displayName={data.displayName}/>
					<div className="absolute w-full h-[calc(100%-17rem)] top-16 -bottom-64">
						<Outlet key={location.pathname} />
					</div>
					<Player playtree={playerPlaytree} autoplay={playerActionData.data ? playerActionData.data.autoplay : undefined} />
				</div>
			</body>
		</html>
	);
}
