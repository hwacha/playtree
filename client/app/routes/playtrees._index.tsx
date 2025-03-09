import { Link, useFetcher, useLoaderData, useRouteError } from "@remix-run/react"
import { PlaytreeSummary } from "../types";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import { SPOTIFY_CURRENT_USER_PATH } from "../settings/spotify_api_endpoints";
import { LoaderFunctionArgs } from "@remix-run/node";
import { useEffect, useRef } from "react";
import { isErrorResponse } from "@remix-run/react/dist/data";
import Snack from "../components/Snack";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const spotifyResponse = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	let hasPremium = false
	if (spotifyResponse.ok) {
		const userInfo = await spotifyResponse.json()
		hasPremium = userInfo.product === "premium"
	}
	
	const url = new URL(request.url)
	const startParam = url.searchParams.get("start")
	let start = 0
	if (startParam) {
		start = parseInt(startParam)
	}
	const playtreesResponse = await fetch(`${process.env.PLAYTREE_SERVER_API_PATH}/playtrees?start=${start}`)

	if (!playtreesResponse.ok) {
		throw new Response("Internal Server Error", { status: 500 })
	}

	return {
		authenticated: spotifyResponse.ok,
		hasPremium: hasPremium,
		playtrees: await playtreesResponse.json(),
		start: start
	}
}

export function ErrorBoundary() {
	const error = useRouteError()
	let message = "Something went wrong."
	if (isErrorResponse(error) && error.status === 500) {
		message = "Failed to retreive playtrees from the server."
	}
	return (
		<Snack type="error" body={<p className="text-white font-markazi text-lg">{message}</p>} />
	)
}

type SummaryCardProps = {
	summary: PlaytreeSummary;
	authenticated: boolean;
	hasPremium: boolean;
}

const SummaryCard = ({ summary, authenticated, hasPremium }: SummaryCardProps) => {
	const fetcher = useFetcher()
	return (
		<div
			className="h-[172px] w-[172px] inline-grid border-4 bg-lime-100 rounded-xl border-green-600 text-center font-lilitaOne m-2 pt-8">
			<h3
				className="text-xl text-green-600 mx-auto max-w-36 overflow-hidden overflow-ellipsis text-nowrap whitespace-nowrap"
				title={summary.name}>{summary.name}
			</h3>
			<p
				className="text-green-600 -mt-2 mx-auto max-w-36 overflow-hidden overflow-ellipsis text-nowrap whitespace-nowrap"
				title={summary.createdBy}
			>by {summary.createdBy}
			</p>
			{
				authenticated ?
				(hasPremium ?
					<fetcher.Form method="post" action="/">
						<input type="hidden" id="playtreeID" name="playtreeID" value={summary.id} />
						<button type="submit" className="border-2 border-green-600 rounded-md px-3 py-2 bg-green-600 text-white">Play</button>
					</fetcher.Form> :
					<p className="font-markazi text-md">Your account must have <a target="_blank" rel="noopener noreferrer" href="https://www.spotify.com/us/premium/" className="text-blue-400 underline">Spotify Premium</a> to play a playtree.</p>
				) :
				<p className="font-markazi my-8">
					<Link to="/login" className="text-blue-400 underline">Log in</Link> to play a playtree.
				</p>
			}
		</div>
	)
}

export default function Index() {
	const data = useLoaderData<typeof loader>()
	const scrollRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		scrollRef.current?.scrollTo({top: 0, behavior: "smooth"})
	}, [data.start])
	
	return (
		<div ref={scrollRef} className="w-full flex flex-wrap justify-center">
			{
				data.playtrees.map((summary: any) => {
					return (
						<SummaryCard
							key={summary.id}
							summary={summary}
							authenticated={data.authenticated}
							hasPremium={data.hasPremium}
						/>
					)
				})
			}
			<div className="w-full flex justify-center">
				{
					data.start > 0 ?
					<Link to={`/playtrees?start=${Math.max(data.start - 60, 0)}`}>
						<button className="bg-amber-400 mb-2 mx-1 px-2 py-1 rounded-lg text-xl font-markazi">
							Previous
						</button>
					</Link>
					: null
				}
				{
					data.playtrees.length >= 60 ?
					<Link to={`/playtrees?start=${data.start + 60}`}>
						<button className="bg-green-400 mb-2 mx-1 px-2 py-1 rounded-lg text-xl font-markazi">
							Next
						</button>
					</Link>
					: null
				}
			</div>
		</div>
	)
}
