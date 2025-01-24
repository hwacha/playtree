import { useCallback, useEffect, useReducer, useRef } from "react"
import { Content, PlayEdge, Playhead, PlayheadInfo, PlayNode, Playtree } from "../types";

type PlayerProps = {
    playtree: Playtree | null
    autoplay: boolean | undefined
}

type PlayerState = {
    playheads: Playhead[];
    playheadIndex: number;
    repeatCounters: Map<string, Map<string, number>>;
    playerStatus: 'awaiting_play'|'playing'|'paused';
    autoplay: boolean;
    mapOfURIsToGeneratedBlobURLs: Map<string, string>;
}

type PlayerAction = {
    type: 'started_playing' | 'played' | 'paused';
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
    type: 'new_song_loaded';
    uri: string;
    blobURL: string
} | {
    type: 'autoplay_set';
    autoplay: boolean;
}

const reducer = (state : PlayerState, action : PlayerAction) : PlayerState => {
    switch (action.type) {
        case 'playtree_loaded': {
            const newRepeatCounters = new Map<string, Map<string, number>>()
            const newPlayheads : Playhead[] = []
            action.playtree.playroots.forEach((playroot: PlayheadInfo, nodeID: string) => {
                const playNode = action.playtree.nodes.get(nodeID)
                if (playNode !== undefined) {
                    newPlayheads[playroot.index] = {
                        name: playroot.name,
                        node: playNode,
                        nodeIndex: playNode.type === "selector" ? Math.floor(action.selectorRand * playNode.content.length) : 0,
                        history: [],
                        stopped: false,
                    }
                }
            })

            Array.from(action.playtree.nodes.values()).forEach((node: PlayNode) => {
                if (node.next) {
                    node.next.forEach((edge : PlayEdge) => {
                        if (edge.repeat >= 0) {
                            if (newRepeatCounters.has(node.id)) {
                                newRepeatCounters.get(node.id)?.set(edge.nodeID, 0)
                            } else {
                                const targetNodeToCounter = new Map<string, number>()
                                targetNodeToCounter.set(edge.nodeID, 0)
                                newRepeatCounters.set(node.id, targetNodeToCounter)
                            }
                        }
                    })
                    
                }
            })

            return {
                ...state,
                playheadIndex: 0,
                playheads: newPlayheads,
                repeatCounters: newRepeatCounters,
            }
        }
        case 'started_playing': {
            return {
                ...state,
                playerStatus: "awaiting_play"
            }
        }
        case 'played': {
            return {
                ...state,
                playerStatus: "playing"
            };
        }
        case 'paused': {
            return {
                ...state,
                playerStatus: "paused"
            }
        }
        case 'song_ended':
        case 'skipped_forward': {
            if (state.playheads.length == 0) {
                return structuredClone(state)
            }

            const curPlayhead = state.playheads[state.playheadIndex]
            const curNode = curPlayhead.node
            const curNodeIndex = curPlayhead.nodeIndex
            const newPlayheads = structuredClone(state.playheads)

            if (curNode.type === "sequence" && curNodeIndex + 1 < curNode.content.length) {
                newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex, traversedPlayedge: null })
                newPlayheads[state.playheadIndex].node = curNode
                newPlayheads[state.playheadIndex].nodeIndex = curNodeIndex + 1
                return {
                    ...state,
                    playheads: newPlayheads,
                }
            }

            const resetPlayheadAndIncrementIndex = () : number => {
                // reset playhead
                const playheadStartNodeID = newPlayheads[state.playheadIndex].history[0]?.nodeID ?? newPlayheads[state.playheadIndex].node.id
                const playheadStartNode = action.playtree.nodes.get(playheadStartNodeID)
                if (playheadStartNode) {
                    newPlayheads[state.playheadIndex] = {
                        ...newPlayheads[state.playheadIndex],
                        node: playheadStartNode,
                        nodeIndex: playheadStartNode.type === "selector" ? Math.floor(action.selectorRand * playheadStartNode.content.length) : 0,
                        history: [],
                        stopped: true,
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

                    const counter = state.repeatCounters.get(curNode.id)?.get(curEdge.nodeID)
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
                const newRepeatCounters = structuredClone(state.repeatCounters)
                if (selectedEdge != null) {
                    const counter = state.repeatCounters.get(curNode.id)?.get(selectedEdge.nodeID)
                    if (counter !== undefined) {
                        newRepeatCounters.get(curNode.id)?.set(selectedEdge.nodeID, counter + 1)
                    }
                    let nextNode = action.playtree.nodes.get(selectedEdge.nodeID)
                    if (nextNode) {
                        newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex, traversedPlayedge: selectedEdge })
                        newPlayheads[state.playheadIndex].node = nextNode
                        if (nextNode.type === "selector") {
                            newPlayheads[state.playheadIndex].nodeIndex = Math.floor(action.selectorRand * nextNode.content.length)
                        } else {
                            newPlayheads[state.playheadIndex].nodeIndex = 0
                        }
                    }
                }

                return {
                    ...state,
                    playheads: newPlayheads,
                    repeatCounters: newRepeatCounters
                }
            }
            const nextPlayheadIndex = resetPlayheadAndIncrementIndex()
            return {
                ...state,
                playheadIndex: nextPlayheadIndex,
                playheads: newPlayheads,
                autoplay: !newPlayheads[nextPlayheadIndex].stopped
            }
        }
        case 'skipped_backward': {
            const newPlayheads = structuredClone(state.playheads)
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
                const traversedPlayedge = prevHistoryNode.traversedPlayedge
                if (traversedPlayedge && traversedPlayedge.repeat >= 0) {
                    const newRepeatCounters = structuredClone(state.repeatCounters)
                    const oldRepeatCounterValue = newRepeatCounters.get(prevPlaynode.id)?.get(traversedPlayedge.nodeID)
                    if (oldRepeatCounterValue !== undefined) {
                        newRepeatCounters.get(prevPlaynode.id)?.set(traversedPlayedge.nodeID, Math.max(oldRepeatCounterValue - 1, 0))
                        return {
                            ...state,
                            playheads: newPlayheads,
                            repeatCounters: newRepeatCounters
                        }
                    }
                }
                return {
                    ...state,
                    playheads: newPlayheads,
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
        case 'new_song_loaded': {
            const newMap = structuredClone(state.mapOfURIsToGeneratedBlobURLs)
            newMap.set(action.uri, action.blobURL)
            return {
                ...state,
                mapOfURIsToGeneratedBlobURLs: newMap
            }
        }
        case 'autoplay_set': {
            return {
                ...state,
                autoplay: action.autoplay
            }
        }
    }
}

