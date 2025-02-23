import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, Node, NodeProps, EdgeProps, getBezierPath, Edge, BaseEdge, BezierEdge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, addEdge, OnConnect, useNodesState, useEdgesState, ConnectionLineComponent, useConnection, EdgeLabelRenderer, OnSelectionChangeFunc } from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import invariant from "tiny-invariant";
import SearchField from "~/components/SearchField";
import { Content, jsonFromPlaytree, PlayEdge, PlayheadInfo, PlayNode, Playtree, playtreeFromJson } from "../types";
import React from "react";
import Dagre from '@dagrejs/dagre';

export const loader = async ({params} : LoaderFunctionArgs) => {
    invariant(params.playtree)
    const response = await fetch(`http://localhost:8080/playtrees/${params.playtree}`)
    return await response.json()
}

type PlayheadProps = {
    name: string;
    nodeID: string;
    dispatch: (action: PlaytreeEditorAction) => void;
    onDeletePlayhead: () => void
}

function PlayheadComponent(props : PlayheadProps) {
    const [name, setName] = useState(props.name)
    const onNameChange = useCallback((evt : React.ChangeEvent<HTMLInputElement>) => {
        setName(evt.target.value)
        props.dispatch({
            type: "updated_playhead",
            nodeID: props.nodeID,
            patch: {
                name: evt.target.value,
            }
        })
    }, [name])

    const handleDeleteSelf = () => {
        props.dispatch({
            type: "deleted_playhead",
            nodeID: props.nodeID
        })
        props.onDeletePlayhead()
    }

    return (
        <div id={name} className="group flex absolute -top-9 left-40 w-32">
            <button onClick={handleDeleteSelf} className="bg-red-200 px-1 py-[2px] rounded-full text-xs absolute -top-3 -left-2 hidden group-hover:block">🗑️</button>
            <div className="mr-2 bg-purple-300 px-2 py-1 rounded-md">💽</div>
            <input value={name} onChange={onNameChange} className="bg-transparent w-full"/>
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
    const [adding, setAdding] = useState<boolean>(false)

    const [playnodeName, setPlaynodeName] = useState<string>(props.data.playnode.name)
    const [playnodeType, setPlaynodeType] = useState<PlayNode["type"]>(props.data.playnode.type)
    const [contentList, setContentList] = useState<Content[]>(props.data.playnode.content)

    const [playhead, setPlayhead] = useState<PlayheadInfo | null>(props.data.playhead)

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

    const handleSearchFocusOut = useCallback((event: FocusEvent) => {
        setAdding(false)
    }, [])

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

    const handleDeletePlayhead = useCallback(() => {
        setPlayhead(null)
    }, [playhead])

    const handleDeleteSelf = useCallback(() => {
        props.data.handleDeletePlaynode(props.data.playnode.id)
    }, [])

    const isSequence = playnodeType === "sequence"
    const color = isSequence ? "green" : "amber"

    const handleDrop = (event : any) => {
        event.preventDefault();
        var index : number = Number.parseInt(event.dataTransfer.getData("index"));
        setPlayhead({name: "Playhead", index: index})
        props.data.dispatch({type:"added_playhead", nodeID: props.data.playnode.id})
    }

    return (
        <React.Fragment key={props.id}>
            <div>{ playhead ? <PlayheadComponent name={playhead.name} nodeID={props.id} dispatch={(x) => props.data.dispatch(x)} onDeletePlayhead={handleDeletePlayhead}/> : null }</div>
            <Handle type="target" isConnectableStart={false} position={Position.Top} style={{width: 12, height: 12}} />
            {
                props.selected ?
                <div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-48 p-4 text-${color}-600`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
                    <div className="mb-5">
                        <button className={`bg-${color}-300 rounded-lg px-2 py-1 absolute top-1 left-1`} onClick={handleTogglePlaynodeType} title={playnodeType}>{isSequence ? <>🔢</> : <>🎲</> }</button>
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
                            <SearchField onContentSelect={handleContentSelect} onFocusOut={handleSearchFocusOut} /> :
                            <div className="flex"><button title="Add Content" className={`border-${color}-600 bg-${color}-400 border-2 rounded-full px-2 py-1 m-auto`} onClick={handleAddBegin}>➕</button></div>
                        }
                </div> :
                <div className={`border-${color}-600 bg-${color}-100 text-${color}-600 border-4 rounded-xl w-48 h-16 py-4 text-center`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>{playnodeName}</div>
            }
            <Handle type="source" position={Position.Bottom} id="a" style={{width: 12, height: 12}}/>
        </React.Fragment>
    )
}

type PlayEdgeFlow = Edge<{
    playedge: PlayEdge;
    dispatch: (action: PlaytreeEditorAction) => void;
    onDeletePlayedge: (id: string, sourceID: string, targetID: string) => void;
}, 'play'>;

function PlayEdgeFlow(props: EdgeProps<PlayEdgeFlow>) {
    if (!props.data) {
        return null
    }

    const initialShares = props.data.playedge.shares ? props.data.playedge.shares : 1
    const initialRepeat = props.data.playedge.repeat ? props.data.playedge.repeat : -1 

    const [sharesInputText, setSharesInputText] = useState<string>(initialShares.toString())
    const [repeatInputText, setRepeatInputText] = useState<string>(initialRepeat.toString())

    const handleSharesChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const inputAsNumber = Number(event.target.value)
        if (event.target.value == "" || (Number.isInteger(inputAsNumber) && inputAsNumber >= 0)) {
            setSharesInputText(event.target.value)
            if (props.data) {
                props.data.dispatch({type: "updated_playedge", sourceID: props.source, targetID: props.target, patch: {
                    shares: event.target.value === "" ? 1 : inputAsNumber
                }})
            }
        }
    }, [sharesInputText])

    const handleRepeatChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        let inputAsNumber = Number(event.target.value)
        if (event.target.value === "" || event.target.value === "-" || (Number.isInteger(inputAsNumber) && inputAsNumber >= -1)) {
            setRepeatInputText(event.target.value)
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
    }, [repeatInputText])

    const handleDeleteSelf = useCallback(() => {
        if (props.data) {
            props.data.onDeletePlayedge(props.id, props.source, props.target)
        }
    }, [])

    const { sourceX, sourceY, targetX, targetY, markerEnd } = props;
    let [edgePath, labelX, labelY] = getBezierPath(props)
    

    if (sourceY > targetY) {
        const distance = sourceY - targetY
        const logDistance = Math.log(distance)
        const scaledLogDistance = 40 * logDistance
        
        const dx = sourceX - targetX
        const nodeWidth = 500
        const underAndLeft  = dx <= 0 && dx > -nodeWidth
        const underAndRight = dx  > 0 && dx <  nodeWidth

        if (underAndLeft || underAndRight) {
            const p0 = {x: sourceX, y: sourceY}
            const p1 = {x: underAndRight ? sourceX - scaledLogDistance : sourceX + scaledLogDistance, y: sourceY + scaledLogDistance}
            const p2 = {x: underAndRight ? targetX - scaledLogDistance : targetX + scaledLogDistance, y: targetY - scaledLogDistance}
            const p3 = {x: targetX, y: targetY}

            edgePath = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`
            
            const t = (0.25)
            const oneMinusT = 1 - t
            const p0coeff = oneMinusT * oneMinusT * oneMinusT
            const p1coeff = 3 * oneMinusT * oneMinusT * t
            const p2coeff = 3 * oneMinusT * t * t
            const p3coeff = t * t * t
            labelX = p0coeff * p0.x + p1coeff * p1.x + p2coeff * p2.x + p3coeff * p3.x
            labelY = p0coeff * p0.y + p1coeff * p1.y + p2coeff * p2.y + p3coeff * p3.y
        }
    }

    return (
        <React.Fragment key={props.id}>
            <style>{
                `.animate {
                    stroke-dasharray: 10;
                    animation: dash 0.5s linear;
                    animation-iteration-count: infinite;
                }

                @keyframes dash {
                    to {
                        stroke-dashoffset: -20;
                    }
                }`
            }
            </style>
            <BaseEdge path={edgePath} className={props.selected ? "animate" : ""} style={props.style} markerEnd={markerEnd} />
            <EdgeLabelRenderer> {
                props.selected ?
                    <div className="group bg-neutral-200 rounded-xl p-2 font-markazi" style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                            zIndex: 101
                        }}>
                        <div className="w-full h-fit flex content-evenly">
                            {/* <div className="w-full">{`${props.source}=>${props.target}`}</div> */}
                            <div className="w-full"><button className="absolute -left-1 -top-1 hidden bg-red-300 text-xs rounded-full px-1 pt-1 group-hover:block" onClick={handleDeleteSelf}>🗑️</button></div>
                        </div>
                        <hr></hr>
                        <div className="w-24 flex">
                            <div className="w-full h-fit">Shares</div>
                            <div className="w-fit">|</div>
                            <input value={sharesInputText} className="bg-neutral-200 w-full text-right" onChange={handleSharesChange} />
                        </div>
                        <div className="w-24 flex">
                            <div className="w-full h-fit">Repeat</div>
                            <div className="w-fit">|</div>
                            <input value={repeatInputText} className="bg-neutral-200 w-full text-right" onChange={handleRepeatChange} />
                        </div>
                    </div> :
                    <div className="bg-neutral-200 rounded-md px-1 font-markazi" style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all'
                    }}>S={sharesInputText}, R={repeatInputText}</div>
            }
            </EdgeLabelRenderer>
        </React.Fragment>
    )
}

