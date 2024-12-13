import { useCallback, useReducer } from "react"

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
    rand: number;
} | {
    type: 'skipped_backward' | 'incremented_playhead' | 'decremented_playhead';
    playtree: Playtree;
}

const reducer = (state : PlayerState, action : PlayerAction) : PlayerState => {
    switch (action.type) {
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

            const curNode = state.playheads[state.playheadIndex].node
            const newPlayheads = structuredClone(state.playheads)

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
                const scaledRand = Math.floor(action.rand * totalShares)
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
                        newPlayheads[state.playheadIndex].history.push(newPlayheads[state.playheadIndex].node)
                        newPlayheads[state.playheadIndex].node = nextNode
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
            const prevNode = newPlayheads[state.playheadIndex].history.pop()
            if (prevNode === undefined) {
                return structuredClone(state)
            } else {
                newPlayheads[state.playheadIndex].node = prevNode
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
    if (playtree) {
        initialPlayheads = playtree.playroots.map(playhead => {
            const playNode = playtree.nodes.find(node => node.id === playhead.nodeID)
            if (playNode !== undefined) {
                return {
                    name: playhead.name,
                    node: playNode,
                    history: []
                }
            } else {
                return undefined
            }
        }).filter(playhead => playhead !== undefined)
        playtree.nodes.map((node: PlayNode) => {
            if (node.next) {
                node.next.map((edge : PlayEdge) => {
                    if (edge.repeat >= 0) {
                        const targetNodeToCounter = new Map<string, number>()
                        targetNodeToCounter.set(edge.nodeID, 0)
                        initialRepeatCounters.set(node.id, targetNodeToCounter)
                    }
                })
            }
        })
    }

    const [state, dispatch] = useReducer<typeof reducer>(reducer, {
        playheads: initialPlayheads,
        playheadIndex: initialPlayheadIndex,
        repeatCounters: initialRepeatCounters,
        isPlaying: false
    })

    const onAudioChange = useCallback((audio: HTMLAudioElement) => {
        if (audio == null) {
            return
        }

        if (!audio.onended) {
            audio.onended = () => {
                if (playtree !== null) {
                    dispatch({type: 'song_ended', playtree: playtree, rand: Math.random()})
                }                
            }
        }

        if (state.playheads.length > 0) {
            const curSongPath = state.playheads[state.playheadIndex].node.content.filename

            if (audio.src.split("/").pop() !== curSongPath) {
                audio.pause()
                
                audio.src = "/audio/" + curSongPath
                if (state.isPlaying) {
                    audio.play()
                }
            }

            if (state.isPlaying && audio.paused) {
                audio.play()
            } else if (!state.isPlaying && !audio.paused) {
                audio.pause()
            }
        }
    }, [state])

    if (playtree == null) {
        return (<div className="bg-green-600 fixed flex w-full left-0 bottom-0"><div className="text-white mx-auto my-6 font-lilitaOne">No playtrees.</div></div>)
    } else {
        return (<div className="bg-green-600 fixed w-full left-0 bottom-0">
            <div className="text-white fixed left-2/3 bottom-4 font-lilitaOne">
                {state.playheads.length > 0 ?
                <table>
                    <tbody>
                        <tr className="p-2"><td>Playtree</td><td>|</td><td>{playtree.summary.name}</td></tr>
                        <tr className="p-2"><td>Playhead</td><td>|</td><td>{state.playheads[state.playheadIndex].name}</td></tr>
                        <tr className="p-2"><td>Song</td><td>|</td><td>{state.playheads[state.playheadIndex].node.content.filename.split("/").pop()?.split(".")[0]}</td></tr>
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
                    onClick={() => dispatch({type: "skipped_forward", playtree: playtree, rand: Math.random()})}>{"\u23ED"}</button>
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
        </div>)
    }
}
