import { ActionFunctionArgs } from "@remix-run/node";
import { Await, redirect, useFetcher } from "@remix-run/react";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { Suspense, useMemo } from "react";

export const action = async ({request}: ActionFunctionArgs) => {
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
    const fetcher = useFetcher()

    const username = useMemo(async () => {
        const spotify = SpotifyApi.withUserAuthorization(import.meta.env.VITE_SPOTIFY_CLIENT_ID,
            "http://localhost:5173",
            [
                "streaming",
                "user-read-playback-state",
                "user-modify-playback-state",
                "user-read-email",
                "user-read-private"
            ])
        const profile = await spotify.currentUser.profile()
        return profile.id
    }, [])

    return (
        <div className="flex w-full h-full my-40 content-evenly">
            <div className="m-auto border-green-600 bg-neutral-100 h-fit border-2 rounded-xl font-lilitaOne text-green-600 p-4">
                <Suspense fallback={"Retreiving username..."}>
                    <Await resolve={username}>
                        {
                        (resolvedUsername) => <fetcher.Form method="POST">
                            <input type="hidden" name="createdBy" value={resolvedUsername}></input>
                            <div className="w-full mb-2">
                                <label htmlFor="name" className="mr-4">Playtree Name</label>
                                <input type="text" autoComplete="off" id="name" name="name" placeholder="New Playtree" className="text-black font-markazi" />
                            </div>
                            <div className="w-full">
                            <label htmlFor="access-checkbox" className="mr-3">Playtree Public</label>
                                <input type="checkbox" id="access-checkbox" name="access"/>
                            </div>
                            <div className="w-full flex">
                                <button type="submit" className="border-green-600 bg-green-200 border-2 rounded-md p-2 mx-auto mt-6">Create</button>
                            </div>
                        </fetcher.Form>
                        }
                    </Await>

                </Suspense>

            </div>
        </div>
        
    )
}