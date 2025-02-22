import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { Content, PlayEdge, Playhead, PlayheadInfo, PlayNode, Playtree } from "../types";
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk";

type PlayerProps = {
    playtree: Playtree | null
    autoplay: boolean | undefined
}

type PlayerState = {
    playheads: Playhead[];
    playheadIndex: number;
    contentRepeatCounters: Map<string, Map<string, number>>;
    nodeRepeatCounters: Map<string, number>;
    edgeRepeatCounters: Map<string, Map<string, number>>;
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

const reducer = (state : PlayerState, action : PlayerAction) : PlayerState => {
    switch (action.type) {
        case 'playtree_loaded': {
            const newContentRepeatCounters = new Map<string, Map<string, number>>()
            const newNodeRepeatCounters = new Map<string, number>()
            const newEdgeRepeatCounters = new Map<string, Map<string, number>>()
            const newPlayheads : Playhead[] = []
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
                        stopped: false,
                        spotifyPlaybackPosition_ms: 0
                    }
                }
            })

            Array.from(action.playtree.nodes.values()).forEach((node: PlayNode) => {
                if (node.repeat >= 0) {
                    newNodeRepeatCounters.set(node.id, 0)
                }
                const limitedContentList = node.content.filter(content => content.repeat >= 0)
                if (limitedContentList.length > 0) {
                    newContentRepeatCounters.set(node.id, new Map<string, number>())
                    limitedContentList.forEach(content => {
                        newContentRepeatCounters.get(node.id)?.set(content.id, 0)
                    })
                }
                if (node.next) {
                    node.next.forEach((edge : PlayEdge) => {
                        if (edge.repeat >= 0) {
                            if (newEdgeRepeatCounters.has(node.id)) {
                                newEdgeRepeatCounters.get(node.id)?.set(edge.nodeID, 0)
                            } else {
                                const targetNodeToCounter = new Map<string, number>()
                                targetNodeToCounter.set(edge.nodeID, 0)
                                newEdgeRepeatCounters.set(node.id, targetNodeToCounter)
                            }
                        }
                    })
                    
                }
            })
            return {
                ...state,
                playheadIndex: 0,
                playheads: newPlayheads,
                contentRepeatCounters: newContentRepeatCounters,
                nodeRepeatCounters: newNodeRepeatCounters,
                edgeRepeatCounters: newEdgeRepeatCounters,
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

            const newContentRepeatCounters = structuredClone(state.contentRepeatCounters)
            if (curNode.content[nextNodeIndex] && newContentRepeatCounters.has(curNode.id)) {
                const contentMap = newContentRepeatCounters.get(curNode.id) as Map<string, number>
                const contentID = curNode.content[nextNodeIndex].id
                if (contentMap.has(contentID)) {
                    const count = contentMap.get(contentID) as number
                    newContentRepeatCounters.get(curNode.id)?.set(contentID, count + 1)
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
                    const contentPlays : number = newContentRepeatCounters.get(curNode.id)?.get(curContent.id) ?? -1

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

                        return {
                            ...state,
                            playheads: newPlayheads,
                            contentRepeatCounters: newContentRepeatCounters,
                        }
                    }
                }
            }

            const resetPlayheadAndIncrementIndex = () : number => {
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
                    newPlayheads[state.playheadIndex] = {
                        ...newPlayheads[state.playheadIndex],
                        node: playheadStartNode,
                        nodeIndex: initialNodeIndex,
                        history: [],
                        stopped: true,
                        spotifyPlaybackPosition_ms: 0
                    }
                }

                // move to next playhead
                return (state.playheadIndex + 1) % newPlayheads.length
            }

            if (curNode.next) {
                let totalShares = 0
                const elligibleEdges : PlayEdge[] = []
                const nextEdgesSortedByPriority = [...curNode.next].sort((playedge1, playedge2) => playedge1.priority - playedge2.priority)
                let currentPriority = 0

                // go through each edge and choose edges by
                // the lowest available priority group
                for (let i in nextEdgesSortedByPriority) {
                    let curEdge = nextEdgesSortedByPriority[i]

                    if (curEdge.priority > currentPriority && elligibleEdges.length > 0) {
                        break
                    }

                    const counter = state.edgeRepeatCounters.get(curNode.id)?.get(curEdge.nodeID)
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
        
                    return {
                        ...state,
                        playheadIndex: nextPlayheadIndex,
                        playheads: newPlayheads,
                        autoplay: !newPlayheads[nextPlayheadIndex].stopped
                    }
                }
                const scaledRand = Math.floor(action.edgeRand * totalShares)
                let bound : number = 0
                let selectedEdge : PlayEdge | null = null
                for (let i in elligibleEdges) {
                    const curEdge = elligibleEdges[i]
                    const curShares = curEdge.shares ? curEdge.shares : 1
                    bound += curShares
                    if (scaledRand < bound) {
                        selectedEdge = curEdge
                        break
                    }
                }
                const newEdgeRepeatCounters = structuredClone(state.edgeRepeatCounters)
                const newNodeRepeatCounters = structuredClone(state.nodeRepeatCounters)
                if (selectedEdge !== null) {
                    const count = state.edgeRepeatCounters.get(curNode.id)?.get(selectedEdge.nodeID)
                    if (count !== undefined) {
                        newEdgeRepeatCounters.get(curNode.id)?.set(selectedEdge.nodeID, count + 1)
                    }
                    let nextNode = action.playtree.nodes.get(selectedEdge.nodeID)
                    if (nextNode) {
                        const count = state.nodeRepeatCounters.get(curNode.id)
                        if (count !== undefined) {
                            newNodeRepeatCounters.set(curNode.id, Math.min(count + 1, curNode.repeat))
                        }
                        newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex, multIndex: curMultIndex, traversedPlayedge: selectedEdge })
                        newPlayheads[state.playheadIndex].node = nextNode
                        newPlayheads[state.playheadIndex].multIndex = 0
                        if (nextNode.type === "selector") {
                            let selectedNodeIndex = -1
                            
                            const totalShares = nextNode.content.filter(content => {
                                const count = newContentRepeatCounters.get(nextNode.id)?.get(content.id)
                                return count === undefined || count < content.repeat
                            }).map(content => content.mult).reduce((a, b) => a + b, 0)
                            const randomDrawFromShares = Math.floor(action.selectorRand * totalShares)
                            let bound = 0
                            nextNode.content.some((content, index) => {
                                const count = newContentRepeatCounters.get(nextNode.id)?.get(content.id)
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
                                const count = newContentRepeatCounters.get(nextNode.id)?.get(content.id)
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

                return {
                    ...state,
                    playheads: newPlayheads,
                    contentRepeatCounters: newContentRepeatCounters,
                    nodeRepeatCounters: newNodeRepeatCounters,
                    edgeRepeatCounters: newEdgeRepeatCounters
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

                const newContentRepeatCounters = structuredClone(state.contentRepeatCounters)
                const prevContent = prevPlaynode.content[prevHistoryNode.index]
                let oldContentRepeatCounterValue : number | undefined = undefined
                if (prevContent) {
                    oldContentRepeatCounterValue = newContentRepeatCounters.get(prevPlaynode.id)?.get(prevContent.id)
                }
                if (oldContentRepeatCounterValue !== undefined) {
                    newContentRepeatCounters.get(prevPlaynode.id)?.set(prevContent.id, oldContentRepeatCounterValue - 1)
                }

                const traversedPlayedge = prevHistoryNode.traversedPlayedge
                if (traversedPlayedge && traversedPlayedge.repeat >= 0) {
                    const newNodeRepeatCounters = structuredClone(state.nodeRepeatCounters)
                    const oldNodeRepeatCounterValue = newNodeRepeatCounters.get(prevPlaynode.id)
                    if (oldNodeRepeatCounterValue !== undefined) {
                        newNodeRepeatCounters.set(prevPlaynode.id, Math.max(oldNodeRepeatCounterValue - 1, 0))
                    }

                    const newEdgeRepeatCounters = structuredClone(state.edgeRepeatCounters)
                    const oldEdgeRepeatCounterValue = newEdgeRepeatCounters.get(prevPlaynode.id)?.get(traversedPlayedge.nodeID)
                    if (oldEdgeRepeatCounterValue !== undefined) {
                        newEdgeRepeatCounters.get(prevPlaynode.id)?.set(traversedPlayedge.nodeID, Math.max(oldEdgeRepeatCounterValue - 1, 0))
                    }

                    if (oldNodeRepeatCounterValue !== undefined || oldEdgeRepeatCounterValue !== undefined) {
                        return {
                            ...state,
                            playheads: newPlayheads,
                            contentRepeatCounters: newContentRepeatCounters,
                            nodeRepeatCounters: newNodeRepeatCounters,
                            edgeRepeatCounters: newEdgeRepeatCounters
                        }
                    }
                }
                return {
                    ...state,
                    playheads: newPlayheads,
                    contentRepeatCounters: newContentRepeatCounters,
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

export default function Player({playtree, autoplay}: PlayerProps) {
    const initialPlayheadIndex = 0
    let initialPlayheads : Playhead[] = []

    let initialContentRepeatCounters = new Map<string, Map<string, number>>()
    let initialNodeRepeatCounters = new Map<string, number>()
    let initialEdgeRepeatCounters = new Map<string, Map<string, number>>()

    const [state, dispatch] = useReducer<typeof reducer>(reducer, {
        playheads: initialPlayheads,
        playheadIndex: initialPlayheadIndex,
        contentRepeatCounters: initialContentRepeatCounters,
        nodeRepeatCounters: initialNodeRepeatCounters,
        edgeRepeatCounters: initialEdgeRepeatCounters,
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
    
    function suggestDeviceName() {
        const userAgent = navigator.userAgent;

        let browserName = "Unknown Browser"
    
        if (userAgent.includes('Firefox')) browserName = "Firefox";
        if ( userAgent.includes('Chrome')) browserName = "Chrome";
        if ( userAgent.includes('Safari')) browserName = "Safari";
        if (   userAgent.includes('Edge')) browserName = "Edge";

        let platformName = "Unknown Platform"
        if (    userAgent.includes('Win')) platformName = "Windows";
        if (    userAgent.includes('Mac')) platformName = "macOS";
        if (  userAgent.includes('Linux')) platformName = "Linux";
        if (userAgent.includes('Android')) platformName = "Android";
        if ( userAgent.includes('iPhone')) platformName = "iOS";

        return browserName + " on " + platformName;
    }

    const deviceName = useMemo<string>(suggestDeviceName, [])

    const prevPlaybackState = useRef<Spotify.PlaybackState | null>(null)

    useEffect(() => {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
    
        document.body.appendChild(script);

        let newPlayer : Spotify.Player | null = null;
    
        window.onSpotifyWebPlaybackSDKReady = () => {
            spotify.getAccessToken().then(async token => {
                let accessToken : AccessToken | null = token
                if (!accessToken) {
                    const response = await spotify.authenticate()
                    accessToken = response.accessToken
                }
                if (accessToken) {
                    newPlayer = new window.Spotify.Player({
                        name: 'Playtree Web Player: ' + deviceName,
                        getOAuthToken: (cb : any) => { cb(accessToken?.access_token); },
                        volume: 1
                    });

                    newPlayer.activateElement()
            
                    newPlayer.addListener('ready', ({ device_id } : any) => {
                        spotify.player.getAvailableDevices().then(({devices}) => {
                            const webPlayerDevice = devices.find(device => device.id === device_id)
                            if (webPlayerDevice && webPlayerDevice.id && !webPlayerDevice.is_active) {
                                spotify.player.transferPlayback([webPlayerDevice.id], false)
                                dispatch({type: 'spotify_player_ready'})
                            }
                        })
                    });

                    newPlayer.addListener('player_state_changed', playbackState => {
                        if (prevPlaybackState.current && !prevPlaybackState.current.paused && playbackState.paused && playbackState.position === 0) {
                            if (playtree) {
                                dispatch({type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random()})
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

    useEffect(() => {
        if (playtree) {
            dispatch({type: "playtree_loaded", playtree: playtree, selectorRand: Math.random(), autoplay: autoplay})
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
                    dispatch({type: "song_progress_received", spotifyPlaybackPosition_ms: playbackState.progress_ms})
                }
            }
        })
        dispatch({type: shouldPlay ? "played" : "paused"})
        dispatch({type: "autoplay_set", autoplay: shouldPlay})
    }, [state.playheads, state.playheadIndex])

    if (playtree == null) {
        return (<div className="bg-green-600 fixed flex w-full h-36 left-48 bottom-0"><div className="text-white mx-auto my-16 w-fit font-lilitaOne">No playtrees.</div></div>)
    } else {
        let currentPlayhead : Playhead | null | undefined = null
        let currentPlaynode : PlayNode | null | undefined = null
        let currentContent  : Content  | null | undefined = null
        if (state && state.playheads) {
            currentPlayhead = state.playheads[state.playheadIndex]
            if (currentPlayhead && currentPlayhead.node) {
                currentPlaynode = currentPlayhead.node
                if (currentPlaynode.content) {
                    currentContent = currentPlaynode.content[currentPlayhead.nodeIndex]
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
                                onClick={() => dispatch({type: "decremented_playhead", playtree: playtree})}>
                                {"\u23EB"}
                            </button>
                        </div>
                        <div className="w-fit mx-auto">
                            <button
                                type="button"
                                title="Skip Backward"
                                className="rounded-sm p-2 text-white"
                                onClick={() => dispatch({type: "skipped_backward", playtree: playtree})}>
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
                                onClick={() => dispatch({type: "skipped_forward", playtree: playtree, edgeRand: Math.random(), selectorRand: Math.random()})}>{"\u23ED"}</button>
                        </div>
                        <div className="w-fit mx-auto">
                            <button
                                type="button"
                                title="Next Playhead"
                                className="rounded-sm p-2 text-white"
                                onClick={() => dispatch({type: "incremented_playhead", playtree: playtree})}>
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
                            <tr><td>Playnode</td><td>|</td><td>{currentPlaynode ? currentPlaynode.name : "Playnode not available"}</td></tr>
                            <tr><td>Song</td><td>|</td><td>{currentContent ? currentContent.name : "Song not available"}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }
}
