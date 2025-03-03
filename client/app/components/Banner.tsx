import { Link } from "@remix-run/react";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import { SPOTIFY_CURRENT_USER_PATH } from "../api_endpoints";
import { Suspense, useMemo } from "react";

type BannerProps = {
	isAuthenticated: boolean;
	displayName: string | null;
}

export default function Banner(props: BannerProps) {
	return (
		<div className="bg-green-600 text-white font-lilitaOne fixed w-[calc(100vw-16rem)] -h-16 p-3 left-64 top-0 flex justify-between">
			<div className="w-fit">
				<Link to="/" replace><h1 className='text-4xl underline'>Playtree</h1></Link>
			</div>
			<div className="w-fit my-auto">
				{
					props.isAuthenticated ? <h4 className="text-xl">{props.displayName}</h4> :
					<Link to="/login" replace><h3 className='text-2xl'>Login</h3></Link>
				}
			</div>
		</div>
	)
}