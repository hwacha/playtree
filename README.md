# playtree

Playtree is an application that plays audio non-linearly. Instead of playing songs from a playlist in a row or shuffling, a playtree chooses the next song by randomly choosing one of a song node's children. Loops from one of a node's ancestors can also be specified. Finally, playtrees can have multiple roots, which each form separate playheads a user can switch between.

The playtree server for playtree is written using Go. The playtree client is written with Remix/React, with Tailwind for styling.

## Upcoming Features
Playtree is a work in progress. The following major features have yet to be implemented:
  - [ ] Database to replace server's file storage of playtree data
  - [ ] A graphical playtree editor using React Flow
  - [ ] User authentication using auth0
  - [ ] Replacement of local audio files with calls to Spotify API
  - [ ] Material UI components to replace placeholder UI

## Installation Instructions
To try out playtree locally, clone this repository and perform the following instructions.

### Server
1. Install `go` if not already installed.
2. Navigate to the `server/` directory.
3. Run `go run *.go`
4. Make calls to the Playtree API:
  - `curl -X   POST https://localhost:8080/playtrees/ --data "<playtree>"` <- Adds a playtree
  - `curl -X    PUT https://localhost:8080/playtrees/<id> --data "<playtree>"` <- Edits an existing playtree
  - `curl -X DELETE https://localhost:8080/playtrees/<id>` <- Removes an existing playtree
  
  `<id>` is the ID of an existing playtree.
  `<playtree>` should be a JSON string in the playtree format. Check out `playtrees/tones.json` for an example.

### Client
1. Navigate to the `client/` directory.
2. Install `node` and `npm` if not already installed.
3. Add any audio files you specified in a custom playtree to the `public/audio/` directory.
4. Run `npm install`
5. Run `npm run dev`
6. Open `localhost:5173` on your browser.