type LogMessage = {
    type: "error"|"warning"|"success";
    message: string;
}

type PlaytreeEditorState = {
    playtree: Playtree,
    unsavedChangesExist: boolean,
    messageLog: LogMessage[],
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
    nodeID: string,
    patch: Partial<Omit<PlayheadInfo, 'nodeID'>>
} | {
    type: "deleted_playhead",
    nodeID: string,
} | {
    type: "logged_message",
    message: LogMessage,
}

const playtreeReducer = (state : PlaytreeEditorState, action : PlaytreeEditorAction) : PlaytreeEditorState => {
    const unsavedChangeOccurred = !["loaded_playtree", "saved_playtree"].includes(action.type)
    switch (action.type) {
        case "loaded_playtree": {
            return {
                ...state,
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
                ...state,
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
                ...state,
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
                ...state,
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
                if (!sourceNode.next) {
                    sourceNode.next = []
                }
                sourceNode.next.push({
                    nodeID: action.targetID,
                    shares: 1,
                    repeat: -1,
                })
                return {
                    ...state,
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

            if (sourceNode && sourceNode.next) {
                const playedgeIndex = sourceNode.next.findIndex(playedge => playedge.nodeID === action.targetID)
                const playedge = sourceNode.next[playedgeIndex]
                if (playedgeIndex !== -1) {
                    sourceNode.next.splice(playedgeIndex, 1, Object.assign(playedge, action.patch))
                    return {
                        ...state,
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

            if (sourceNode && sourceNode.next) {
                const playedgeIndex = sourceNode.next.findIndex(playedge => playedge.nodeID === action.targetID)
                if (playedgeIndex !== -1) {
                    sourceNode.next.splice(playedgeIndex, 1)
                    return {
                        ...state,
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
                index: state.playtree.playroots.size,
                name: "Playhead",
            }
            newPlayroots.set(action.nodeID, newPlayhead)
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "updated_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            const playroot = newPlayroots.get(action.nodeID)
            if (playroot) {
                const newPlayroot = Object.assign(playroot, action.patch)
                newPlayroots.set(action.nodeID, newPlayroot)
            }
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "deleted_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            newPlayroots.delete(action.nodeID)
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "logged_message": {
            const newMessageLog = [...state.messageLog]
            newMessageLog.push(action.message)
            return {
                ...state,
                messageLog: newMessageLog
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
        unsavedChangesExist: false,
        messageLog: []
    })

    const handleDeletePlaynode = (nodeID: string) => {
        setFlownodes(prevFlownodes => {
            return prevFlownodes.filter(flownode => flownode.data.playnode.id !== nodeID)
        })

        setFlowedges(prevFlowedges => {
            return prevFlowedges.filter(flowedge => flowedge.source !== nodeID && flowedge.target !== nodeID)
        })

        dispatch({type: "deleted_playnode", nodeID: nodeID})
        dispatch({type: "deleted_playhead", nodeID: nodeID})
    }

    const handleDeletePlayedge = (edgeID: string, sourceID: string, targetID: string) => {
        setFlowedges(prevFlowedges => {
            return prevFlowedges.filter(flowedge => flowedge.id !== edgeID)
        })
        dispatch({type: "deleted_playedge", sourceID: sourceID, targetID: targetID})
    }

    const initialFlownodes : PlayNodeFlow[] = Array.from(initialPlaytree.nodes.values()).map((playnode, index) => {
        return {
            key: playnode.id,
            type: "play",
            id: playnode.id,
            label: playnode.name,
            position: { x: 100 + 300 * (index % 3), y: 50 + Math.floor(index / 3) * 300 },
            zIndex: 100 - index,
            data: {
                label: playnode.id,
                playnode: playnode,
                playhead: initialPlaytree.playroots.get(playnode.id) ?? null,
                dispatch: (x : PlaytreeEditorAction) => dispatch(x),
                handleDeletePlaynode: handleDeletePlaynode
            }
        }
    })

    let initialFlowedges : PlayEdgeFlow[] = []

    const makePlayedgeFlow = (playnode : PlayNode, playedge : PlayEdge) : PlayEdgeFlow => {
        return {
            id: playnode.id + "-" + playedge.nodeID,
            type: "play",
            label: playnode.id + "-" + playedge.nodeID,
            source: playnode.id,
            target: playedge.nodeID,
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
                dispatch: dispatch,
                onDeletePlayedge: handleDeletePlayedge
            }
        }
    }

    initialPlaytree.nodes.forEach(playnode => {
        if (playnode.next) {
            playnode.next.forEach(playedge => {
                initialFlowedges.push(makePlayedgeFlow(playnode, playedge))
            })
        }
    })

    const [flownodes, setFlownodes, onFlownodesChange] = useNodesState<PlayNodeFlow>(initialFlownodes)
    const [flowedges, setFlowedges, onFlowedgesChange] = useEdgesState<PlayEdgeFlow>(initialFlowedges)

    useEffect(() => {
        const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        g.setGraph({ rankdir: "TB", align: undefined, acyclicer: "greedy", ranker: "network-simplex"})
        flowedges.filter(edge => !state.playtree.playroots.has(edge.target)).forEach((edge) => g.setEdge(edge.source, edge.target));
        flownodes.forEach((node) =>
            g.setNode(node.id, {
              ...node,
              width: node.measured?.width ?? 250,
              height: node.measured?.height ?? 175,
            }),
        );
    
        Dagre.layout(g);
        setFlownodes(flownodes.map((node) => {
            const position = g.node(node.id);
            // We are shifting the dagre node position (anchor=center center) to the top left
            // so it matches the React Flow node anchor point (top left).
            const x = position.x - (node.measured?.width ?? 0) / 2;
            const y = position.y - (node.measured?.height ?? 0) / 2;
       
            return { ...node, position: { x, y } };
          })
        )
        setFlowedges([...flowedges])
    }, [])

    const onConnect : OnConnect = useCallback(connection => {
        const sourcePlaynode = state.playtree.nodes.get(connection.source)
        if (sourcePlaynode) {
            const playedge = { nodeID: connection.target, shares: 1, repeat: -1 }
            setFlowedges((eds) => addEdge(makePlayedgeFlow(sourcePlaynode, playedge), eds))
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

    const generateWarnings = useCallback(() => {
        if (state.playtree.playroots.size == 0) {
            dispatch({type: "logged_message", message: {type: "warning", message: "Saved playtree has no playroots. You won't be able to play any music until you attach a playhead."}})
            return true
        }
        return false
    }, [state.playtree.playroots])

    const handleSave = useCallback(() => {
        const warningsGenerated = generateWarnings();
        (async () => {
            const response = await fetch(`http://localhost:8080/playtrees/${state.playtree.summary.id}`, {
                method: "PUT",
                body: JSON.stringify(jsonFromPlaytree(state.playtree))
            })
            if (response.ok) {
                dispatch({type: "saved_playtree"})
                dispatch({type: "logged_message", message: {type: "success", message: "Playtree saved successfully."}})
            } else {
                const errorMessage = await response.text()
                dispatch({type: "logged_message", message: {type: "error", message: errorMessage }})
            }
        })()

        
    }, [state.playtree])

    const handleDragStart = useCallback((event : any) => {
        if (event && event.target) {
            event.dataTransfer.setData("index", state.playtree.playroots.size)
        }
    }, [])

    return (
        <div className="font-lilitaOne w-5/6 m-auto h-[calc(100vh-15.25rem)]">
            <h2 className="w-full text-3xl text-green-600 mt-12">{state.playtree.summary.name}</h2>
            <div className="h-[calc(100%-8rem)] flex">
                <div className="h-full w-full flex-[4] border-4 border-green-600 bg-neutral-100">
                    <button title="Add Playnode" className="z-10 absolute rounded-lg bg-green-400 mx-1 my-1 px-2 py-1" onClick={handleAddPlaynode}>➕</button>
                    <button id="playhead-spawner" title="Add Playhead" className="z-10 absolute rounded-lg bg-purple-300 mx-1 my-10 px-2 py-1" draggable={true} onDragStart={handleDragStart}>💽</button>
                    {
                        state.unsavedChangesExist ?
                            <button type="button" title="Save Changes" className="z-10 absolute rounded-lg bg-neutral-400 mx-1 my-[4.75rem] px-2 py-1" onClick={handleSave}>💾</button> :
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
                        >
                        <Background />
                        <Controls />
                    </ReactFlow>
                </div>
                <div className="border-green-600 bg-neutral-50 border-r-4 border-t-4 border-b-4 w-full flex-[1] h-full overflow-y-auto flex flex-col-reverse">
                    <ul className="font-markazi">
                        {
                            state.messageLog.map((message, index) => {
                                const color = message.type === "error" ? "red" : message.type === "warning" ? "amber" : "green";
                                const emoji = message.type === "error" ? <>🛑</> : message.type === "warning" ? <>⚠️</> : <>✅</>;
                                return <li key={index} className={`bg-${color}-200 text-${color}-500 pl-2 pt-1`}>{emoji} {` `} {message.message}</li>
                            })
                        }
                    </ul>
                </div>
            </div>
        </div>
    )
}
