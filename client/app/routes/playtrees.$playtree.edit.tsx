import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, Node, NodeProps, EdgeProps, getBezierPath, Edge, BaseEdge, BezierEdge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, addEdge, OnConnect, useNodesState, useEdgesState, ConnectionLineComponent, useConnection, EdgeLabelRenderer } from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import invariant from "tiny-invariant";
import SearchField from "~/components/SearchField";
import { Content, jsonFromPlaytree, PlayEdge, PlayheadInfo, PlayNode, Playtree, playtreeFromJson } from "../types";

export const loader = async ({params} : LoaderFunctionArgs) => {
    invariant(params.playtree)
    const response = await fetch(`http://localhost:8080/playtrees/${params.playtree}`)
    return await response.json()
}

type PlayheadProps = {
    index: number;
    name: string;
    nodeID: string;
    dispatch: (action: PlaytreeEditorAction) => void;
}

function PlayheadComponent(props : PlayheadProps) {
    const [name, setName] = useState(props.name)
    const onNameChange = useCallback((evt : React.ChangeEvent<HTMLInputElement>) => {
        setName(evt.target.value)
        props.dispatch({
            type: "updated_playhead",
            index: props.index,
            playhead: {
                name: evt.target.value,
                nodeID: props.nodeID,
            }
        })
    }, [name])

    const handleDragStart = (event : any) => {
        if (event && event.target) {
            event.dataTransfer.setData("text", event.target.id)
        }
    }

    return (
        <div id={name} draggable={true} onDragStart={handleDragStart} className="flex absolute -top-9 left-40">
            <div className="mr-2 bg-purple-300 px-2 py-1 rounded-md">💽</div>
            <input value={name} onChange={onNameChange} className="bg-transparent w-20"/>
        </div>
    )
}

export type PlayNodeFlow = Node<{
    playnode: PlayNode;
    playhead: PlayheadInfo|null;
    dispatch: (action: PlaytreeEditorAction) => void;
    handleDeletePlaynode: (id: string) => void;
}, 'play'>;

