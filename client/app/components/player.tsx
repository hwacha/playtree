import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { Content, HistoryNode, PlayEdge, PlayheadInfo, PlayNode, Playscope, Playtree } from "../types";
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk";
import deepEqual from "deep-equal";

type PlayerProps = {
	playtree: Playtree | null
	autoplay: boolean | undefined
}

type Playcounters = {
	content: Map<string, Map<string, number>>;
	node: Map<string, number>;
	edge: Map<string, Map<string, number>>;
}

const makeNewPlaycounters = () : Playcounters => {
	return {
		content: new Map<string, Map<string, number>>(),
		node: new Map<string, number>,
		edge: new Map<string, Map<string, number>>
	}
}

const zeroCounter = (counter: Map<string, number>) : Map<string, number> => {
	const newCounter = new Map<string, number>()
	const keysIter = counter.keys()
	for (let key = keysIter.next(); !key.done; key = keysIter.next()) {
		newCounter.set(key.value, 0)
	}
	return newCounter
}

const zeroPlaycounters = (playcounters: Playcounters): Playcounters => {
	const newContentCounter = new Map<string, Map<string, number>>()
	const contentKeysIter = playcounters.content.keys()
	for (let key = contentKeysIter.next(); !key.done; key = contentKeysIter.next()) {
		newContentCounter.set(key.value, zeroCounter(playcounters.content.get(key.value) as Map<string, number>))
	}
	const newNodeCounter = zeroCounter(playcounters.node)
	const newEdgeCounter = new Map<string, Map<string, number>>()
	const edgeKeysIter = playcounters.edge.keys()
	for (let key = edgeKeysIter.next(); !key.done; key = edgeKeysIter.next()) {
		newEdgeCounter.set(key.value, zeroCounter(playcounters.edge.get(key.value) as Map<string, number>))
	}
	return { content: newContentCounter, node: newNodeCounter, edge: newEdgeCounter }
}

type Playhead = {
	name: string;
	node: PlayNode;
	nodeIndex: number;
	multIndex: number;
	history: HistoryNode[];

	playcountersByScope: {scope: Playscope, playcounters: Playcounters}[];

	stopped: boolean;
	spotifyPlaybackPosition_ms: number;
}

type PlayerState = {
	playheads: Playhead[];
	playheadIndex: number;
	spotifyPlayerReady: boolean;
	playing: boolean;
	autoplay: boolean;
	mapOfURIsToGeneratedBlobURLs: Map<string, string>;
}

type PlayerAction = {
	type: 'spotify_player_ready' | 'played' | 'paused';
} | {
	type: 'skipped_backward' | 'incremented_playhead' | 'decremented_playhead';
	playtree: Playtree;
} | {
	type: 'playtree_loaded';
	playtree: Playtree;
	selectorRand: number;
	autoplay?: boolean;
} | {
	type: 'song_ended' | 'skipped_forward';
	playtree: Playtree;
	selectorRand: number;
	edgeRand: number;
} | {
	type: 'autoplay_set';
	autoplay: boolean;
} | {
	type: 'song_progress_received';
	spotifyPlaybackPosition_ms: number;
}