export default function Player({playtree, autoplay}: PlayerProps) {
    const initialPlayheadIndex = 0
    let initialPlayheads : Playhead[] = []
    let initialRepeatCounters = new Map<string, Map<string, number>>()

    const [state, dispatch] = useReducer<typeof reducer>(reducer, {
        playheads: initialPlayheads,
        playheadIndex: initialPlayheadIndex,
        repeatCounters: initialRepeatCounters,
        playerStatus: autoplay ? "awaiting_play" : "paused",
        autoplay: autoplay ?? false,
        mapOfURIsToGeneratedBlobURLs: new Map<string, string>()
    })

    useEffect(() => {
        if (playtree) {
            dispatch({type: "playtree_loaded", playtree: playtree, selectorRand: Math.random(), autoplay: autoplay})
        }
    }, [playtree])

    const audioRef = useRef<HTMLAudioElement | null>(null)

    const handlePlayPauseAudio = useCallback((shouldPlay: boolean) => {
        if (shouldPlay) {
            if (playtree && audioRef.current && audioRef.current.src === "") {
                dispatch({ type: "skipped_forward", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random() })
            } else {
                audioRef.current?.play()
                dispatch({type: 'started_playing'})
            }
        } else {
            audioRef.current?.pause()
        }
        dispatch({type: "autoplay_set", autoplay: shouldPlay})
    }, [audioRef])

    const handleAudioPlaying = useCallback(() => {
        dispatch({type: "played"})
    }, [])

    const handleAudioPaused = useCallback(() => {
        dispatch({type: "paused"})
    }, [])

    const handleSongEnded = useCallback(() => {
        if (playtree) {
            dispatch({type: "song_ended", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random()})
        }
    }, [playtree, state])

    useEffect(() => {
        const audio = audioRef.current
        const currentPlayhead = state.playheads[state.playheadIndex]
        if (audio && currentPlayhead) {
            if (currentPlayhead.node && currentPlayhead.node.content) {
                let currentContent : Content | undefined = currentPlayhead.node.content[currentPlayhead.nodeIndex]
                let curSongURI     : string  | undefined = currentContent?.uri

                if (playtree && (!currentContent || !curSongURI || curSongURI === "")) {
                    dispatch({ type: "skipped_forward", playtree: playtree, selectorRand: Math.random(), edgeRand: Math.random()})
                    return
                }
                
                if (state.mapOfURIsToGeneratedBlobURLs.has(curSongURI)) {
                    audio.src = state.mapOfURIsToGeneratedBlobURLs.get(curSongURI) as string
                    if (state.autoplay) {
                        audio.play()
                    }
                } else {
                    fetch("http://localhost:8081/songs/" + curSongURI).then(response => {
                        return response.body
                    }).then(stream => {
                        if (stream) {
                            (async () => {
                                const reader = stream.getReader();
                                const chunks = [];
                
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    chunks.push(value);
                                }
        
                                const blob = new Blob(chunks)
                                const blobURL = window.URL.createObjectURL(blob)
                                dispatch({type: "new_song_loaded", uri: curSongURI, blobURL: blobURL})
                                audio.src = blobURL;
                                if (state.autoplay) {
                                    audio.play()
                                }
                            })()
                        }
                    })
                }
            }
        }
    }, [playtree, state.playheads, state.playheadIndex])

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
                <audio preload="auto" src="" ref={audioRef} onEnded={handleSongEnded} onPlaying={handleAudioPlaying} onPause={handleAudioPaused} />
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
                                title={state.playerStatus === 'awaiting_play' ? "..." : state.playerStatus === 'playing' ? "Pause" : "Play"}
                                className="rounded-sm p-2 text-white fill-white"
                                onClick={() => {
                                    if (state.playerStatus !== 'awaiting_play') {
                                        handlePlayPauseAudio(state.playerStatus === 'paused')
                                    }}
                                }
                            >
                                {state.playerStatus === 'awaiting_play' ? "\u{1F51C}" : state.playerStatus === 'playing' ? "\u23F8" : "\u23F5"}
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
                            <tr><td>Song</td><td>|</td><td>{currentContent ? currentContent.uri.split("/").pop()?.split(".")[0] : "Song not available"}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }
}
