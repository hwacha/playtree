import { useCallback, useEffect, useReducer } from "react"
import { Content, PlayEdge, Playhead, PlayheadInfo, PlayNode, Playtree } from "../types";

type PlayerProps = {
    playtree: Playtree | null
}

type PlayerState = {
    playheads: Playhead[];
    playheadIndex: number;
    repeatCounters: Map<string, Map<string, number>>;
    isPlaying: boolean;
}

type PlayerAction = {
    type: 'played' | 'paused';
} | {
    type: 'skipped_backward' | 'incremented_playhead' | 'decremented_playhead';
    playtree: Playtree;
} | {
    type: 'playtree_loaded';
    playtree: Playtree;
    selectorRand: number;
} | {
    type: 'song_ended' | 'skipped_forward';
    playtree: Playtree;
    selectorRand: number;
    edgeRand: number;
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
                        history: []
                    }
                }
            })

            Array.from(action.playtree.nodes.values()).map((node: PlayNode) => {
                if (node.next) {
                    node.next.map((edge : PlayEdge) => {
                        if (edge.repeat >= 0) {
                            const targetNodeToCounter = new Map<string, number>()
                            targetNodeToCounter.set(edge.nodeID, 0)
                            newRepeatCounters.set(node.id, targetNodeToCounter)
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

        case 'played': {
            return {
                ...state,
                isPlaying: true
            };
        }
        case 'paused': {
            return {
                ...state,
                isPlaying: false
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
                newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex })
                newPlayheads[state.playheadIndex].node = curNode
                newPlayheads[state.playheadIndex].nodeIndex = curNodeIndex + 1
                return {
                    ...state,
                    playheads: newPlayheads,
                }
            }

            if (curNode.next) {
                let totalShares = 0
                const elligibleEdges : PlayEdge[] = []
                for (let i in curNode.next) {
                    let curEdge = curNode.next[i]

                    const counter = state.repeatCounters.get(curNode.id)?.get(curEdge.nodeID)
                    if (counter !== undefined && curEdge.repeat > 0 && counter >= curEdge.repeat) {
                        continue
                    }

                    if (!curEdge.shares) {
                        totalShares += 1
                    } else {
                        totalShares += curEdge.shares
                    }
                    elligibleEdges.push(curEdge)
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
                        newPlayheads[state.playheadIndex].history.push({ nodeID: curNode.id, index: curNodeIndex })
                        newPlayheads[state.playheadIndex].node = nextNode
                        if (nextNode.type === "selector") {
                            newPlayheads[state.playheadIndex].nodeIndex = Math.floor(action.selectorRand * nextNode.content.length)
                        }
                    }
                }

                return {
                    ...state,
                    playheads: newPlayheads,
                    repeatCounters: newRepeatCounters
                }
            }

            newPlayheads.splice(state.playheadIndex, 1)
            let index = state.playheadIndex % newPlayheads.length

            return {
                ...state,
                playheadIndex: index,
                playheads: newPlayheads,
            }
        }
        case 'skipped_backward': {
            const newPlayheads = structuredClone(state.playheads)
            const prevHistoryNode = newPlayheads[state.playheadIndex].history.pop()
            if (prevHistoryNode === undefined) {
                return structuredClone(state)
            } else {
                const prevPlayNode = action.playtree.nodes.get(prevHistoryNode.nodeID)
                if (prevPlayNode === undefined) {
                    return structuredClone(state)
                }
                newPlayheads[state.playheadIndex].node = structuredClone(prevPlayNode)
                newPlayheads[state.playheadIndex].nodeIndex = prevHistoryNode.index
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
    }
}

export default function Player({playtree}: PlayerProps) {
    const initialPlayheadIndex = 0
    let initialPlayheads : Playhead[] = []
    let initialRepeatCounters = new Map<string, Map<string, number>>()

    const [state, dispatch] = useReducer<typeof reducer>(reducer, {
        playheads: initialPlayheads,
        playheadIndex: initialPlayheadIndex,
        repeatCounters: initialRepeatCounters,
        isPlaying: false
    })

    useEffect(() => {
        if (playtree) {
            dispatch({type: "playtree_loaded", playtree: playtree, selectorRand: Math.random()})
        }
    }, [playtree])

    const onAudioChange = useCallback((audio: HTMLAudioElement) => {
        if (!audio) {
            return
        }

        if (!audio.onended) {
            audio.onended = () => {
                if (playtree) {
                    dispatch({type: 'song_ended', playtree: playtree, edgeRand: Math.random(), selectorRand: Math.random()})
                }
            }
        }

        const currentPlayhead = state.playheads[state.playheadIndex]

        if (currentPlayhead) {
            if (currentPlayhead.node && currentPlayhead.node.content && currentPlayhead.node.content[currentPlayhead.nodeIndex]) {
                const curSongURI = currentPlayhead.node.content[currentPlayhead.nodeIndex].uri
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
                            const url = window.URL.createObjectURL(blob);
                            audio.src = url;
                            if (state.isPlaying) {
                                audio.play()
                            }
                        })()
                    }
                })
            }

            if (state.isPlaying && audio.paused) {
                audio.play()
            } else if (!state.isPlaying && !audio.paused) {
                audio.pause()
            }
        }
    }, [state])

    if (playtree == null) {
        return (<div className="bg-green-600 fixed flex w-full left-48 bottom-0"><div className="text-white mx-auto my-6 font-lilitaOne">No playtrees.</div></div>)
    } else {
        let currentPlayhead : Playhead | null | undefined = null
        let currentContent : Content | null | undefined = null
        if (state && state.playheads) {
            currentPlayhead = state.playheads[state.playheadIndex]
            if (currentPlayhead && currentPlayhead.node && currentPlayhead.node.content) {
                currentContent = currentPlayhead.node.content[currentPlayhead.nodeIndex]
            }
        }
        
        return (
            <div className="bg-green-600 fixed flex w-[calc(100vw-12rem)] left-48 bottom-0">
                <audio ref={onAudioChange} src="" />
                <div className="w-full">
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
                                title={state.isPlaying ? "Pause" : "Play"}
                                className="rounded-sm p-2 text-white fill-white"
                                onClick={() => state.isPlaying ? dispatch({type: 'paused'}) : dispatch({type: 'played'})}>
                                {state.isPlaying ? "\u23F8" : "\u23F5"}
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
                            <tr><td>Song</td><td>|</td><td>{currentContent ? currentContent.uri.split("/").pop()?.split(".")[0] : "Song not available"}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }
}
