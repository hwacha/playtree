# Playtree

Playtree is an application that plays audio non-linearly. Instead of playing songs from a playlist sequentially or shuffled, a playtree chooses the next song by randomly choosing one of a song node's children. Playback can loop and branch. Playtrees can have multiple roots, which each form separate playheads a user can switch between.

The playtree server is written using Go. The playtree client is written with Remix/React, with Tailwind for styling. The playtree editor uses the React Flow library, and a web player is created with the Spotify Web Player SDK.

Go to https://playtree.gdn on a desktop or laptop computer to try out playtree. You can visit the arboretum to check out public playtrees other users have made, or you can make one of your own.

To play music from a playtree, you need to sign in to Spotify with a Spotify Premium account.

Created by [@hwacha](https://github.com/hwacha).

## Setup

### Prerequisites
1. [Install Go (1.23.3)](https://go.dev/doc/install)
2. [Install node (22.11.0) and npm (11.2.0)](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
3. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create a new application.
4. Clone this repository.
 
### Server
From the repository directory:
1. `cd server/`
2. `go run *.go`

The server will start running on `localhost:8080`.

### Client
#### Dev Build
From the repository directory, in a separate tab from the server:
1. `cd client/`
2. `touch .env.local`
```
# .env.local
PLAYTREE_SERVER_API_PATH=http://localhost:8080
PLAYTREE_REMIX_SERVER_API_PATH=http://localhost:5173
PLAYTREE_SPOTIFY_CLIENT_ID=[your Spotify application ID]
PLAYTREE_SPOTIFY_CLIENT_SECRET=[your Spotify application secret]
```
3. Go to your application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). Copy and paste the application ID and secret into your `.env.local` file.
4. `npm install`
5. `npm run dev`
6. Visit `http://localhost:5173` on your browser.

#### Production Build
If you would like to run a production build of Playtree:
1. Instead of the .env file, you'll have to `export` those environment variables to your system environment. You could handle this by entering the following command while in the `client` directory: `sed -E '/^#/d; s/^(.*)=(.*)$/export \1=\2/' .env.local >> ~/.bashrc`. Replace `.bashrc` with `.zshrc`, if you use `zsh`.
2. Vite will set the Remix server port to `3000` in a production build, so keep mind to use `PLAYTREE_REMIX_SERVER_API_PATH=http://localhost:3000` instead of `localhost:5173`.
3. `source ~/.bashrc`
4. `npm run build`
5. `npm run start`.
6. Visit `localhost:3000` on your browser.

## Learn More
Learn more about Playtree at [my personal site](https://hwacha.github.io).
