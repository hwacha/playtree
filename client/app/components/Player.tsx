import { ReactElement, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Playitem, Playnode, Playtree } from "../types";
import deepEqual from "deep-equal";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import reducer, { Playhead } from "../reducers/player";
import { SPOTIFY_PAUSE_PATH, SPOTIFY_PLAY_PATH, SPOTIFY_PLAYER_PATH } from "../settings/spotify_api_endpoints";
import { getDeviceName } from "../utils/getDeviceName.client";
import Snack from "./Snack";
import { ServerPath, Token } from "../root";
import { definitely, definitelyNot, maybe, maybeNot } from "../utils/kleene";

type PlayerProps = {
	playtree: Playtree | null
	authenticatedWithPremium: boolean
}

export default function Player({ playtree, authenticatedWithPremium }: PlayerProps) {
	const initialPlayheadIndex = 0
	let initialPlayheads: Playhead[] = []

	const [state, dispatch] = useReducer<typeof reducer>(reducer, {
		playheads: initialPlayheads,
		playheadIndex: initialPlayheadIndex,
		leastScopeByNode: new Map<string, number>(),
		leastScopeByEdge: new Map<string, Map<string, number>>(),
		messageLog:[],
		volume_percent: 100,
		playing: false,
		positionLastSet_ms: -Infinity,
		autoplay: false,
		spotifyPlayerReady: undefined,
		deviceSynced: undefined,
		songSynced: undefined,
		playtreeJustChangedVolume: false,
	})

	const prevPlaybackState = useRef<Spotify.PlaybackState | null>(null)
	const [spotifyWebPlayer, setSpotifyWebPlayer] = useState<Spotify.Player | null>(null)

	const remixServerPath = useContext(ServerPath).remix ?? undefined
	const token = useContext(Token)

	const spotifyPlayer = useRef<Spotify.Player | null>(null)
	const spotifyPlayerDeviceID = useRef<string | null>(null)

	const onSpotifyPlayerStateChanged = useCallback((playbackState : Spotify.PlaybackState) => {
		// set repeat mode to "off" if it's not already.
		// repeat makes checking for song end not work
		if (playbackState.repeat_mode) {
			clientFetchWithToken(remixServerPath, token, `${SPOTIFY_PLAYER_PATH}/repeat/?state=off`, {
				method: "PUT"
			})
		}

		// synchronize playtree player state with spotify playback state

		let playbackMatchesSong : boolean = false
		let prevPlaybackMatchesSong : boolean = false
		if (state.playheads.length > 0) {
			const currentPlayhead = state.playheads[state.playheadIndex]
			if (currentPlayhead.node && currentPlayhead.node.playitems.length > 0) {
				const currentPlayitem = currentPlayhead.node.playitems[currentPlayhead.nodeIndex]
				playbackMatchesSong = playbackState.track_window.current_track.uri === currentPlayitem.uri

				if (prevPlaybackState.current) {
					playbackMatchesSong = prevPlaybackState.current.track_window.current_track.uri === currentPlayitem.uri
				}
				
			}
		}

		// From experimentation, an event with an empty playback_id seems
		// to be fired when playback is transfered to another device.
		if (playbackState.playback_id === "") {
			dispatch({ type:"device_sync_updated", sync: false })

			// if the song was synced up to this point in playback,
			// record the playback position of the song that was playing
			// before device playback changed hands
			if (state.songSynced && prevPlaybackState.current && prevPlaybackMatchesSong) {
				dispatch({
					type:"song_progress_received",
					spotifyPlaybackPosition_ms: prevPlaybackState.current.position,
					songDuration_ms: prevPlaybackState.current.duration,
					timestamp_ms: new Date().getMilliseconds()
				})
			}
		}

		// Tests whether the song playing on Spotify is found at all in
		// the playtree. If not, it warns the user that Spotify is desynced
		// NOTE: this test yields false negatives. Someone can play another
		//       song in the playtree other than the one currently playing.
		//       It's a temporary stopgap.
		let songIsSynced : boolean = true
		if (state.playheads.length > 0) {
			if (playtree) {
				const allSongURIs : string[] = []
				playtree.playnodes.forEach(playnode => {
					playnode.playitems.forEach(playitem => {
						allSongURIs.push(playitem.uri)
					})
				})

				if (playbackState.track_window.current_track) {
					songIsSynced = allSongURIs.includes(playbackState.track_window.current_track.uri)
				}
			}
		}

		const justLoadedNewPlaytree = state.messageLog.length <= 1

		if (songIsSynced) {
			if (maybeNot(state.songSynced)) {
				dispatch({ type: "song_sync_updated", sync: true})
			}
			if (playbackMatchesSong) {
				dispatch({
					type:"song_progress_received",
					spotifyPlaybackPosition_ms: playbackState.position,
					songDuration_ms: playbackState.duration,
					timestamp_ms: new Date().getMilliseconds()
				})
			}
			
		} else if (!justLoadedNewPlaytree) {
			if (definitely(state.songSynced) && prevPlaybackState.current && prevPlaybackMatchesSong) {
				dispatch({
					type: "song_progress_received",
					spotifyPlaybackPosition_ms: prevPlaybackState.current.position,
					songDuration_ms: prevPlaybackState.current.duration,
					timestamp_ms: new Date().getMilliseconds()
				})
			}
			if (maybe(state.songSynced)) {
				dispatch({ type: "song_sync_updated", sync: false })
			}
		}

		const currentPlayhead = state.playheads.length > 0 ? state.playheads[state.playheadIndex] : undefined

		const timeThatWasLeftSinceLastPlay = currentPlayhead ? currentPlayhead.songDuration_ms - currentPlayhead.spotifyPlaybackPosition_ms : -Infinity

		const singleTrackEnded = state.playing && playbackState.playback_id !== "" && playbackState.position === 0 &&
			playbackState.paused && prevPlaybackState.current && !prevPlaybackState.current.paused &&
			currentPlayhead && state.positionLastSet_ms + timeThatWasLeftSinceLastPlay >= new Date().getMilliseconds()

		const trackEndedWithQueue = prevPlaybackState.current && prevPlaybackState.current.track_window &&
			prevPlaybackState.current.track_window.next_tracks && playbackState.track_window && playbackState.track_window.current_track &&
			prevPlaybackState.current.track_window.next_tracks.includes(playbackState.track_window.current_track)

		if (songIsSynced) {
			if (singleTrackEnded || trackEndedWithQueue) {
				if (playtree) {
					dispatch({ type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random(), timestamp_ms: new Date().getMilliseconds() })
				}
			} else {
				if (!playbackState.loading && playbackState.paused && state.playing) {
					dispatch({ type: "paused" })
				}
				if (!playbackState.loading && !playbackState.paused && !state.playing) {
					dispatch({ type: "played", timestamp_ms: new Date().getMilliseconds() })
				}
			}
		}

		prevPlaybackState.current = playbackState
	}, [playtree, state.playheads, state.playheadIndex, state.songSynced, state.playing, state.positionLastSet_ms])

	useEffect(() => {
		// we need to make a new closure for the event listener
		// so the old playtree/playing value isn't captured
		if (spotifyPlayer.current) {
			spotifyPlayer.current.removeListener('player_state_changed')
			spotifyPlayer.current.addListener('player_state_changed', (playerState) => {
				onSpotifyPlayerStateChanged(playerState)
			})
		}
	}, [playtree, state.playing, state.positionLastSet_ms, state.playheadIndex, state.playheads.length > 0 ? state.playheads[state.playheadIndex].node.id : undefined])

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
				volume: state.volume_percent / 100.0
			});

			spotifyPlayer.current.activateElement()

			spotifyPlayer.current.addListener('ready', ({ device_id }: any) => {
				spotifyPlayerDeviceID.current = device_id
				dispatch({ type: 'spotify_player_ready' })
				clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH, {
					method: "PUT",
					body: JSON.stringify({ device_ids: [device_id], play: false })
				}).then(response => {
					if (response.ok) {
						dispatch({ type: 'device_sync_updated', sync: true })
						clientFetchWithToken(remixServerPath, token, `${SPOTIFY_PLAYER_PATH}/repeat?state=off&device_id=${device_id}`, {
							method: "PUT",
						})
					}
				})
			});

			spotifyPlayer.current.addListener("not_ready", ({device_id}: any) => {
				if (spotifyPlayer.current) {
					spotifyPlayer.current.disconnect()
				}
			})

			spotifyPlayer.current.addListener('player_state_changed', (playbackState) => {
				onSpotifyPlayerStateChanged(playbackState)
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
			dispatch({ type: "playtree_loaded", playtree: playtree, selectorRand: Math.random() })
			curPlaytreeRef.current = playtree
		}
	}, [playtree])

	const handleRetransferPlaybackToPlayer = useCallback(() => {
		if (spotifyPlayerDeviceID.current) {
			clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH, {
				method: "PUT",
				body: JSON.stringify({ device_ids: [spotifyPlayerDeviceID.current] })
			}).then(response => {
				if (response.ok) {
					dispatch({ type: "device_sync_updated", sync: true })
					spotifyPlayer.current?.activateElement()
				}
			})
		}
	}, [spotifyPlayer.current, spotifyPlayerDeviceID.current])

	useEffect(() => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		if (currentPlayhead) {
			clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH).then(response => {
				if (response.ok) {
					response.json().then(playbackState => {
						const deviceID = playbackState.device.id
						if (deviceID) {
							if (state.autoplay) {
								const currentSong = currentPlayhead.node.playitems[currentPlayhead.nodeIndex]
								clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAY_PATH, {
									method: "PUT",
									body: JSON.stringify({
										device_id: deviceID,
										uris: [currentSong.uri],
										position_ms: currentPlayhead.spotifyPlaybackPosition_ms
									})
								})
								if (maybeNot(state.songSynced)) {
									dispatch({ type: "song_sync_updated", sync: true})
								}
								dispatch({type: "message_logged", message: `Now playing ${currentSong.name}.`})
							} else if (playbackState.is_playing) {
								clientFetchWithToken(remixServerPath, token, SPOTIFY_PAUSE_PATH, {
									method: "PUT",
									body: JSON.stringify({ device_id: deviceID })
								})
							}
						}
						
						handleSyncVolume(playbackState)
					})
				}
			})
		}
	}, [state.playheadIndex, state.playheads[state.playheadIndex]?.node.id, state.playheads[state.playheadIndex]?.nodeIndex, state.playheads[state.playheadIndex]?.multIndex])

	useEffect(() => {
		if (state.playtreeJustChangedVolume) {
			clientFetchWithToken(remixServerPath, token, `${SPOTIFY_PLAYER_PATH}/volume?volume_percent=${state.volume_percent}`, {
				method: "PUT"
			})
			dispatch({ type: 'flushed_volume_change_action' })
		}
	}, [state.volume_percent, state.playtreeJustChangedVolume])


	// called whenever an input action requests
	// the Spotify playback state
	const handleSyncVolume = useCallback((playbackState : any) => {
		if (!state.playtreeJustChangedVolume) {
			if (playbackState.device && playbackState.device.volume_percent !== state.volume_percent) {
				dispatch({ type: "volume_synced", percent: playbackState.device.volume_percent })
			}
		}
	}, [state.volume_percent, state.playtreeJustChangedVolume])

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
						handleSyncVolume(playbackState)
					})
				}
			})
		}
	}, [state.playheads[state.playheadIndex]?.stopped])


	const handlePlayPauseAudio = useCallback((shouldPlay: boolean) => {
		if (!state.playheads || state.playheads.length === 0) {
			return
		}
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
							if (maybeNot(state.songSynced)) {
								dispatch({ type: "song_sync_updated", sync: true })
							}
							dispatch({type: "message_logged", message: `Now playing ${currentSong.name}.`})
						} else {
							clientFetchWithToken(remixServerPath, token, SPOTIFY_PAUSE_PATH, {
								method: "PUT",
								body: JSON.stringify({ device_id: playbackState.device.id})
							})
							if (definitely(state.songSynced)) {
								dispatch({
									type: "song_progress_received",
									spotifyPlaybackPosition_ms: playbackState.progress_ms,
									songDuration_ms: playbackState.item?.duration ?? Infinity,
									timestamp_ms: new Date().getMilliseconds()
								})
							}
							dispatch({ type: "message_logged", message: "Paused." })
						}
					}
					handleSyncVolume(playbackState)
				})
			}
		})
		dispatch(shouldPlay ? { type:  "played", timestamp_ms: new Date().getMilliseconds() } : { type: "paused" })
		dispatch({ type: "autoplay_set", autoplay: shouldPlay })
	}, [state.playheads, state.playheadIndex, state.songSynced])

	const handleChangePlayhead = useCallback((direction: "incremented_playhead" | "decremented_playhead") => {
		return () => {
			if (playtree) {
				clientFetchWithToken(remixServerPath, token, SPOTIFY_PLAYER_PATH).then(response => {
					response.json().then(playbackState => {
						if (definitely(state.songSynced)) {
							dispatch({
								type: "song_progress_received",
								spotifyPlaybackPosition_ms: playbackState.progress_ms,
								songDuration_ms: playbackState.item?.duration ?? Infinity,
								timestamp_ms: new Date().getMilliseconds()
							})
						}
						dispatch({ type: direction, playtree: playtree })
						handleSyncVolume(playbackState)
					})
				})
			}
		}
	}, [playtree])

	const [playheadInfo, playnodeInfo, currentPlayitem, playAndLimitInfo, playitemInfo] = useMemo(() => {
		if (playtree === null || !authenticatedWithPremium) {
			return [undefined, undefined, undefined, undefined, undefined, false]
		}
		let currentPlayhead: Playhead | null | undefined = null
		let currentPlaynode: Playnode | null | undefined = null
		let currentPlayscope:  number | null | undefined = null
		let currentPlayitem: Playitem | null | undefined = null
		let playitemExists: boolean = false
	
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

	const changePlayheadAllowed = state.playheads && state.playheads.length > 1
	const skipBackAllowed = state.playheads && state.playheads.length > 0 && state.playheads[state.playheadIndex].history.length > 0
	const playPauseAllowed = state && state.spotifyPlayerReady && currentPlayitem
	const skipForwardAllowed = playPauseAllowed

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
			<div className="w-full h-full basis-1/12 min-w-32">
				{
					definitely(state.deviceSynced) ?
					<div className="w-full h-full flex flex-col p-2">
						<div className="w-full flex justify-center">
							<button
								type="button"
								title="Previous Playhead"
								className={`py-[0.3125rem] text-white ${ changePlayheadAllowed ? "" : "hover:cursor-not-allowed"}`}
								disabled={!changePlayheadAllowed}
								onClick={handleChangePlayhead("decremented_playhead")}>
								{"\u23EB"}
							</button>
						</div>
						<div className="w-full flex justify-evenly">
							<button
								type="button"
								title="Skip Backward"
								className={`py-[0.3125rem] text-white ${ skipBackAllowed ? "" : "hover:cursor-not-allowed"}`}
								disabled={!skipBackAllowed}
								onClick={() => dispatch({ type: "skipped_backward", playtree: playtree })}>
								{"\u23EE"}
							</button>
							<button
								type="button"
								title={!state.spotifyPlayerReady ? "Loading Player" : state.playing ? "Pause" : "Play"}
								className={`py-[0.3125rem] text-white ${ playPauseAllowed ? "" : "hover:cursor-not-allowed"}`}
								onClick={() => handlePlayPauseAudio(!state.playing)}
								disabled={!playPauseAllowed}
							>
								{!state.spotifyPlayerReady ? "\u23F3" : state.playing ? "\u23F8" : "\u23F5"}
							</button>
							<button
								type="button"
								title="Skip Forward"
								className={`py-[0.3125rem] text-white ${ skipForwardAllowed ? "" : "hover:cursor-not-allowed"}`}
								disabled={!skipForwardAllowed}
								onClick={() => dispatch({ type: "skipped_forward", playtree: playtree, edgeRand: Math.random(), selectorRand: Math.random(), timestamp_ms: new Date().getMilliseconds() })}>{"\u23ED"}</button>
						</div>
						<div className="w-full flex justify-center">
							<button
								type="button"
								title="Next Playhead"
								className={`py-[0.3125rem] text-white ${ changePlayheadAllowed ? "" : "hover:cursor-not-allowed"}`}
								disabled={!changePlayheadAllowed}
								onClick={handleChangePlayhead("incremented_playhead")}>
								{"\u23EC"}
							</button>
						</div>
						<div className="w-full flex justify-around">
							<button
								type="button"
								title="Decrease Volume"
								className={`py-[0.3125rem] text-white`}
								onClick={() => dispatch({ type: "volume_decremented" })}>
								{"\u2796"}
							</button>
							<div title="Volume" className="font-markazi text-md text-white my-auto">{state.volume_percent}</div>
							<button
								type="button"
								title="Increase Volume"
								className={`py-[0.3125rem] text-white`}
								onClick={() => dispatch({ type: "volume_incremented" })}>
								{"\u2795"}
							</button>
						</div>
					</div> :
					definitelyNot(state.deviceSynced) ?
					<div className="w-full h-full font-markazi text-md flex flex-col justify-center text-white p-2 ">
						<button className="bg-green-300 text-black my-auto rounded-lg px-2 py-1" onClick={handleRetransferPlaybackToPlayer}>Retransfer</button>
					</div> :
					<div className="w-full h-full font-markazi text-md flex flex-col justify-center text-white p-2">
						<p>Waiting for web player device to sync...</p>
					</div>
				}
			</div>
			{
				maybe(state.deviceSynced) ?
				<div className="w-full basis-1/2 mr-8 my-auto text-white font-lilitaOne">
					<table>
						<tbody>
							<tr><td>Playtree</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playtree.summary.name}>{playtree.summary.name}</td></tr>
							<tr><td>Playhead</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playheadInfo}>{playheadInfo}</td></tr>
							<tr><td>Playnode</td><td>|</td><td className="max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis" title={playnodeInfo}>{playnodeInfo}</td></tr>
							<tr><td>Song{maybe(state.songSynced) || <span className="font-markazi text-red-300 hover:cursor-help" title="Pause and play to resync.">(desynced)</span>}</td>
								<td>|</td><td
									className={`max-w-[25vw] text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis ${definitelyNot(state.songSynced) ? "text-red-300" : ""}`}
									title={currentPlayitem ? `${currentPlayitem.name} - ${currentPlayitem.creator}${playAndLimitInfo}` : ""}>{playitemInfo}</td></tr>
						</tbody>
					</table>
				</div> :
				<div className="w-full basis-1/2 mr-8 my-auto text-white font-markazi">
					<p>Spotify playback was transferred to another device.</p>
				</div>
			}

		</>
	)
}
