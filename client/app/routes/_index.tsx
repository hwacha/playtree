import { ActionFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import { SPOTIFY_CURRENT_USER_PATH } from "../api_endpoints";
import Snack from "../components/Snack";
import { getSession } from "../sessions";

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
	description: string;
	action: string;
	path: string;
}

const ActionCard = (props: LinkCardProps) => {
	return (
		<div className="relative border-green-600 bg-green-100 bg-opacity-50 border-2 rounded-lg h-48 w-48 font-lilitaOne text-green-600 p-2 mx-4">
			<h2 className="text-4xl text-center underline">{props.title}</h2>
			<p className="mt-4 ml-2 font-markazi">{props.description}</p>
			<div className="absolute bottom-2 flex items-center w-48 -mx-4">
				<Link to={props.path} replace className="mx-auto">
					<button type="button" className="border-green-600 bg-green-300 border-2 rounded-md px-2 py-1">{props.action}</button>
				</Link>
			</div>
		</div>
	)
}

export default function Index() {
	const authenticationInfo = useLoaderData<typeof loader>()
	return (
		<div className="flex w-full h-full content-evenly">
			{
				authenticationInfo.justTriedLogin || authenticationInfo.justTriedLogout ?
				<div
					className="absolute"><Snack
					type={authenticationInfo.authenticated === authenticationInfo.justTriedLogin ? "success" : "error"}
					body={<p>{authenticationInfo.justTriedLogin ? "Login" : "Logout"} {authenticationInfo.authenticated === authenticationInfo.justTriedLogin ? "successful" : "failed"}.</p>} />
				</div>
				: null
			}
			<div className="m-auto flex">
				<ActionCard title="Arboretum" description="A compendium of all public playtrees." action="Check it Out" path="/playtrees" />
				<ActionCard title="Seed" description="A new playtree." action="Create" path="/playtrees/create" />
			</div>
		</div>
	)
}