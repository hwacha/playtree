import type { ActionFunctionArgs, LinksFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  useLoaderData} from "@remix-run/react";

import Player from "./components/Player";

import styles from "./tailwind.css?url";
import UserSidebar from "./components/UserSidebar";
import Banner from "./components/Banner";
import { playtreeFromJson } from "./types";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: styles },
];

export const loader = async () => {
  const playerPlaytreeJson = await fetch("http://localhost:8080/me/player").then(response => response.json())
  const userPlaytreeSummariesJson = await fetch("http://localhost:8080/playtrees/me").then(response => response.json())
  
  return {
    playerPlaytree: playerPlaytreeJson,
    userPlaytreeSummaries: userPlaytreeSummariesJson
  }
}

export const action = async ({request}: ActionFunctionArgs) => {
    const formData = await request.formData()
    const id = formData.get("playtreeID");
    const response = await fetch(`http://localhost:8080/me/player?playtree=${id}`, {
        method: "PUT"
    })
    return null
}

export default function App() {
  const data = useLoaderData<typeof loader>()
  const playerPlaytree = playtreeFromJson(data.playerPlaytree)
  const userPlaytreeSummaries = data.userPlaytreeSummaries
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-amber-100">
      <Scripts />
      
      <UserSidebar userPlaytreeSummaries={userPlaytreeSummaries}/>
      <div className="absolute left-48 w-[calc(100vw-12rem)] h-full">
        <Banner />
        <div className="absolute w-full h-[calc(100%-13rem)] top-16 -bottom-64">
          <Outlet />
        </div>
        <Player playtree={playerPlaytree} />
      </div>
      </body>
    </html>
  );
}
