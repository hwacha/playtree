import { ActionFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import { SPOTIFY_CURRENT_USER_PATH } from "../settings/api_endpoints";
import Snack from "../components/Snack";

export const loader = async ({ request }: ActionFunctionArgs) => {
	const url = new URL(request.url)
	const justTriedParam : string | null = url.searchParams.get("just-tried")
	const justTriedLogin : boolean = justTriedParam ? justTriedParam === "login" : false
	const justTriedLogout : boolean = justTriedParam ? justTriedParam === "logout" : false

	const cookie = request.headers.get("Cookie")
	if (justTriedLogout) {
		return {
			justTriedLogin: justTriedLogin,
			justTriedLogout: justTriedLogout,
			authenticated: cookie !== null && cookie.includes("__session=")
		}
	}
	const response = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	if (response.ok) {
		return {
			justTriedLogin: justTriedLogin,
			justTriedLogout: justTriedLogout,
			authenticated: true
		}
	} else if (response.status === 401) {
		return {
			justTriedLogin: justTriedLogin,
			justTriedLogout: justTriedLogout,
			authenticated: false
		}
	}
	return {
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
	const authenticationInfo = useLoaderData<typeof loader>()
	return (
		<div className="flex w-full h-full justify-center items-center flex-wrap">
			{
				authenticationInfo.justTriedLogin || authenticationInfo.justTriedLogout ?
				<div className="absolute left-2 top-2">
					<Snack
						type={authenticationInfo.authenticated === authenticationInfo.justTriedLogin ? "success" : "error"}
						body={<p>{authenticationInfo.justTriedLogin ? "Login" : "Logout"} {authenticationInfo.authenticated === authenticationInfo.justTriedLogin ? "successful" : "failed"}.</p>} />
				</div>
				: null
			}
			<ActionCard title="Arboretum" imageSrc="/images/tree-garden.jpg" description="A compendium of all public playtrees." action="Check it Out" path="/playtrees" />
			<ActionCard title="Seedling" imageSrc="/images/seedling.jpg" description="Create a new playtree." action="Create" path="/playtrees/create" />
		</div>
	)
}