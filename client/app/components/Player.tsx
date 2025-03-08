import { ReactElement, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Playitem, Playnode, Playtree } from "../types";
import deepEqual from "deep-equal";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import reducer, { Playhead } from "../reducers/player";
import { SPOTIFY_PAUSE_PATH, SPOTIFY_PLAY_PATH, SPOTIFY_PLAYER_PATH } from "../settings/spotify_api_endpoints";
import { getDeviceName } from "../utils/getDeviceName.client";
import Snack from "./Snack";
import { ServerPath, Token } from "../root";

type PlayerProps = {
	playtree: Playtree | null
	authenticatedWithPremium: boolean
	autoplay: boolean | undefined
}

export default function Player({ playtree, authenticatedWithPremium, autoplay }: PlayerProps) {
	const initialPlayheadIndex = 0
	let initialPlayheads: Playhead[] = []

	const [state, dispatch] = useReducer<typeof reducer>(reducer, {
		playheads: initialPlayheads,
		playheadIndex: initialPlayheadIndex,
		leastScopeByNode: new Map<string, number>(),
		leastScopeByEdge: new Map<string, Map<string, number>>(),
		messageLog:[],
		playing: false,
		autoplay: autoplay ?? false,
		spotifyPlayerReady: undefined,
	})

	const prevPlaybackState = useRef<Spotify.PlaybackState | null>(null)
	const [spotifyWebPlayer, setSpotifyWebPlayer] = useState<Spotify.Player | null>(null)

	const remixServerPath = useContext(ServerPath).remix ?? undefined
	const token = useContext(Token)

	const spotifyPlayer = useRef<Spotify.Player | null>(null)

	useEffect(() => {
		if (!authenticatedWithPremium) {
			return
		}
		
		const script = document.createElement("script");
		script.src = "https://sdk.scdn.co/spotify-player.js";
		script.async = true;

		document.body.appendChild(script);
		window.onSpotifyWebPlaybackSDKReady = () => {
			const deviceName = getDeviceName()

			spotifyPlayer.current = new window.Spotify.Player({
				name: 'Playtree Web Player: ' + deviceName,
				getOAuthToken: (cb: any) => { cb(token.accessToken); },
				volume: 1
			});

			spotifyPlayer.current.activateElement()

			spotifyPlayer.current.addListener('ready', ({ device_id }: any) => {
				clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH, {
					method: "PUT",
					body: JSON.stringify({ device_ids: [device_id], play: false })
				}).then(response => {
					if (response.ok) {
						clientFetchWithToken(remixServerPath, token, `${SPOTIFY_PLAYER_PATH}/repeat?state=off&device_id=${device_id}`, {
							method: "PUT",
						})
						dispatch({ type: 'spotify_player_ready' })
					}
				})
			});

			spotifyPlayer.current.addListener("not_ready", ({device_id}: any) => {
				if (spotifyPlayer.current) {
					spotifyPlayer.current.disconnect()
				}
			})

			spotifyPlayer.current.addListener('player_state_changed', playbackState => {
				if (prevPlaybackState.current && !prevPlaybackState.current.paused && playbackState.paused && playbackState.position === 0) {
					if (playtree) {
						dispatch({ type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random() })
					}
				}
				prevPlaybackState.current = playbackState
			})

			spotifyPlayer.current.addListener('initialization_error', ({ message }) => {
				// TODO make error message in browser more informative
				dispatch({type: "spotify_player_connection_failed"})
				console.error('Failed to initialize Spotify Web Player', message)
			})

			spotifyPlayer.current.addListener('authentication_error', ({ message }) => {
				// TODO a more informative error message by having the
				// authentication state be managed by reducer
				// This will be improtant in the unusual circumstance
				// where authentication just succeeded but failed on
				// the client side
				dispatch({type: "spotify_player_connection_failed"})
				console.error('Web player authentication failed', message)
			})

			spotifyPlayer.current.addListener('account_error', ({ message }) => {
				// TODO same as authentication error
				// this will be relevant if there are special premium
				// plans that still fail for the SDK
				dispatch({type: "spotify_player_connection_failed"})
				console.error('Premium validation failed', message)
			})

			spotifyPlayer.current.addListener('playback_error', ({message}) => {
				dispatch({type: "paused"})
				console.error('Playback update failed', message)
			})

			spotifyPlayer.current.connect().then(success => {
				if (!success) {
					dispatch({type: "spotify_player_connection_failed" })
				}
			})
		}

		return () => {
			if (spotifyPlayer.current) {
				spotifyPlayer.current.disconnect()
			}
		}
	}, [])

	useEffect(() => {
		if (!authenticatedWithPremium) {
			spotifyWebPlayer?.disconnect()
			setSpotifyWebPlayer(null)
		}
	}, [authenticatedWithPremium])

	const curPlaytreeRef = useRef<Playtree | null>(null)
	useEffect(() => {
		if (playtree && !deepEqual(playtree, curPlaytreeRef.current)) {
			dispatch({ type: "playtree_loaded", playtree: playtree, selectorRand: Math.random(), autoplay: autoplay })
			curPlaytreeRef.current = playtree

			// we need to make a new closure for the event
			// listener so the old playtree value isn't captured
			if (spotifyPlayer.current) {
				spotifyPlayer.current.removeListener('player_state_changed')
				spotifyPlayer.current.addListener('player_state_changed', playbackState => {
					if (prevPlaybackState.current && !prevPlaybackState.current.paused && playbackState.paused && playbackState.position === 0) {
						if (playtree) {
							dispatch({ type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random() })
						}
					}
					prevPlaybackState.current = playbackState
				})
			}
		}
	}, [playtree])

	useEffect(() => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		if (currentPlayhead) {
			clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH).then(response => {
				if (response.ok) {
					response.json().then(playbackState => {
						const deviceID = playbackState.device.id
						if (deviceID) {
							if (state.playing) {
								const currentSong = currentPlayhead.node.playitems[currentPlayhead.nodeIndex]
								clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAY_PATH, {
									method: "PUT",
									body: JSON.stringify({
										device_id: deviceID,
										uris: [currentSong.uri],
										position_ms: currentPlayhead.spotifyPlaybackPosition_ms
									})
								})
								dispatch({type: "message_logged", message: `Now playing ${currentSong.name}.`})
							} else if (playbackState.is_playing) {
								clientFetchWithToken(remixServerPath, token, SPOTIFY_PAUSE_PATH, {
									method: "PUT",
									body: JSON.stringify({ device_id: deviceID })
								})
							}
						}
					})
				}
			})
		}
	}, [state.playheadIndex, state.playheads[state.playheadIndex]?.node.id, state.playheads[state.playheadIndex]?.nodeIndex, state.playheads[state.playheadIndex]?.multIndex])

	useEffect(() => {
		if (state.playheads[state.playheadIndex]?.stopped) {
			clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH).then(response => {
				if (response.ok) {
					response.json().then(playbackState => {
						if (playbackState && playbackState.is_playing && playbackState.device.id) {
							clientFetchWithToken(remixServerPath, token, SPOTIFY_PAUSE_PATH, {
								method: "PUT",
								body: JSON.stringify({ device_id: playbackState.device.id})
							})
						}
					})
				}
			})
		}
	}, [state.playheads[state.playheadIndex]?.stopped])

	const handlePlayPauseAudio = useCallback((shouldPlay: boolean) => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		const currentSong = currentPlayhead.node.playitems[currentPlayhead.nodeIndex]

		clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH).then(response => {
			if (response.ok) {
				response.json().then(playbackState => {
					const deviceID = playbackState.device.id
					if (deviceID) {
						if (shouldPlay) {
							clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAY_PATH, {
								method: "PUT",
								body: JSON.stringify({
									device_id: deviceID,
									uris: [currentSong.uri],
									position_ms: currentPlayhead.spotifyPlaybackPosition_ms
								})
							})
							dispatch({type: "message_logged", message: `Now playing ${currentSong.name}.`})
						} else {
							clientFetchWithToken(remixServerPath, token, SPOTIFY_PAUSE_PATH, {
								method: "PUT",
								body: JSON.stringify({ device_id: playbackState.device.id})
							})
							dispatch({ type: "song_progress_received", spotifyPlaybackPosition_ms: playbackState.progress_ms })
							dispatch({ type: "message_logged", message: "Paused." })
						}
					}
				})
			}
		})
		dispatch({ type: shouldPlay ? "played" : "paused" })
		dispatch({ type: "autoplay_set", autoplay: shouldPlay })
	}, [state.playheads, state.playheadIndex])


	const handleChangePlayhead = useCallback((direction: "incremented_playhead" | "decremented_playhead") => {
		return () => {
			if (playtree) {
				clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH).then(response => {
					response.json().then(playbackState => {
						dispatch({ type: "song_progress_received", spotifyPlaybackPosition_ms: playbackState.progress_ms })
						dispatch({ type: direction, playtree: playtree })
					})
				})
			}
		}
	}, [playtree])

	const [playheadInfo, playnodeInfo, currentPlayitem, playAndLimitInfo, playitemInfo] = useMemo(() => {
		if (playtree === null || !authenticatedWithPremium) {
			return [undefined, undefined, undefined, undefined, undefined]
		}
		let currentPlayhead: Playhead | null | undefined = null
		let currentPlaynode: Playnode | null | undefined = null
		let currentPlayscope:  number | null | undefined = null
		let currentPlayitem: Playitem | null | undefined = null
	
		let currentNodePlaycount: number | undefined = undefined
		let currentNodeMaxPlays: number | undefined = undefined
		let currentPlayitemPlaycount: number | undefined = undefined
		let currentPlayitemMaxPlays: number | undefined = undefined
	
		if (state && state.playheads) {
			currentPlayhead = state.playheads[state.playheadIndex]
			if (currentPlayhead && currentPlayhead.node) {
				currentPlaynode = currentPlayhead.node
				currentPlayscope = state.leastScopeByNode.get(currentPlaynode.id) as number
				currentNodePlaycount = currentPlayhead.playcounters.playnodes.get(currentPlayscope)?.get(currentPlaynode.id)
				currentNodeMaxPlays = currentPlaynode.limit
				if (currentPlaynode.playitems) {
					currentPlayitem = currentPlaynode.playitems[currentPlayhead.nodeIndex]
					if (currentPlayitem) {
						currentPlayitemPlaycount = currentPlayhead.playcounters.playitems.get(currentPlayscope)?.get(currentPlaynode.id)?.get(currentPlayitem.id)
						currentPlayitemMaxPlays = currentPlayitem.limit
					}
				}
			}
		}
	
		const playheadInfo = currentPlayhead ? currentPlayhead.name : "Playhead not available"
	
		let playnodeInfo = "Playnode not available"
		// NOTE: state.messageLog.length being 1 is a hacky way
		// to check if the player has started since load
		if ((currentPlayhead?.stopped || state.messageLog.length === 1) && currentPlayhead?.shouldHideNode && !state.playing) {
			playnodeInfo = "???"
		} else if (currentPlaynode) {
			playnodeInfo = currentPlaynode.name
			if (currentNodePlaycount !== undefined) {
				let playAndLimitInfo = ` (${currentNodePlaycount + 1} / ${currentNodeMaxPlays})`
				if (currentPlayscope !== null && currentPlayscope !== -1) {
					playAndLimitInfo = `[${playAndLimitInfo} in scope ${playtree.playscopes[currentPlayscope].name}]`
				}
				playnodeInfo += playAndLimitInfo
			}
		}
	
		let playitemInfo : ReactElement = <>Song not available</>
		let playAndLimitInfo = ""
		// NOTE: same as note above
		if ((currentPlayhead?.stopped || state.messageLog.length === 1) && currentPlayhead?.shouldHideSong && !state.playing) {
			playitemInfo = <>???</>
		} else if (currentPlayitem) {
			const songURISplit = currentPlayitem.uri.split(":")
			const songURIWithoutCategories = songURISplit[songURISplit.length - 1]
	
			const creatorURISplit = currentPlayitem.creatorURI.split(":")
			const creatorURIWithoutCategories = creatorURISplit[creatorURISplit.length - 1]
	
			playitemInfo = (
				<span>
					<a
						target="_blank"
						rel="noopener noreferrer"
						href={`https://open.spotify.com/track/${songURIWithoutCategories}`}
						className="underline"
					>
						{currentPlayitem.name}
					</a>
					{" - "}
					<a
						target="_blank"
						rel="noopener noreferrer"
						href={`https://open.spotify.com/artist/${creatorURIWithoutCategories}`}
						className="underline"
					>
						{currentPlayitem.creator}
					</a>
				</span>
			)
			
			if (currentPlayitemPlaycount !== undefined) {
				playAndLimitInfo = `(${currentPlayitemPlaycount + 1} / ${currentPlayitemMaxPlays})`
				if (currentPlayscope !== null && currentPlayscope !== -1 && playtree.playscopes[currentPlayscope] !== undefined) {
					playAndLimitInfo = `[${playAndLimitInfo} in scope '${playtree.playscopes[currentPlayscope].name}']`
				}
				playAndLimitInfo = " " + playAndLimitInfo
				playitemInfo = <>{playitemInfo}{playAndLimitInfo}</>
			}
		}

		return [playheadInfo, playnodeInfo, currentPlayitem, playAndLimitInfo, playitemInfo]
	}, [playtree, state.playheads, state.playheadIndex, authenticatedWithPremium])

	const wrapInnerComponentWithBackground = (innerComponent : ReactElement) => {
		return <div className="w-full h-36 min-h-36 bg-green-600 z-30 overflow-x-auto flex items-center">{innerComponent}</div>
	}

	if (!authenticatedWithPremium) {
		return wrapInnerComponentWithBackground(
			<div className="font-markazi text-xl text-white w-full flex justify-center">
				<span className="w-fit">
					You must be logged in to a&nbsp;
					<a
						target="_blank"
						rel="noopener noreferrer"
						href="https://www.spotify.com/us/premium/"
						className="text-blue-300 underline"
					>
					Spotify Premium</a>&nbsp;account to use the Playtree Spotify Player.
				</span>
			</div>
		)
	}
	if (playtree === null) {
		return wrapInnerComponentWithBackground(
			<div className="font-markazi text-xl text-white w-full flex justify-center">
				Select a playtree to play it here!
			</div>
		)
	}

	if (state.spotifyPlayerReady === undefined) {
		return wrapInnerComponentWithBackground(
			<div className="font-markazi text-xl text-white w-full flex justify-center">
				Waiting for the Spotify Web Player to load...
			</div>
		)
	}

	if (!state.spotifyPlayerReady) {
		return wrapInnerComponentWithBackground(
			<div className="w-full flex justify-center">
				<Snack type={"error"} body={<p>Spotify Web Player failed to connect.</p>}></Snack>
			</div>
		)
	}

	return wrapInnerComponentWithBackground(
		<>
			<div className="w-full basis-1/4 h-[95%] ml-16 max-h-full overflow-y-auto flex flex-col-reverse">
				<ul className="text-white text-lg font-markazi">
					{
						state.messageLog.map((message, index) => {
							return (<li key={index}>
								◽️ {message}
							</li>)
						})
					}
				</ul>
			</div>
			<div className="w-full basis-1/6 min-w-32 my-auto">
				<img src="/images/Full_Logo_White_RGB.svg" ></img>
			</div>
			<div className="w-full basis-1/12 min-w-32 my-auto">
				<div className="w-fit float-right mr-8">
					<div className="w-fit mx-auto">
						<button
							type="button"
							title="Previous Playhead"
							className="rounded-sm p-2 text-white"
							onClick={handleChangePlayhead("decremented_playhead")}>
							{"\u23EB"}
						</button>
					</div>
					<div className="w-fit mx-auto">
						<button
							type="button"
							title="Skip Backward"
							className="rounded-sm p-2 text-white"
							onClick={() => dispatch({ type: "skipped_backward", playtree: playtree })}>
							{"\u23EE"}
						</button>
						<button
							type="button"
							title={!state.spotifyPlayerReady ? "Loading Player" : state.playing ? "Pause" : "Play"}
							className={`rounded-sm p-2 text-white fill-white`}
							onClick={() => handlePlayPauseAudio(!state.playing)}
							disabled={ state ? !state.spotifyPlayerReady : true}
						>
							{!state.spotifyPlayerReady ? "\u23F3" : state.playing ? "\u23F8" : "\u23F5"}
						</button>
						<button
							type="button"
							title="Skip Forward"
							className="rounded-sm p-2 text-white"
							onClick={() => dispatch({ type: "skipped_forward", playtree: playtree, edgeRand: Math.random(), selectorRand: Math.random() })}>{"\u23ED"}</button>
					</div>
					<div className="w-fit mx-auto">
						<button
							type="button"
							title="Next Playhead"
							className="rounded-sm p-2 text-white"
							onClick={handleChangePlayhead("incremented_playhead")}>
							{"\u23EC"}
						</button>
					</div>
				</div>
			</div>
			<div className="w-full basis-1/2 mr-8 my-auto text-white font-lilitaOne">
				<table>
					<tbody>
						<tr><td>Playtree</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playtree.summary.name}>{playtree.summary.name}</td></tr>
						<tr><td>Playhead</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playheadInfo}>{playheadInfo}</td></tr>
						<tr><td>Playnode</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playnodeInfo}>{playnodeInfo}</td></tr>
						<tr><td>Song</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={currentPlayitem ? `${currentPlayitem.name} - ${currentPlayitem.creator}${playAndLimitInfo}` : ""}>{playitemInfo}</td></tr>
					</tbody>
				</table>
			</div>
		</>
	)
}
