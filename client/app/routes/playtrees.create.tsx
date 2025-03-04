import { ActionFunctionArgs } from "@remix-run/node";
import { Link, redirect, useFetcher, useLoaderData } from "@remix-run/react";
import { getSession } from "../sessions";
import { PLAYTREE_SERVER_PLAYTREES_PATH, SPOTIFY_CURRENT_USER_PATH } from "../api_endpoints";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import Snack from "../components/Snack";

export const loader = async ({ request }: ActionFunctionArgs) => {
	const response = await serverFetchWithToken(request, SPOTIFY_CURRENT_USER_PATH)
	if (response.ok) {
		const userInfo = await response.json()
		return {
			authenticated: true,
			username: userInfo.id
		}
	} else if (response.status === 401) {
		return {
			authenticated: false,
			username: null
		}
	} else {
		return {
			authenticated: true,
			username: null
		}
	}
}

export const action = async ({ request }: ActionFunctionArgs) => {
	const formData = await request.formData()
	const response = await serverFetchWithToken(request, PLAYTREE_SERVER_PLAYTREES_PATH, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			name: formData.get("name"),
			createdBy: formData.get("createdBy"),
			access: formData.get("access") === "on" ? "public" : "private",
		})
	})
	const newPlaytreeID = await response.text()

	return redirect(`/playtrees/${newPlaytreeID}/edit`)
}

export default function Create() {
	const data = useLoaderData<typeof loader>()

	if (data.username === null) {
		if (data.authenticated) {
			return <Snack type="error" body={<p>Something happened. <Link to="/" className="text-blue-400 underline">Go Home</Link></p>}/>
		} else {
			return <Snack type="error" body={<p>You must be logged in to create a playtree. <Link to="/login" className="text-blue-400 underline">Log in</Link></p>}/>
		}
	}

	const fetcher = useFetcher()

	return (
		<div className="flex w-full h-full content-evenly">
			<div className="m-auto border-green-600 bg-neutral-100 h-fit border-2 rounded-xl font-markazi text-xl text-green-600 p-4">
				<fetcher.Form method="POST">
					<input type="hidden" name="createdBy" value={data.username}></input>
					<div className="w-full mb-2">
						<label htmlFor="name" className="mr-4">Playtree Name</label>
						<input type="text" autoComplete="off" id="name" name="name" placeholder="New Playtree" className="text-black font-markazi" />
					</div>
					<div className="w-full">
						<label htmlFor="access-checkbox" className="mr-3">Playtree Public</label>
						<input type="checkbox" id="access-checkbox" name="access" />
					</div>
					<div className="w-full flex">
						<button type="submit" className="border-none bg-blue-300 text-black font-markazi border-2 rounded-md p-2 mx-auto mt-6">Create</button>
					</div>
				</fetcher.Form>
			</div>
		</div>

	)
}