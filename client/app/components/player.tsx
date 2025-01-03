import { s } from "node_modules/vite/dist/node/types.d-aGj9QkWt";
import { useCallback, useEffect, useReducer } from "react"

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
    type: 'song_ended' | 'skipped_forward';
    playtree: Playtree;
    edgeRand: number;
    selectorRand: number;
} | {
    type:'playtree_loaded' | 'skipped_backward' | 'incremented_playhead' | 'decremented_playhead';
    playtree: Playtree;
}

const reducer = (state : PlayerState, action : PlayerAction) : PlayerState => {
    switch (action.type) {
        case 'playtree_loaded': {
            const newRepeatCounters = new Map<string, Map<string, number>>()
            const newPlayheads = action.playtree.playroots.map(playhead => {
                const playNode = action.playtree.nodes.find(node => node.id === playhead.nodeID)
                if (playNode !== undefined) {
                    return {
                        name: playhead.name,
                        node: playNode,
                        nodeIndex: playNode.type === "selector" ? Math.floor(Math.random() * playNode.content.length) : 0,
                        history: []
                    }
                } else {
                    return undefined
                }
            }).filter(playhead => playhead !== undefined)
            action.playtree.nodes.map((node: PlayNode) => {
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
                    let nextNode = action.playtree.nodes.find(node => {
                        return node.id === selectedEdge.nodeID
                    })
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
                const prevPlayNode = action.playtree.nodes.find(node => {
                    return node.id === prevHistoryNode.nodeID
                })
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
            dispatch({type: "playtree_loaded", playtree: playtree})
        }
    }, [playtree])

    const onAudioChange = useCallback((audio: HTMLAudioElement) => {
        if (audio == null) {
            return
        }

        if (!audio.onended) {
            audio.onended = () => {
                if (playtree !== null) {
                    dispatch({type: 'song_ended', playtree: playtree, edgeRand: Math.random(), selectorRand: Math.random()})
                }                
            }
        }

        if (state.playheads.length > 0) {
            const curPlayhead = state.playheads[state.playheadIndex]
            const curSongURI = curPlayhead.node.content[curPlayhead.nodeIndex].uri
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
        let currentSong = null
        if (state && state.playheads && state.playheads[state.playheadIndex]) {
            currentSong = state.playheads[state.playheadIndex].node.content[state.playheads[state.playheadIndex].nodeIndex].uri.split("/").pop()?.split(".")[0]
        }
        
        return (
            <div className="bg-green-600 fixed w-full left-48 bottom-0">
                <div className="text-white fixed left-2/3 bottom-4 font-lilitaOne">
                    {state.playheads.length > 0 ?
                    <table>
                        <tbody>
                            <tr className="p-2"><td>Playtree</td><td>|</td><td>{playtree.summary.name}</td></tr>
                            <tr className="p-2"><td>Playhead</td><td>|</td><td>{state.playheads[state.playheadIndex].name}</td></tr>
                            <tr className="p-2"><td>Song</td><td>|</td><td>{currentSong}</td></tr>
                        </tbody>
                    </table> : "No playheads available"}
                </div>
                <audio ref={onAudioChange} src="" />
                <div className="w-fit mx-auto">
                    <button
                        type="button"
                        title="Next Playhead"
                        className="rounded-sm p-2 text-white"
                        onClick={() => dispatch({type: "incremented_playhead", playtree: playtree})}>
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
                        title="Previous Playhead"
                        className="rounded-sm p-2 text-white"
                        onClick={() => dispatch({type: "decremented_playhead", playtree: playtree})}>
                        {"\u23EC"}
                    </button>
                </div>
            </div>
        )
    }
}