const reducer = (state: PlayerState, action: PlayerAction): PlayerState => {
	switch (action.type) {
		case 'playtree_loaded': {
			const defaultPlaycounters = makeNewPlaycounters()
			const newPlayheads: Playhead[] = []

			Array.from(action.playtree.nodes.values()).forEach((node: PlayNode) => {
				if (node.repeat >= 0) {
					defaultPlaycounters.node.set(node.id, 0)
				}
				const limitedContentList = node.content.filter(content => content.repeat >= 0)
				if (limitedContentList.length > 0) {
					defaultPlaycounters.content.set(node.id, new Map<string, number>())
					limitedContentList.forEach(content => {
						defaultPlaycounters.content.get(node.id)?.set(content.id, 0)
					})
				}
				if (node.next) {
					node.next.forEach((edge: PlayEdge) => {
						if (edge.repeat >= 0) {
							if (defaultPlaycounters.edge.has(node.id)) {
								defaultPlaycounters.edge.get(node.id)?.set(edge.nodeID, 0)
							} else {
								const targetNodeToCounter = new Map<string, number>()
								targetNodeToCounter.set(edge.nodeID, 0)
								defaultPlaycounters.edge.set(node.id, targetNodeToCounter)
							}
						}
					})

				}
			})

			action.playtree.playroots.forEach((playroot: PlayheadInfo, nodeID: string) => {
				const playnode = action.playtree.nodes.get(nodeID)
				if (playnode !== undefined) {
					let initialNodeIndex = 0
					if (playnode.type === "sequence") {
						playnode.content.every(content => {
							if (content.mult === 0 || content.repeat === 0) {
								initialNodeIndex++;
								return true
							}
							return false
						})
					} else { // selector
						const totalShares = playnode.content.filter(content => content.repeat !== 0).map(content => content.mult).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						playnode.content.some((content, index) => {
							if (content.repeat === 0) {
								return false
							}
							bound += content.mult
							if (randomDrawFromShares < bound) {
								initialNodeIndex = index
								return true
							}
							return false
						})
					}

					newPlayheads[playroot.index] = {
						name: playroot.name,
						node: playnode,
						nodeIndex: initialNodeIndex,
						multIndex: 0,
						history: [],
						playcountersByScope: [{scope: {name:"default", color:"white"}, playcounters: defaultPlaycounters}],
						stopped: false,
						spotifyPlaybackPosition_ms: 0
					}
				}
			})

			newPlayheads.forEach(playhead => {
				playhead.playcountersByScope
			})

			return {
				...state,
				playheadIndex: 0,
				playheads: newPlayheads,
				playing: false
			}
		}
		case 'played': {
			return {
				...state,
				playing: true
			};
		}
		case 'paused': {
			return {
				...state,
				playing: false
			}
		}
		case 'song_ended':
		case 'skipped_forward': {
			if (state.playheads.length == 0) {
				return structuredClone(state)
			}
			
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = 0
			const curPlayhead = state.playheads[state.playheadIndex]
			const curNode = curPlayhead.node
			const curNodeIndex = curPlayhead.nodeIndex
			const curMultIndex = curPlayhead.multIndex
			let nextNodeIndex = curNodeIndex
			let nextMultIndex = curMultIndex

			const newPlaycounters = structuredClone(curPlayhead.playcountersByScope[0].playcounters)
			
			if (curNode.content[nextNodeIndex] && newPlaycounters.content.has(curNode.id)) {
				const contentMap = newPlaycounters.content.get(curNode.id) as Map<string, number>
				const contentID = curNode.content[nextNodeIndex].id
				if (contentMap.has(contentID)) {
					const count = contentMap.get(contentID) as number
					newPlaycounters.content.get(curNode.id)?.set(contentID, count + 1)
				}
			}

			// I'm in a sequence node
			if (curNode.type === "sequence") {
				// If we've hit mult or repeat limit, then we skip forward.
				// case 1/2: either repeat limit is reached, or mult limit is reached.
				//   - in either case, we skip forward to the next content available.
				let movedOnce = false
				nextMultIndex++
				while (nextNodeIndex < curNode.content.length) {
					const curContent = curNode.content[nextNodeIndex]
					const contentPlays: number = newPlaycounters.content.get(curNode.id)?.get(curContent.id) ?? -1

					if ((contentPlays >= 0 && contentPlays >= curContent.repeat) || nextMultIndex >= curContent.mult) {
						nextNodeIndex++
						nextMultIndex = 0
						movedOnce = true
					} else {
						break
					}
				}

				if (nextNodeIndex < curNode.content.length) {
					if (!movedOnce && nextMultIndex < curNode.content[nextNodeIndex].mult) {
						movedOnce = true
					}

					if (movedOnce) {
						newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex, multIndex: curMultIndex, traversedPlayedge: null })
						newPlayheads[state.playheadIndex].node = curNode
						newPlayheads[state.playheadIndex].multIndex = nextMultIndex
						newPlayheads[state.playheadIndex].nodeIndex = nextNodeIndex
						newPlayheads[state.playheadIndex].playcountersByScope[0].playcounters = newPlaycounters

						return {
							...state,
							playheads: newPlayheads,
						}
					}
				}
			}

			const resetPlayheadAndIncrementIndex = (): number => {
				
				// reset playhead
				const playheadStartNodeID = newPlayheads[state.playheadIndex].history[0]?.nodeID ?? newPlayheads[state.playheadIndex].node.id
				const playheadStartNode = action.playtree.nodes.get(playheadStartNodeID)
				if (playheadStartNode) {
					let initialNodeIndex = 0
					if (playheadStartNode.type === "sequence") {
						playheadStartNode.content.forEach(content => {
							if (content.mult === 0 || content.repeat === 0) {
								initialNodeIndex++;
							}
						})
					} else { // selector
						const totalShares = playheadStartNode.content.filter(content => content.repeat !== 0).map(content => content.mult).reduce((a, b) => a + b, 0)
						const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
						let bound = 0
						playheadStartNode.content.some((content, index) => {
							if (content.repeat === 0) {
								return false
							}
							bound += content.mult
							if (randomDrawFromShares < bound) {
								initialNodeIndex = index
								return true
							}
							return false
						})
					}
					const newPlaycountersByScope = newPlayheads[state.playheadIndex].playcountersByScope
					const oldDefaultPlaycounters = newPlaycountersByScope[newPlaycountersByScope.length - 1].playcounters
					const newDefaultPlaycounters = zeroPlaycounters(oldDefaultPlaycounters)
					newPlayheads[state.playheadIndex] = {
						...newPlayheads[state.playheadIndex],
						node: playheadStartNode,
						nodeIndex: initialNodeIndex,
						multIndex: 0,
						history: [],
						playcountersByScope: [{scope: {name: "default", color: "white"}, playcounters: newDefaultPlaycounters}],
						stopped: true,
						spotifyPlaybackPosition_ms: 0
					}
				}
				// move to next playhead
				return (state.playheadIndex + 1) % newPlayheads.length
			}

			if (curNode.next) {
				let totalShares = 0
				const elligibleEdges: PlayEdge[] = []
				const nextEdgesSortedByPriority = [...curNode.next].sort((playedge1, playedge2) => playedge1.priority - playedge2.priority)
				let currentPriority = 0

				// go through each edge and choose edges by
				// the lowest available priority group
				for (let i in nextEdgesSortedByPriority) {
					let curEdge = nextEdgesSortedByPriority[i]

					if (curEdge.priority > currentPriority && elligibleEdges.length > 0) {
						break
					}

					const counter = newPlaycounters.edge.get(curNode.id)?.get(curEdge.nodeID)
					if (counter !== undefined && curEdge.repeat >= 0 && counter >= curEdge.repeat) {
						continue
					}

					if (!curEdge.shares) {
						totalShares += 1
					} else {
						totalShares += curEdge.shares
					}
					elligibleEdges.push(curEdge)
				}
				if (elligibleEdges.length === 0) {
					const nextPlayheadIndex = resetPlayheadAndIncrementIndex()
					const playheadShouldPlay = !newPlayheads[nextPlayheadIndex].stopped
					return {
						...state,
						playheadIndex: nextPlayheadIndex,
						playheads: newPlayheads,
						playing: playheadShouldPlay,
						autoplay: playheadShouldPlay
					}
				}
				const scaledRand = Math.floor(action.edgeRand * totalShares)
				let bound: number = 0
				let selectedEdge: PlayEdge | null = null
				for (let i in elligibleEdges) {
					const curEdge = elligibleEdges[i]
					const curShares = curEdge.shares ? curEdge.shares : 1
					bound += curShares
					if (scaledRand < bound) {
						selectedEdge = curEdge
						break
					}
				}

				if (selectedEdge !== null) {
					const count = newPlaycounters.edge.get(curNode.id)?.get(selectedEdge.nodeID)
					if (count !== undefined) {
						newPlaycounters.edge.get(curNode.id)?.set(selectedEdge.nodeID, count + 1)
					}
					let nextNode = action.playtree.nodes.get(selectedEdge.nodeID)
					if (nextNode) {
						const count = newPlaycounters.node.get(curNode.id)
						if (count !== undefined) {
							newPlaycounters.node.set(curNode.id, Math.min(count + 1, curNode.repeat))
						}
						newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex, multIndex: curMultIndex, traversedPlayedge: selectedEdge })
						newPlayheads[state.playheadIndex].node = nextNode
						newPlayheads[state.playheadIndex].multIndex = 0
						if (nextNode.type === "selector") {
							let selectedNodeIndex = -1

							const totalShares = nextNode.content.filter(content => {
								const count = newPlaycounters.content.get(nextNode.id)?.get(content.id)
								return count === undefined || count < content.repeat
							}).map(content => content.mult).reduce((a, b) => a + b, 0)
							const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
							let bound = 0
							nextNode.content.some((content, index) => {
								const count = newPlaycounters.content.get(nextNode.id)?.get(content.id)
								if (count !== undefined && count >= content.repeat) {
									return false
								}
								bound += content.mult
								if (randomDrawFromShares < bound) {
									selectedNodeIndex = index
									return true
								}
								return false
							})
							newPlayheads[state.playheadIndex].nodeIndex = selectedNodeIndex
						} else {
							let initialNodeIndex = 0
							nextNode.content.every(content => {
								const count = newPlaycounters.content.get(nextNode.id)?.get(content.id)
								if (content.mult === 0 || (count !== undefined && count >= content.repeat)) {
									initialNodeIndex++;
									return true
								}
								return false
							})
							newPlayheads[state.playheadIndex].nodeIndex = initialNodeIndex
						}
					}
				}

				newPlayheads[state.playheadIndex].playcountersByScope[0].playcounters = newPlaycounters

				return {
					...state,
					playheads: newPlayheads,
				}
			}
			const nextPlayheadIndex = resetPlayheadAndIncrementIndex()
			const playheadShouldPlay = !newPlayheads[nextPlayheadIndex].stopped
			return {
				...state,
				playheadIndex: nextPlayheadIndex,
				playheads: newPlayheads,
				playing: playheadShouldPlay,
				autoplay: playheadShouldPlay
			}
		}
		case 'skipped_backward': {
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = 0
			const prevHistoryNode = newPlayheads[state.playheadIndex].history.pop()
			if (prevHistoryNode === undefined) {
				return structuredClone(state)
			} else {
				const prevPlaynode = action.playtree.nodes.get(prevHistoryNode.nodeID)
				if (prevPlaynode === undefined) {
					return structuredClone(state)
				}
				newPlayheads[state.playheadIndex].node = structuredClone(prevPlaynode)
				newPlayheads[state.playheadIndex].nodeIndex = prevHistoryNode.index

				const newPlaycounters = structuredClone(newPlayheads[state.playheadIndex].playcountersByScope[0].playcounters)
				const prevContent = prevPlaynode.content[prevHistoryNode.index]
				let oldContentRepeatCounterValue: number | undefined = undefined
				if (prevContent) {
					oldContentRepeatCounterValue = newPlaycounters.content.get(prevPlaynode.id)?.get(prevContent.id)
				}
				if (oldContentRepeatCounterValue !== undefined) {
					newPlaycounters.content.get(prevPlaynode.id)?.set(prevContent.id, oldContentRepeatCounterValue - 1)
				}

				const traversedPlayedge = prevHistoryNode.traversedPlayedge
				if (traversedPlayedge && traversedPlayedge.repeat >= 0) {
					const oldNodeRepeatCounterValue = newPlaycounters.node.get(prevPlaynode.id)
					if (oldNodeRepeatCounterValue !== undefined) {
						newPlaycounters.node.set(prevPlaynode.id, Math.max(oldNodeRepeatCounterValue - 1, 0))
					}

					const oldEdgeRepeatCounterValue = newPlaycounters.edge.get(prevPlaynode.id)?.get(traversedPlayedge.nodeID)
					if (oldEdgeRepeatCounterValue !== undefined) {
						newPlaycounters.edge.get(prevPlaynode.id)?.set(traversedPlayedge.nodeID, Math.max(oldEdgeRepeatCounterValue - 1, 0))
					}

					if (oldNodeRepeatCounterValue !== undefined || oldEdgeRepeatCounterValue !== undefined) {
						newPlayheads[state.playheadIndex].playcountersByScope[0].playcounters = newPlaycounters
						return {
							...state,
							playheads: newPlayheads
						}
					}
				}
				newPlayheads[state.playheadIndex].playcountersByScope[0].playcounters = newPlaycounters
				return {
					...state,
					playheads: newPlayheads
				}
			}
		}
		case 'decremented_playhead': {
			return {
				...state,
				playheadIndex: (state.playheadIndex + state.playheads.length - 1) % state.playheads.length
			}
		}
		case 'incremented_playhead': {
			return {
				...state,
				playheadIndex: (state.playheadIndex + 1) % state.playheads.length
			}
		}
		case 'autoplay_set': {
			return {
				...state,
				autoplay: action.autoplay
			}
		}
		case 'song_progress_received': {
			const newPlayheads = structuredClone(state.playheads)
			newPlayheads[state.playheadIndex].spotifyPlaybackPosition_ms = action.spotifyPlaybackPosition_ms
			return {
				...state,
				playheads: newPlayheads
			}
		}
		case 'spotify_player_ready': {
			return {
				...state,
				spotifyPlayerReady: true
			}
		}
	}
}

