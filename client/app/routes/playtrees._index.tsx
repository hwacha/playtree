import { Link, useFetcher, useLoaderData } from "@remix-run/react"
import { PlaytreeSummary } from "../types";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import { SPOTIFY_CURRENT_USER_PATH } from "../api_endpoints";
import { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const spotifyResponse = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	const playtreesResponse = await fetch("http://localhost:8080/playtrees")

	return {
		authenticated: spotifyResponse.ok,
		playtrees: await playtreesResponse.json()
	}
}

type SummaryCardProps = {
	summary: PlaytreeSummary;
	authenticated: boolean;
}

const SummaryCard = ({ summary, authenticated }: SummaryCardProps) => {
	const fetcher = useFetcher()
	return (
		<div className="h-[192px] w-[192px] inline-grid border-4 bg-lime-100 rounded-xl border-green-600 text-center font-lilitaOne m-6 py-10">
			<h3 className="text-xl text-green-600">{summary.name}</h3>
			<p className="text-green-600">by {summary.createdBy}</p>
			{
				authenticated ?
				<fetcher.Form method="post" action="/">
					<input type="hidden" id="playtreeID" name="playtreeID" value={summary.id} />
					<button type="submit" className="border-2 border-green-600 rounded-md px-3 py-2 m-4 bg-green-600 text-white">Play</button>
				</fetcher.Form> :
				<p className="font-markazi my-8"><Link to="/login" className="text-blue-400 underline">Log in</Link> to play a playtree.</p>
			}

		</div>
	)
}

export default function Index() {
	const data = useLoaderData<typeof loader>()
	return (<div className="mt-24 m-auto w-fit">{data.playtrees.map((summary: any) => {
		return <SummaryCard key={summary.id} summary={summary} authenticated={data.authenticated}></SummaryCard>
	})}</div>)
}
