import { Link } from "@remix-run/react";

type UserSidebarProps = {
    userPlaytreeSummaries: PlaytreeSummary[];
}

export default function UserSidebar(props : UserSidebarProps) {
    return (
        <aside id="sidebar-multi-level-sidebar" className="fixed top-0 left-0 z-40 w-48 h-screen transition-transform -translate-x-full sm:translate-x-0" aria-label="Sidebar">
            <div className="h-full border-4">
                    <nav>
                        {
                            props.userPlaytreeSummaries.map(summary => {
                                return <div>
                                    {summary.name}
                                    <Link to={`playtrees/${summary.id}/edit`}><button className="ml-3 bg-blue-500">Edit</button></Link>
                                    </div>
                            })
                        }
                    </nav>
            </div>
        </aside>)
}