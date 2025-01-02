import type { LinksFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  useLoaderData} from "@remix-run/react";

import Player from "./components/Player";

import styles from "./tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: styles },
];

export const loader = async () => {
  const response = await fetch("http://localhost:8080/me/player")
  return response.json()
}

export default function App() {
  const playtree = useLoaderData<typeof loader>()
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
      <h1 className='font-lilitaOne text-green-600 text-8xl text-center underline mt-12'>Playtree</h1>
      <Outlet />
      <Player playtree={playtree} />
      </body>
    </html>
  );
}
