import { ActionFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import { SPOTIFY_CURRENT_USER_PATH } from "../settings/spotify_api_endpoints";
import Snack from "../components/Snack";
import { useMemo, useState } from "react";
import Modal from "../components/Modal";

export const loader = async ({ request }: ActionFunctionArgs) => {
	const url = new URL(request.url)
	const justTriedParam : string | null = url.searchParams.get("just-tried")
	const justTriedLogin : boolean = justTriedParam ? justTriedParam === "login" : false
	const justTriedLogout : boolean = justTriedParam ? justTriedParam === "logout" : false

	const firstVisitParam : string | null = url.searchParams.get("first-visit")
	const firstVisit : boolean = firstVisitParam ? firstVisitParam !== "false" : true

	const cookie = request.headers.get("Cookie")
	if (justTriedLogout) {
		return {
			firstVisit: firstVisit,
			justTriedLogin: justTriedLogin,
			justTriedLogout: justTriedLogout,
			authenticated: cookie !== null && cookie.includes("__session=")
		}
	}
	const response = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	if (response.ok) {
		return {
			firstVisit: firstVisit,
			justTriedLogin: justTriedLogin,
			justTriedLogout: justTriedLogout,
			authenticated: true
		}
	} else if (response.status === 401) {
		return {
			firstVisit: firstVisit,
			justTriedLogin: justTriedLogin,
			justTriedLogout: justTriedLogout,
			authenticated: false
		}
	}
	return {
		firstVisit: firstVisit,
		justTriedLogin: justTriedLogin,
		justTriedLogout: justTriedLogout,
		authenticated: false
	}
}

type LinkCardProps = {
	title: string;
	imageSrc: string;
	description: string;
	action: string;
	path: string;
}

const ActionCard = (props: LinkCardProps) => {
	return (
		<div className="overflow-hidden">
			<div
				className="relative mx-4 w-48 h-48 lg:w-64 lg:h-64 xl:w-96 xl:h-96 aspect-square rounded-lg"
				style={{
					background: `url(${props.imageSrc})`,
					backgroundSize: "cover"
				}}
			>
				{/* <img src={props.imageSrc} alt={props.title} className="absolute bottom-0 left-0 z-[1] opacity-85 rounded-b-lg blur-none" /> */}
				<div className="h-full w-full border-green-600 border-4 rounded-lg font-lilitaOne text-white p-2 relative z-[2] blur-none">
					<h2 className="text-4xl text-center underline">{props.title}</h2>
					<p className="mt-2 ml-2 text-lg">{props.description}</p>
					<div className="absolute bottom-2 flex justify-center w-full -mx-4">
						<Link to={props.path} replace >
							<button type="button" className="border-green-600 bg-green-600 text-white border-2 rounded-md px-2 py-1">{props.action}</button>
						</Link>
					</div>
				</div>
			</div>
		</div>

	)
}



export default function Index() {
	const data = useLoaderData<typeof loader>()

	const [supportModalVisible, setSupportModalVisible] = useState<boolean>(data.firstVisit)
	const supportString = useMemo(() => "This application uses the Spotify API, which is currently limited to invited users. \
		If you haven't already, send your full name and the email associated with your Spotify Prime account \
		to support@playtree.gdn to try out the Spotify features.", [])

	return (
		<div className="w-full h-full flex flex-col">
			<div className="w-full h-full basis-1/12 min-h-[calc(100%/12)]">
			{
				data.justTriedLogin || data.justTriedLogout ?
				
					<Snack
						type={data.authenticated === data.justTriedLogin ? "success" : "error"}
						body={<p>{data.justTriedLogin ? "Login" : "Logout"} {data.authenticated === data.justTriedLogin ? "successful" : "failed"}.</p>} />
				
				: null
			}
			</div>
			{ !supportModalVisible || <Modal type="normal" size="large" description={supportString} exitAction={() => setSupportModalVisible(_ => false)}/> }
			<div className="w-full h-full basis-11/12 flex justify-center items-center flex-wrap">
				<ActionCard title="Arboretum" imageSrc="/images/tree-garden.jpg" description="A compendium of all public playtrees." action="Check it Out" path="/playtrees" />
				<ActionCard title="Seedling" imageSrc="/images/seedling.jpg" description="Create a new playtree." action="Create" path="/playtrees/create" />
			</div>
		</div>

	)
}