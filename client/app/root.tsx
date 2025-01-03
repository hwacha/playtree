import type { LinksFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  useLoaderData} from "@remix-run/react";

import Player from "./components/Player";

import styles from "./tailwind.css?url";
import UserSidebar from "./components/UserSidebar";

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

export default function App() {
  const data = useLoaderData<typeof loader>()
  const playerPlaytree = data.playerPlaytree
  const userPlaytreeSummaries = data.userPlaytreeSummaries
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-amber-100 h-full">
      <Scripts />
      
      <UserSidebar userPlaytreeSummaries={userPlaytreeSummaries}/>
      <div className="ml-48">
      <h1 className='font-lilitaOne text-green-600 text-8xl text-center underline mt-12'>Playtree</h1>
        <Outlet />
        <Player playtree={playerPlaytree} />
      </div>
      </body>
    </html>
  );
}
