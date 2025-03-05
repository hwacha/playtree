import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { Playitem, Playnode, Playtree } from "../types";
import deepEqual from "deep-equal";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import reducer, { Playhead } from "../reducers/player";
import { SPOTIFY_CURRENT_USER_PATH, SPOTIFY_PAUSE_PATH, SPOTIFY_PLAY_PATH, SPOTIFY_PLAYER_PATH } from "../settings/api_endpoints";
import { getDeviceName } from "../utils/getDeviceName.client";

type PlayerProps = {
	playtree: Playtree | null
	autoplay: boolean | undefined
}

export default function Player({ playtree, autoplay }: PlayerProps) {
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
		spotifyPlayerReady: false,
	})

	const prevPlaybackState = useRef<Spotify.PlaybackState | null>(null)

	

	useEffect(() => {
		const script = document.createElement("script");
		script.src = "https://sdk.scdn.co/spotify-player.js";
		script.async = true;

		document.body.appendChild(script);

		let newPlayer: Spotify.Player | null = null;

		window.onSpotifyWebPlaybackSDKReady = () => {
			clientFetchWithToken(SPOTIFY_CURRENT_USER_PATH).then(response => {
				
				if (response.ok) {
					const deviceName = getDeviceName()
					const accessToken = localStorage.getItem("spotify_access_token")
					newPlayer = new window.Spotify.Player({
						name: 'Playtree Web Player: ' + deviceName,
						getOAuthToken: (cb: any) => { cb(accessToken); },
						volume: 1
					});
	
					newPlayer.activateElement()
	
					newPlayer.addListener('ready', ({ device_id }: any) => {
						clientFetchWithToken(SPOTIFY_PLAYER_PATH, {
							method: "PUT",
							body: JSON.stringify({ device_ids: [device_id], play: false })
						}).then(response => {
							if (response.ok) {
								dispatch({ type: 'spotify_player_ready'})
							}
						})
					});
	
					// TODO error handling if the device isn't ready to play
	
					newPlayer.addListener('player_state_changed', playbackState => {
						if (prevPlaybackState.current && !prevPlaybackState.current.paused && playbackState.paused && playbackState.position === 0) {
							if (playtree) {
								dispatch({ type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random() })
							}
						}
						prevPlaybackState.current = playbackState
					})
	
					newPlayer.connect()
				}
			})
		}

		return () => {
			if (newPlayer) {
				newPlayer.disconnect()
			}
		}
	}, [])

	const oldPlaytree = useRef<Playtree | null>(null)
	useEffect(() => {
		if (playtree && !deepEqual(playtree, oldPlaytree.current)) {
			dispatch({ type: "playtree_loaded", playtree: playtree, selectorRand: Math.random(), autoplay: autoplay })
			oldPlaytree.current = playtree
		}
	}, [playtree])

	useEffect(() => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		if (currentPlayhead) {
			clientFetchWithToken(SPOTIFY_PLAYER_PATH).then(response => {
				if (response.ok) {
					response.json().then(playbackState => {
						const deviceID = playbackState.device.id
						if (deviceID) {
							if (state.playing) {
								const currentSong = currentPlayhead.node.playitems[currentPlayhead.nodeIndex]
								clientFetchWithToken(SPOTIFY_PLAY_PATH, {
									method: "PUT",
									body: JSON.stringify({
										device_id: deviceID,
										uris: [currentSong.uri],
										position_ms: currentPlayhead.spotifyPlaybackPosition_ms
									})
								})
								dispatch({type: "message_logged", message: `Now playing ${currentSong.name}.`})
							} else if (playbackState.is_playing) {
								clientFetchWithToken(SPOTIFY_PAUSE_PATH, {
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
			clientFetchWithToken(SPOTIFY_PLAYER_PATH).then(response => {
				if (response.ok) {
					response.json().then(playbackState => {
						if (playbackState && playbackState.is_playing && playbackState.device.id) {
							clientFetchWithToken(SPOTIFY_PAUSE_PATH, {
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

		clientFetchWithToken(SPOTIFY_PLAYER_PATH).then(response => {
			if (response.ok) {
				response.json().then(playbackState => {
					const deviceID = playbackState.device.id
					if (deviceID) {
						if (shouldPlay) {
							clientFetchWithToken(SPOTIFY_PLAY_PATH, {
								method: "PUT",
								body: JSON.stringify({
									device_id: deviceID,
									uris: [currentSong.uri],
									position_ms: currentPlayhead.spotifyPlaybackPosition_ms
								})
							})
							dispatch({type: "message_logged", message: `Now playing ${currentSong.name}.`})
						} else {
							clientFetchWithToken(SPOTIFY_PAUSE_PATH, {
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
				clientFetchWithToken(SPOTIFY_PLAYER_PATH).then(response => {
					response.json().then(playbackState => {
						dispatch({ type: "song_progress_received", spotifyPlaybackPosition_ms: playbackState.progress_ms })
						dispatch({ type: direction, playtree: playtree })
					})
				})
			}
		}
	}, [playtree])

	if (playtree === null) {
		return (<div className="bg-green-600 fixed z-30 flex w-full h-36 left-64 bottom-0"><div className="text-white mx-auto my-16 w-fit h-full font-lilitaOne">No playtree selected to play.</div></div>)
	} else {
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

		let playitemInfo = "Song not available"
		// NOTE: same as note above
		if ((currentPlayhead?.stopped || state.messageLog.length === 1) && currentPlayhead?.shouldHideSong && !state.playing) {
			playitemInfo = "???"
		} else if (currentPlayitem) {
			playitemInfo = currentPlayitem.name
			if (currentPlayitemPlaycount !== undefined) {
				let playAndLimitInfo = `(${currentPlayitemPlaycount + 1} / ${currentPlayitemMaxPlays})`
				if (currentPlayscope !== null && currentPlayscope !== -1 && playtree.playscopes[currentPlayscope] !== undefined) {
					playAndLimitInfo = `[${playAndLimitInfo} in scope '${playtree.playscopes[currentPlayscope].name}']`
				}
				playitemInfo += " " + playAndLimitInfo
			}
		}

		return (
			<div className="bg-green-600 fixed z-30 flex w-[calc(100vw-16rem)] h-36 left-64 bottom-0">
				<div className="w-full basis-5/12 my-4 ml-16 max-h-full overflow-hidden overflow-y-auto flex flex-col-reverse">
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
								className="rounded-sm p-2 text-white fill-white"
								onClick={() => handlePlayPauseAudio(!state.playing)}
								disabled={!state.spotifyPlayerReady}
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
							<tr><td>Song</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playitemInfo}>{playitemInfo}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		)
	}
}