export default function Player({ playtree, autoplay }: PlayerProps) {
	const initialPlayheadIndex = 0
	let initialPlayheads: Playhead[] = []

	const [state, dispatch] = useReducer<typeof reducer>(reducer, {
		playheads: initialPlayheads,
		playheadIndex: initialPlayheadIndex,
		playing: false,
		autoplay: autoplay ?? false,
		mapOfURIsToGeneratedBlobURLs: new Map<string, string>(),
		spotifyPlayerReady: false,
	})

	const spotify = useMemo(() =>
		SpotifyApi.withUserAuthorization(import.meta.env.VITE_SPOTIFY_CLIENT_ID,
			"http://localhost:5173",
			[
				"streaming",
				"user-read-playback-state",
				"user-modify-playback-state",
				"user-read-email",
				"user-read-private"
			]), [])

	const suggestDeviceName = useCallback(() => {
		const userAgent = navigator.userAgent;

		let browserName = "Unknown Browser"

		if (userAgent.includes('Firefox')) browserName = "Firefox";
		if (userAgent.includes('Chrome')) browserName = "Chrome";
		if (userAgent.includes('Safari')) browserName = "Safari";
		if (userAgent.includes('Edge')) browserName = "Edge";

		let platformName = "Unknown Platform"
		if (userAgent.includes('Win')) platformName = "Windows";
		if (userAgent.includes('Mac')) platformName = "macOS";
		if (userAgent.includes('Linux')) platformName = "Linux";
		if (userAgent.includes('Android')) platformName = "Android";
		if (userAgent.includes('iPhone')) platformName = "iOS";

		return browserName + " on " + platformName;
	}, [navigator.userAgent])

	const deviceName = useMemo<string>(suggestDeviceName, [navigator.userAgent])

	const prevPlaybackState = useRef<Spotify.PlaybackState | null>(null)

	useEffect(() => {
		const script = document.createElement("script");
		script.src = "https://sdk.scdn.co/spotify-player.js";
		script.async = true;

		document.body.appendChild(script);

		let newPlayer: Spotify.Player | null = null;

		window.onSpotifyWebPlaybackSDKReady = () => {
			spotify.getAccessToken().then(async token => {
				let accessToken: AccessToken | null = token
				if (!accessToken) {
					const response = await spotify.authenticate()
					accessToken = response.accessToken
				}
				if (accessToken) {
					newPlayer = new window.Spotify.Player({
						name: 'Playtree Web Player: ' + deviceName,
						getOAuthToken: (cb: any) => { cb(accessToken?.access_token); },
						volume: 1
					});

					newPlayer.activateElement()

					newPlayer.addListener('ready', ({ device_id }: any) => {
						spotify.player.getAvailableDevices().then(({ devices }) => {
							const webPlayerDevice = devices.find(device => device.id === device_id)
							if (webPlayerDevice && webPlayerDevice.id && !webPlayerDevice.is_active) {
								spotify.player.transferPlayback([webPlayerDevice.id], false)
								dispatch({ type: 'spotify_player_ready' })
							}
						})
					});

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
			spotify.player.getPlaybackState().then(playbackState => {
				if (playbackState) {
					const deviceID = playbackState.device.id
					if (deviceID) {
						if (state.playing) {
							const currentSongURI = currentPlayhead.node.content[currentPlayhead.nodeIndex].uri
							spotify.player.startResumePlayback(deviceID, undefined, [currentSongURI], undefined, currentPlayhead.spotifyPlaybackPosition_ms)
						} else {
							spotify.player.pausePlayback(deviceID)
						}
					}
				}
			})
		}
	}, [state.playheads, state.playheadIndex])

	const handlePlayPauseAudio = useCallback((shouldPlay: boolean) => {
		const currentPlayhead = state.playheads[state.playheadIndex]
		const currentSongURI = currentPlayhead.node.content[currentPlayhead.nodeIndex].uri
		spotify.player.getPlaybackState().then(playbackState => {
			const deviceID = playbackState.device.id
			if (deviceID) {
				if (shouldPlay) {
					spotify.player.startResumePlayback(deviceID, undefined, [currentSongURI], undefined, currentPlayhead.spotifyPlaybackPosition_ms)
				} else {
					spotify.player.pausePlayback(deviceID)
					dispatch({ type: "song_progress_received", spotifyPlaybackPosition_ms: playbackState.progress_ms })
				}
			}
		})
		dispatch({ type: shouldPlay ? "played" : "paused" })
		dispatch({ type: "autoplay_set", autoplay: shouldPlay })
	}, [state.playheads, state.playheadIndex])

	if (playtree === null) {
		return (<div className="bg-green-600 fixed flex w-full h-36 left-48 bottom-0"><div className="text-white mx-auto my-16 w-fit font-lilitaOne">No playtrees.</div></div>)
	} else {
		let currentPlayhead: Playhead | null | undefined = null
		let currentPlaynode: PlayNode | null | undefined = null
		
		let currentContent: Content | null | undefined = null

		let currentNodePlaycount: number | undefined = undefined
		let currentNodeMaxPlays: number | undefined = undefined
		let currentContentPlaycount: number | undefined = undefined
		let currentContentMaxPlays: number | undefined = undefined

		if (state && state.playheads) {
			currentPlayhead = state.playheads[state.playheadIndex]
			if (currentPlayhead && currentPlayhead.node) {
				currentPlaynode = currentPlayhead.node
				currentNodePlaycount = currentPlayhead.playcountersByScope[0].playcounters.node.get(currentPlaynode.id)
				currentNodeMaxPlays = currentPlaynode.repeat
				if (currentPlaynode.content) {
					currentContent = currentPlaynode.content[currentPlayhead.nodeIndex]
					currentContentPlaycount = currentPlayhead.playcountersByScope[0].playcounters.content.get(currentPlaynode.id)?.get(currentContent.id)
					currentContentMaxPlays = currentContent.repeat
				}
			}
		}
		return (
			<div className="bg-green-600 fixed flex w-[calc(100vw-12rem)] h-36 left-48 bottom-0">
				<div className="w-full my-auto">
					<div className="w-fit float-right mr-8">
						<div className="w-fit mx-auto">
							<button
								type="button"
								title="Previous Playhead"
								className="rounded-sm p-2 text-white"
								onClick={() => dispatch({ type: "decremented_playhead", playtree: playtree })}>
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
								onClick={() => dispatch({ type: "incremented_playhead", playtree: playtree })}>
								{"\u23EC"}
							</button>
						</div>
					</div>
				</div>
				<div className="w-full mr-8 my-auto text-white font-lilitaOne">
					<table>
						<tbody>
							<tr><td>Playtree</td><td>|</td><td>{playtree.summary.name}</td></tr>
							<tr><td>Playhead</td><td>|</td><td>{currentPlayhead ? currentPlayhead.name : "Playhead not available"}</td></tr>
							<tr><td>Playnode</td><td>|</td><td>{currentPlaynode ? currentPlaynode.name + (currentNodePlaycount !== undefined ? ` (${currentNodePlaycount + 1} / ${currentNodeMaxPlays})` : "") : "Playnode not available"}</td></tr>
							<tr><td>Song</td><td>|</td><td>{currentContent ? currentContent.name + (currentContentPlaycount !== undefined ? ` (${currentContentPlaycount + 1} / ${currentContentMaxPlays})` : "") : "Song not available"}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		)
	}
}
