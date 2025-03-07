import { Link, useFetcher } from "@remix-run/react";
import { PlaytreeSummary } from "../types";

type UserSidebarProps = {
	userPlaytreeSummaries: PlaytreeSummary[] | null;
}

export default function UserSidebar(props: UserSidebarProps) {
	const fetcher = useFetcher({ key: "player" })

	return (
		<div className="w-64 min-w-32 h-full border-4 border-green-600 bg-green-200 font-markazi bg-opacity-50 px-2 pt-[1.125rem] overflow-y-auto">
			<h3 className="text-2xl font-lilitaOne text-green-600 underline"><strong>Your Playtrees</strong></h3>
			<nav>
				{
					props.userPlaytreeSummaries === null ?
					<p className="text-xl"><Link to="/login" className="text-blue-400 underline">Log in with Spotify</Link> to see your playtrees here.</p>
					: props.userPlaytreeSummaries.map((summary, index) => {
						return (
							<div key={index} className="group flex justify-between my-3 text-xl">
								<div className="my-auto max-w-64 whitespace-nowrap overflow-hidden overflow-ellipsis" title={summary.name}>{summary.name}</div>
								<div className="flex my-auto min-h-9">
									<fetcher.Form method="POST" action="/" className="hidden group-hover:block">
										<input type="hidden" id="playtreeID" name="playtreeID" value={summary.id} />
										<button type="submit" title={`Play ${summary.name}`} className="bg-green-300 rounded-md px-2 py-1">Play</button>
									</fetcher.Form>
									<Link to={`playtrees/${summary.id}/edit`} replace className="hidden group-hover:block">
										<button title={`Edit ${summary.name}`} className="ml-3 bg-blue-300 rounded-md z-100 px-2 py-1">Edit</button>
									</Link>
								</div>
							</div>
						)
					})
				}
			</nav>
			{/* <h3 className="text-xl"><strong>Saved Playtrees</strong></h3>
			<nav>
				Not implemented
			</nav> */}
		</div>
	)
}