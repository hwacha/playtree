# playtree

Playtree is an application that plays audio non-linearly. Instead of playing songs from a playlist in a row or shuffling, a playtree chooses the next song by randomly choosing one of a song node's children. Loops from one of a node's ancestors can also be specified. Finally, playtrees can have multiple roots, which each form separate playheads a user can switch between.

The playtree server is written using Go. The playtree client is written with Remix/React, with Tailwind for styling. The playtree editor uses the React Flow library, and a web player is created with the Spotify Web Player SDK.

## Usage
To play music on Playtree, you must sign in to Spotify with a Spotify Premium account.

## Installation Instructions
To try out playtree locally, clone this repository and perform the following instructions.

### Server
1. Install `go` if not already installed.
2. Navigate to the `server/` directory.
3. Run `go run *.go`

### Client
1. Navigate to the `client/` directory.
2. Install `node` and `npm` if not already installed.
3. Run `npm install`
4. Run `npm run dev`
5. Open `localhost:5173` on your browser.