function PlayNodeFlow(props : NodeProps<PlayNodeFlow>) {
    const [expanded, setExpanded] = useState<boolean>(false)
    const [adding, setAdding] = useState<boolean>(false)

    const [playnodeName, setPlaynodeName] = useState<string>(props.data.playnode.name)
    const [playnodeType, setPlaynodeType] = useState<PlayNode["type"]>(props.data.playnode.type)
    const [contentList, setContentList] = useState<Content[]>(props.data.playnode.content)

    const [playhead, setPlayhead] = useState<PlayheadInfo | null>(props.data.playhead)

    const handleExpandOrCollapse = useCallback(() => {
        setExpanded(!expanded)
    }, [expanded])

    const handleAddBegin = useCallback((_ : any) => {
        setAdding(true)
    }, [])

    const handleContentSelect = useCallback((newContent: string) : boolean => {
        const newContentList = structuredClone(contentList)
        newContentList.push({type: "spotify-track", uri: newContent})
        setContentList(newContentList)
        props.data.dispatch({type: "updated_playnode", nodeID: props.data.playnode.id, patch: {content: newContentList}})
        setAdding(false)
        return false
    }, [adding, contentList])

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setPlaynodeName(event.target.value)
        props.data.dispatch({type: "updated_playnode", nodeID: props.data.playnode.id, patch: {name: event.target.value}})
    }, [playnodeName]);

    const handleTogglePlaynodeType = useCallback(() => {
        const otherType : PlayNode["type"] = playnodeType === "sequence" ? "selector" : "sequence"
        setPlaynodeType(otherType)
        props.data.dispatch({type: "updated_playnode", nodeID: props.data.playnode.id, patch: {type: otherType}})
    }, [playnodeType])

    const handleMoveUp = useCallback((index : number) => (_ : any) => {
        if (index <= 0) {
            return
        }
        const newContentList = structuredClone(contentList)
        newContentList[index - 1] = contentList[index]
        newContentList[index] = contentList[index - 1]
        setContentList(newContentList)
        props.data.dispatch({type: "updated_playnode", nodeID: props.data.playnode.id, patch: {content: newContentList}})
    }, [contentList])

    const handleMoveDown = useCallback((index : number) => (_ : any) => {
        if (index + 1 >= contentList.length) {
            return
        }
        const newContentList = structuredClone(contentList)
        newContentList[index + 1] = contentList[index]
        newContentList[index] = contentList[index + 1]
        setContentList(newContentList)
        props.data.dispatch({type: "updated_playnode", nodeID: props.data.playnode.id, patch: { content: newContentList}})
    }, [contentList])

    const handleDeleteContent = useCallback((index : number) => (_ : any) => {
        const newContentList = structuredClone(contentList)
        newContentList.splice(index, 1)
        setContentList(newContentList)
        props.data.dispatch({type: "updated_playnode", nodeID: props.data.playnode.id, patch: {content: newContentList}})
    }, [contentList])

    const handleDeleteSelf = useCallback(() => {
        props.data.handleDeletePlaynode(props.data.playnode.id)
    }, [])

    const isSequence = playnodeType === "sequence"
    const color = isSequence ? "green" : "amber"

    const handleDrop = (event : any) => {
        event.preventDefault();
        var data = event.dataTransfer.getData("text");
        setPlayhead({name: "Playhead", nodeID: props.data.playnode.id})
        props.data.dispatch({type:"added_playhead", nodeID: props.data.playnode.id})
    }

    return (
        <>
            <div>{ playhead ? <PlayheadComponent index={0} name={playhead.name} nodeID={props.id} dispatch={(x) => props.data.dispatch(x)}/> : null }</div>
            <Handle type="target" position={Position.Top} />
            {
                expanded ?
                <div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-48 p-4 text-${color}-600`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                    <div className="mb-5">
                        <button className={`bg-blue-300 rounded-lg px-2 py-1 absolute top-1 left-1`} onClick={handleExpandOrCollapse} title="Collapse">↖️</button>
                        <button className={`bg-${color}-300 rounded-lg px-2 py-1 absolute top-1 left-10`} onClick={handleTogglePlaynodeType} title={playnodeType}>{isSequence ? <>🔢</> : <>🎲</> }</button>
                        <button className={`bg-red-300 rounded-lg px-2 py-1 absolute top-1 right-1`} onClick={handleDeleteSelf} title="Delete Playnode">🗑️</button>
                    </div>
                    <input id="text" name="text" value={playnodeName} onChange={handleChange} className={`w-full bg-${color}-100 text-center`} />
                    <ul className="my-3">
                        {
                            contentList.map((content: Content, index : number) => {
                                return (
                                    <li key={index} className={`border border-${color}-600 bg-${color}-200 font-markazi flex`}>
                                        {index > 0 ? <button className="w-fit ml-1" title="Move Content Up In List" onClick={handleMoveUp(index)}>⬆️</button> : <div className="ml-5"/>}
                                        {index + 1 < contentList.length ? <button className="w-fit ml-1" title="Move Content Down In List" onClick={handleMoveDown(index)}>⬇️</button> : <div className="ml-5"/>}
                                        <span className="w-full ml-3">{content.uri}</span>
                                        <button className="w-fit mr-1" title="Delete Content" onClick={handleDeleteContent(index)}>❌</button>
                                    </li>
                                )
                            })
                        }
                    </ul>
                    {
                        adding ?
                        <SearchField onContentSelect={handleContentSelect} /> :
                        <div className="flex"><button title="Add Content" className={`border-${color}-600 bg-${color}-400 border-2 rounded-full px-2 py-1 m-auto`} onClick={handleAddBegin}>➕</button></div>
                    }
                </div> :
                <div className={`border-${color}-600 bg-${color}-100 text-${color}-600 border-4 rounded-xl w-48 h-16 py-4 text-center`} onClick={handleExpandOrCollapse} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>{playnodeName}</div>
            }
            <Handle type="source" position={Position.Bottom} id="a" />
            <Handle
            type="source"
            position={Position.Bottom}
            id="b"
            />
        </>
    )
}

type PlayEdgeFlow = Edge<{
    playedge: PlayEdge;
    dispatch: (action: PlaytreeEditorAction) => void;
}, 'play'>;

function PlayEdgeFlow(props: EdgeProps<PlayEdgeFlow>) {
    if (!props.data) {
        return null
    }

    const [shares, setShares] = useState<string>(props.data.playedge.shares.toString())
    const [repeat, setRepeat] = useState<string>(props.data.playedge.repeat.toString())

    const handleSharesChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const inputAsNumber = Number(event.target.value)
        if (event.target.value == "" || (Number.isInteger(inputAsNumber) && inputAsNumber >= 0)) {
            setShares(event.target.value)
            if (props.data) {
                props.data.dispatch({type: "updated_playedge", sourceID: props.source, targetID: props.target, patch: {
                    shares: event.target.value === "" ? 1 : inputAsNumber
                }})
            }
        }
    }, [shares])

    const handleRepeatChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        let inputAsNumber = Number(event.target.value)
        if (event.target.value === "" || event.target.value === "-" || (Number.isInteger(inputAsNumber) && inputAsNumber >= -1)) {
            setRepeat(event.target.value)
            if (event.target.value === "") {
                inputAsNumber = 1
            }
            if (event.target.value === "-") {
                inputAsNumber = -1
            }
            if (props.data) {
                props.data.dispatch({type: "updated_playedge", sourceID: props.source, targetID: props.target, patch: {
                    repeat: inputAsNumber
                }})
            }
        }
    }, [repeat])

    const { sourceX, sourceY, targetX, targetY, id, markerEnd } = props;
    let [edgePath, labelX, labelY] = getBezierPath(props)
    if (Math.abs(sourceX - targetX) < 0.001 && sourceY > targetY) {
        const distance = sourceY - targetY
        const logDistance = Math.log(distance)
        edgePath = `M ${sourceX} ${sourceY} C ${sourceX - (40 * logDistance)} ${sourceY + (40 * logDistance)} ${targetX - (40 * logDistance)} ${targetY - (40 * logDistance)} ${targetX} ${targetY}`
    }

    return (
        <>
            <BaseEdge path={edgePath} style={props.style} markerEnd={markerEnd} />
            <EdgeLabelRenderer>
                <div style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 32}px)`,
                    pointerEvents: 'all'
                }} className="w-24 flex">Shares:<input value={shares} className="w-full" onChange={handleSharesChange} /></div>
                <div style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                    pointerEvents: 'all'
                }} className="w-24 flex">Repeat:<input value={repeat} className="w-full" onChange={handleRepeatChange} /></div>
                <button className="bg-red-300 rounded-lg px-2 py-1" style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + 32}px)`,
                    pointerEvents: 'all'
                }}>
                    Delete
                </button>
            </EdgeLabelRenderer>
        </>
    )
}

type PlaytreeEditorState = {
    playtree: Playtree,
    unsavedChangesExist: boolean
}

type PlaytreeEditorAction = {
    type: "loaded_playtree",
    playtree: Playtree
} | {
    type: "added_playnode"|"saved_playtree",
} | {
    type: "updated_playnode",
    nodeID: string,
    patch: Partial<Omit<PlayNode, 'id' | 'next'>>
} | {
    type: "deleted_playnode",
    nodeID: string
} | {
    type: "added_playedge" | "deleted_playedge",
    sourceID: string,
    targetID: string
} | {
    type: "updated_playedge",
    sourceID: string,
    targetID: string,
    patch: Partial<Omit<PlayEdge, 'nodeID'>>
} | {
    type: "added_playhead",
    nodeID: string
} | {
    type: "updated_playhead",
    index: number,
    playhead: PlayheadInfo
} | {
    type: "deleted_playhead",
    index: number,
}

const playtreeReducer = (state : PlaytreeEditorState, action : PlaytreeEditorAction) : PlaytreeEditorState => {
    const unsavedChangeOccurred = !["loaded_playtree", "saved_playtree"].includes(action.type)
    switch (action.type) {
        case "loaded_playtree": {
            return {
                playtree: action.playtree,
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "saved_playtree": {
            return {
                ...state,
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "added_playnode": {
            let maxValue = -1
            state.playtree.nodes.forEach((_, id) => {
                const x = parseInt(id)
                if (maxValue < x) {
                    maxValue = x
                }
            })
            const newPlaynode : PlayNode = {
                id: (maxValue + 1).toString(),
                name: "New Playnode",
                type: "sequence",
                content: [],
                next: []
            }
            const newPlaynodes = structuredClone(state.playtree.nodes)
            newPlaynodes.set(newPlaynode.id, newPlaynode)
            return {
                playtree: {
                    ...state.playtree,
                    nodes: newPlaynodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "updated_playnode": {
            const newNodes = structuredClone(state.playtree.nodes)
            let newPlaynode = newNodes.get(action.nodeID)
            if (newPlaynode) {
                newPlaynode = Object.assign(newPlaynode, action.patch)
                newNodes.set(action.nodeID, newPlaynode)
            }
            return {
                playtree: {
                    ...state.playtree,
                    nodes: newNodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "deleted_playnode": {
            const newNodes = structuredClone(state.playtree.nodes)
            newNodes.delete(action.nodeID)
            return {
                playtree: {
                    ...state.playtree,
                    nodes: newNodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "added_playedge": {
            const newNodes = structuredClone(state.playtree.nodes)
            const sourceNode = newNodes.get(action.sourceID)

            if (sourceNode) {
                sourceNode.next.push({
                    nodeID: action.targetID,
                    shares: 1,
                    repeat: -1,
                })
                return {
                    playtree: {
                        ...state.playtree,
                        nodes: newNodes
                    },
                    unsavedChangesExist: unsavedChangeOccurred,
                }
            }

            return state
        }
        case "updated_playedge": {
            const newNodes = structuredClone(state.playtree.nodes)
            const sourceNode = newNodes.get(action.sourceID)

            if (sourceNode) {
                const playedgeIndex = sourceNode.next.findIndex(playedge => playedge.nodeID === action.targetID)
                const playedge = sourceNode.next[playedgeIndex]
                if (playedgeIndex !== -1) {
                    sourceNode.next.splice(playedgeIndex, 1, Object.assign(playedge, action.patch))
                    return {
                        playtree: {
                            ...state.playtree,
                            nodes: newNodes
                        },
                        unsavedChangesExist: unsavedChangeOccurred
                    }
                }
            }
            return state
        }
        case "deleted_playedge": {
            const newNodes = structuredClone(state.playtree.nodes)
            const sourceNode = newNodes.get(action.sourceID)

            if (sourceNode) {
                const playedgeIndex = sourceNode.next.findIndex(playedge => playedge.nodeID === action.targetID)
                const playedge = sourceNode.next[playedgeIndex]
                if (playedgeIndex !== -1) {
                    sourceNode.next.splice(playedgeIndex, 1)
                    return {
                        playtree: {
                            ...state.playtree,
                            nodes: newNodes
                        },
                        unsavedChangesExist: unsavedChangeOccurred
                    }
                }
            }
            return state
        }
        case "added_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            const newPlayhead : PlayheadInfo = {
                name: "Playhead",
                nodeID: action.nodeID
            }
            newPlayroots.push(newPlayhead)
            return {
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "updated_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            newPlayroots[action.index] = action.playhead
            return {
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "deleted_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            newPlayroots.splice(action.index, 1)
            return {
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
    }
}

const PlayConnectionLine : ConnectionLineComponent = ({ fromX, fromY, toX, toY }) => {
    const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY })
    return (
        <g>
            <path
                fill="none"
                stroke="brown"
                strokeWidth={2}
                className="animated"
                d={path}
            >
            </path>
        </g>
    )
}

export default function PlaytreeEditor() {
    const customFlowNodeTypes = useMemo(() => ({ play: PlayNodeFlow }), []);
    const customFlowEdgeTypes = useMemo(() => ({ play: PlayEdgeFlow }), []);

    const initialPlaytree : Playtree | null = playtreeFromJson(useLoaderData())
    if (initialPlaytree === null) {
        return null
    }

    const [state, dispatch] = useReducer<typeof playtreeReducer>(playtreeReducer, {
        playtree: initialPlaytree,
        unsavedChangesExist: false
    })

    const handleDeletePlaynode = (nodeID: string) => {
        setFlownodes(prevFlownodes => {
            return prevFlownodes.filter(flownode => flownode.data.playnode.id !== nodeID)
        })

        setFlowedges(prevFlowedges => {
            return prevFlowedges.filter(flowedge => flowedge.source !== nodeID && flowedge.target !== nodeID)
        })

        dispatch({type: "deleted_playnode", nodeID})
        const playheadIndexToDelete = state.playtree.playroots.findIndex(playhead => playhead.nodeID === nodeID)
        if (playheadIndexToDelete !== -1) {
            dispatch({type: "deleted_playhead", index: playheadIndexToDelete})
        }
    }

    const initialFlownodes : PlayNodeFlow[] = Array.from(initialPlaytree.nodes.values()).map((playnode, index) => {
        const playhead = initialPlaytree.playroots.find(playhead => playhead.nodeID === playnode.id)
        return {
            key: playnode.id,
            type: "play",
            id: playnode.id,
            position: { x: 100 + 300 * (index % 3), y: 50 + Math.floor(index / 3) * 300 },
            zIndex: 100 - index,
            data: {
                label: playnode.id,
                playnode: playnode,
                playhead: playhead ? playhead : null,
                dispatch: (x : PlaytreeEditorAction) => dispatch(x),
                handleDeletePlaynode: handleDeletePlaynode
            }
        }
    })

    let initialFlowedges : PlayEdgeFlow[] = []

    const makePlayEdgeFlow = (playnode : PlayNode, playedge : PlayEdge) : PlayEdgeFlow => {
        return {
            id: playnode.id + "-" + playedge.nodeID,
            type: "play",
            source: playnode.id,
            target: playedge.nodeID,
            label: playedge.shares,
            markerEnd: {
                type: MarkerType.Arrow,
                color: "brown",
            },
            style: {
                stroke: "brown",
                strokeWidth: 2,
            },
            data: {
                playedge: playedge,
                dispatch: dispatch
            }
        }
    }

    initialPlaytree.nodes.forEach(playnode => {
        if (playnode.next) {
            playnode.next.forEach(playedge => {
                initialFlowedges.push(makePlayEdgeFlow(playnode, playedge))
            })
        }
    })

    const [flownodes, setFlownodes, onFlownodesChange] = useNodesState<PlayNodeFlow>(initialFlownodes)
    const [flowedges, setFlowedges, onFlowedgesChange] = useEdgesState<PlayEdgeFlow>(initialFlowedges)

    const onConnect : OnConnect = useCallback(connection => {
        const sourcePlaynode = state.playtree.nodes.get(connection.source)
        if (sourcePlaynode) {
            const playedge = { nodeID: connection.target, shares: 1, repeat: -1 }
            setFlowedges((eds) => addEdge(makePlayEdgeFlow(sourcePlaynode, playedge), eds))
            dispatch({type: "added_playedge", sourceID: connection.source, targetID: connection.target})
        }
    }, [state.playtree.nodes]);

    const handleAddPlaynode = useCallback(() => {
        let maxValue = -1
        state.playtree.nodes.forEach((_, id) => {
            const x = parseInt(id)
            if (maxValue < x) {
                maxValue = x
            }
        })

        const newID = (maxValue + 1).toString()

        const newFlownodes = [...flownodes]
        
        newFlownodes.push({
            id: newID,
            type: "play",
            position: { x: 0, y: 0},
            zIndex: 100 - maxValue,
            data: {
                playnode: {
                    id: newID,
                    name: "New Playnode",
                    type: "sequence",
                    content: [],
                    next: []
                },
                playhead: null,
                dispatch: (x : PlaytreeEditorAction) => dispatch(x),
                handleDeletePlaynode: handleDeletePlaynode
            }
        })
        setFlownodes(newFlownodes)
        dispatch({type: "added_playnode"})
    }, [flownodes])

    useEffect(() => {
    }, [state.playtree.nodes])

    const handleSave = useCallback(() => {
        (async () => {
            await fetch(`http://localhost:8080/playtrees/${state.playtree.summary.id}`, {
                method: "PUT",
                body: JSON.stringify(jsonFromPlaytree(state.playtree))
            })
        })()

        dispatch({type: "saved_playtree"})
    }, [state.playtree])

    const handleDragStart = useCallback((event : any) => {
        if (event && event.target) {
            event.dataTransfer.setData("text", event.target.id)
        }
    }, [])

    return (
        <div className="mt-8 flex font-lilitaOne h-[500px]">
            <div className="h-full w-5/6 m-auto">
                <h2 className="text-3xl text-green-600">{state.playtree.summary.name}</h2>
                <div className="h-full border-4 border-green-600 bg-neutral-100">
                    <button title="Add Playnode" className="absolute z-10 rounded-lg bg-green-400 mx-1 my-1 px-2 py-1" onClick={handleAddPlaynode}>➕</button>
                    <button id="playhead-spawner" title="Add Playhead" className="absolute z-10 rounded-lg bg-purple-300 mx-1 my-10 px-2 py-1" draggable={true} onDragStart={handleDragStart}>💽</button>
                    {
                        state.unsavedChangesExist ?
                            <button type="button" title="Save Changes" className="absolute z-10 rounded-lg bg-neutral-400 mx-1 my-[4.75rem] px-2 py-1" onClick={handleSave}>💾</button> :
                        null
                    }
                    <ReactFlow
                        nodeTypes={customFlowNodeTypes}
                        nodes={flownodes}
                        onNodesChange={onFlownodesChange}
                        edgeTypes={customFlowEdgeTypes}
                        edges={flowedges}
                        onEdgesChange={onFlowedgesChange}
                        connectionLineComponent={PlayConnectionLine}
                        onConnect={onConnect}
                        elevateNodesOnSelect>
                        <Background />
                        <Controls />
                    </ReactFlow>
                </div>
            </div>
        </div>
    )
}
