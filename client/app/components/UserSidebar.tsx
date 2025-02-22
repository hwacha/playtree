import { Link, useFetcher } from "@remix-run/react";
import { PlaytreeSummary } from "../types";

type UserSidebarProps = {
    userPlaytreeSummaries: PlaytreeSummary[];
}

export default function UserSidebar(props : UserSidebarProps) {
    const fetcher = useFetcher({key: "player"})
    return (
        <aside id="sidebar-multi-level-sidebar" className="fixed font-markazi top-0 left-0 z-40 w-48 h-screen transition-transform -translate-x-full sm:translate-x-0" aria-label="Sidebar">
            <div className="h-full border-4 border-green-600 bg-green-100 px-1">
                    <h3 className="text-xl"><strong>Your Playtrees</strong></h3>
                    <nav>
                        {
                            props.userPlaytreeSummaries.map((summary, index) => {
                                return (
                                    <div key={index} className="flex justify-between my-1">
                                        {summary.name}
                                        <div className="flex">
                                            <fetcher.Form method="POST" action="/">
                                                <input type="hidden" id="playtreeID" name="playtreeID" value={summary.id} />
                                                <button type="submit" className="bg-green-300 px-2">Play</button>
                                            </fetcher.Form>
                                            <Link to={`playtrees/${summary.id}/edit`}><button className="ml-3 bg-blue-300 px-2">Edit</button></Link>
                                        </div>
                                    </div>
                                )
                            })
                        }
                    </nav>
                    <h3 className="text-xl"><strong>Saved Playtrees</strong></h3>
                    <nav>
                        Not implemented
                    </nav>
            </div>
        </aside>
    )
}