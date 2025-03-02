import { ActionFunctionArgs } from "@remix-run/node";
import { redirect, useFetcher, useLoaderData } from "@remix-run/react";
import { clientFetchWithToken } from "../utils/fetch-with-token";
import { getSession } from "../sessions";

export const loader = async ({ request }: ActionFunctionArgs) => {
	const session = await getSession(request.headers.get("Cookie"))
	const response = await fetch("https://api.spotify.com/v1/me", {
		headers: {
			Authorization: "Bearer " + session.get("accessToken")
		}
	})
	const userInfo = await response.json()
	return userInfo.id
}

export const action = async ({ request }: ActionFunctionArgs) => {
	const formData = await request.formData()
	const response = await fetch("http://localhost:8080/playtrees", {
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
	const username = useLoaderData<string>()
	const fetcher = useFetcher()

	return (
		<div className="flex w-full h-full my-40 content-evenly">
			<div className="m-auto border-green-600 bg-neutral-100 h-fit border-2 rounded-xl font-lilitaOne text-green-600 p-4">
				<fetcher.Form method="POST">
					<input type="hidden" name="createdBy" value={username}></input>
					<div className="w-full mb-2">
						<label htmlFor="name" className="mr-4">Playtree Name</label>
						<input type="text" autoComplete="off" id="name" name="name" placeholder="New Playtree" className="text-black font-markazi" />
					</div>
					<div className="w-full">
						<label htmlFor="access-checkbox" className="mr-3">Playtree Public</label>
						<input type="checkbox" id="access-checkbox" name="access" />
					</div>
					<div className="w-full flex">
						<button type="submit" className="border-green-600 bg-green-200 border-2 rounded-md p-2 mx-auto mt-6">Create</button>
					</div>
				</fetcher.Form>
			</div>
		</div>

	)
}