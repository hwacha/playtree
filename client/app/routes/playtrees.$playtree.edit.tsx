import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, Node, NodeProps, EdgeProps, getBezierPath, Edge, BaseEdge, useEdgesState, useNodesState } from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import invariant from "tiny-invariant";
import SearchField from "~/components/SearchField";

export const loader = async ({params} : LoaderFunctionArgs) => {
    invariant(params.playtree)
    const response = await fetch(`http://localhost:8080/playtrees/${params.playtree}`)
    return await response.json()
}

type PlayheadProps = {
    name: string;
}

function Playhead(props : PlayheadProps) {
    const [name, setName] = useState(props.name)
    const onNameChange = useCallback((evt : React.ChangeEvent<HTMLInputElement>) => {
        setName(evt.target.value)
    }, [name])

    const drag = (event : any) => {
        if (event && event.target) {
            event.dataTransfer.setData("text", event.target.id)
        }
        
    }

    return (
        <div id={name} draggable={true} onDragStart={drag} className="flex m-1 absolute">
            <div className="mr-2 bg-amber-300 px-2 py-1 rounded-md">💽</div><input value={name} onChange={onNameChange}/>
        </div>
    )
}

export type PlayNodeFlow = Node<{
    playnode: PlayNode;
    playheads: PlayheadInfo[];
    reportChangeOccurrence: (playnode: PlayNode) => void;
    onPlayheadDrop: () => void;
}, 'play'>;

function PlayNode(props : NodeProps<PlayNodeFlow>) {
    const [playnodeType, setPlaynodeType] = useState<"sequence"|"selector">(props.data.playnode.type)
    const [playnodeName, setPlaynodeName] = useState<string>(props.data.playnode.name)
    const [expanded, setExpanded] = useState<boolean>(false)
    const [contentList, setContentList] = useState<Content[]>(props.data.playnode.content)
    const [adding, setAdding] = useState<boolean>(false)
    const [playheads, setPlayheads] = useState<PlayheadInfo[]>(props.data.playheads)

    const getPlaynode = useCallback(() => {
        return {
            id: props.data.playnode.id,
            type: playnodeType,
            name: playnodeName,
            content: contentList,
            next: props.data.playnode.next,
        }
    }, [playnodeType, playnodeName, contentList])

    const isFirstRender = useRef(true);
    const isSecondRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        if (isSecondRender.current) {
            isSecondRender.current = false
            return
        }
        props.data.reportChangeOccurrence(getPlaynode())
    }, [playnodeType, playnodeName, contentList])
    
    const handleChange = useCallback((evt : any) => {
        setPlaynodeName(evt.target.value)
    }, []);

    const handleExpandOrCollapse = useCallback(() => {
        setExpanded(!expanded)
    }, [expanded])

    const handleTogglePlaynodeType = useCallback(() => {
        if (playnodeType === "sequence") {
            setPlaynodeType("selector")
        } else {
            setPlaynodeType("sequence")
        }
    }, [playnodeType])

    const onMoveUp = ((index : number) => (_ : any) => {
        if (index <= 0) {
            return
        }
        const newContentList = structuredClone(contentList)
        newContentList[index - 1] = contentList[index]
        newContentList[index] = contentList[index - 1]
        setContentList(newContentList)
    })

    const onMoveDown = ((index : number) => (_ : any) => {
        if (index + 1 >= contentList.length) {
            return
        }
        const newContentList = structuredClone(contentList)
        newContentList[index + 1] = contentList[index]
        newContentList[index] = contentList[index + 1]
        setContentList(newContentList)
    })

    const onDelete = ((index : number) => (_ : any) => {
        const newContentList = structuredClone(contentList)
        newContentList.splice(index, 1)
        setContentList(newContentList)
    })

    const onAddBegin = useCallback((_ : any) => {
        setAdding(true)
    }, [])

    const onContentSelect = (newContent: string) : boolean => {
        const newContentList = structuredClone(contentList)
        newContentList.push({type: "spotify-track", uri: newContent})
        setContentList(newContentList)
        setAdding(false)
        return true
    }

    const isSequence = playnodeType === "sequence"
    const color = isSequence ? "green" : "red"

    const drop = (event : any) => {
        event.preventDefault();
        var data = event.dataTransfer.getData("text");

        const newPlayheads = structuredClone(playheads)
        newPlayheads.push({
            name: data,
            nodeID: props.data.playnode.id
        })
        setPlayheads(newPlayheads)
    }

    return (
        <>
            <div>
                {
                    playheads.map((playhead, index) => {
                        return <Playhead key={index} name={playhead.name}/>
                    })
                }
            </div>
            <Handle type="target" position={Position.Top} />
            {
                expanded ?
                <div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-48 p-4 nodrag text-${color}-600`} onDrop={drop} onDragOver={e => e.preventDefault()}>
                    <button className="absolute -mx-3 -my-4" onClick={handleExpandOrCollapse} title="Collapse">↖️</button>
                    {
                        <button className={`bg-${color}-300 rounded-lg absolute -my-4 px-2 py-1`}
                                style={{marginLeft: 136}}
                                onClick={handleTogglePlaynodeType}
                                title={playnodeType}
                        >
                            {isSequence ? <>🔢</> : <>🎲</> }
                        </button>
                    }
                    
                    <input id="text" name="text" value={playnodeName} onChange={handleChange} className={`nodrag w-full bg-${color}-100 text-center`} />
                    <ul className="my-3">
                        {
                            contentList.map((content: Content, index : number) => {
                                return (
                                    <li key={index} className={`border border-${color}-600 bg-${color}-200 flex`}>
                                        {index > 0 ? <button className="w-fit ml-1" title="Move Content Up In List" onClick={onMoveUp(index)}>⬆️</button> : <div className="ml-5"/>}
                                        {index + 1 < contentList.length ? <button className="w-fit ml-1" title="Move Content Down In List" onClick={onMoveDown(index)}>⬇️</button> : <div className="ml-5"/>}
                                        <span className="w-full ml-3">{content.uri}</span>
                                        <button className="w-fit mr-1" title="Delete Content" onClick={onDelete(index)}>❌</button>
                                    </li>
                                )
                            })
                        }
                    </ul>
                    {
                        adding ?
                        <SearchField onContentSelect={onContentSelect} /> :
                        <div className="flex"><button title="Add Content" className={`border-${color}-600 bg-${color}-400 border-2 rounded-full px-2 py-1 m-auto`} onClick={onAddBegin}>➕</button></div>
                    }
                </div> :
                <div className={`border-${color}-600 bg-${color}-100 text-${color}-600 border-4 rounded-xl w-48 h-16 py-4 text-center`} onClick={handleExpandOrCollapse} onDrop={drop} onDragOver={e => e.preventDefault()}>{playnodeName}</div>
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
},
'play'>;

function PlayEdge(props: EdgeProps<PlayEdgeFlow>) {
    const [edgePath] = getBezierPath({sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY});
    return <BaseEdge id={props.id} path={edgePath} />;
}

export default function PlaytreeEditor() {
    const customFlowNodeTypes = useMemo(() => ({ play: PlayNode }), []);
    const customFlowEdgeTypes = useMemo(() => ({ play: PlayEdge }), []);
    
    const playtree : Playtree = useLoaderData()
    const [unsavedChangesExist, setUnsavedChangesExist] = useState<boolean>(false)
    const [playnodes, setPlaynodes] = useState<Map<string, PlayNode>>(new Map<string, PlayNode>())
    const [playheads, setPlayheads] = useState<PlayheadInfo[]>([])

    const handleChangeReported = useCallback((playnode : PlayNode) => {
        const newPlaynodes = structuredClone(playnodes)
        newPlaynodes.set(playnode.id, playnode)
        setPlaynodes(newPlaynodes)

        setUnsavedChangesExist(true)
    }, [playnodes])
    
    let initialFlownodes : Node[] = []
    let initialFlowedges : Edge[] = []
    if (playtree) {
        initialFlownodes = playtree.nodes.map((playnode, index) => {
            return {
                type: "play",
                id: playnode.id,
                position: { x: 100 + 300 * (index % 3), y: 50 + Math.floor(index / 3) * 300 },
                zIndex: 100 - index,
                data: {
                    label: playnode.id,
                    playnode: playnode,
                    playheads: playtree.playroots.filter((playhead => playhead.nodeID === playnode.id)),
                    reportChangeOccurrence: handleChangeReported,
                }
            }
        })

        if (playtree.nodes) {
            playtree.nodes.forEach(playnode => {
                if (playnode.next) {
                    playnode.next.forEach(playedge => {
                        initialFlowedges.push({
                            id: playnode.id + "-" + playedge.nodeID,
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
                                playedge: playedge
                            }
                        })
                    })
                }
            })
        }
    }

    const [flownodes, setFlowNodes] = useState(initialFlownodes)
    const [flowedges, setFlowEdges] = useState(initialFlowedges)

    const handleAddFlownode = useCallback(() => {
        const newPlaynode : PlayNode = {
            id: flownodes.length.toString(),
            name: "New Playnode",
            type: "sequence",
            content: [],
            next: []
        }

        const newFlownode = {
            type: "play",
            id: newPlaynode.id,
            position: { x: 100 + 300 * (flownodes.length % 3), y: 50 + Math.floor(flownodes.length / 3) * 300 },
            zIndex: 100 - flownodes.length,
            data: {
                label: newPlaynode.name,
                playnode: newPlaynode,
                playheads: playtree.playroots.filter((playhead => playhead.nodeID === newPlaynode.id)),
                reportChangeOccurrence: handleChangeReported,
            }
        }

        const newFlownodes = JSON.parse(JSON.stringify(flownodes))
        newFlownodes.push(newFlownode)

        setFlowNodes(newFlownodes)
        handleChangeReported(newPlaynode)
    }, [flownodes])

    const handleSave = useCallback(() => {
        const newPlaytree : Playtree = {
            summary: playtree.summary,
            nodes: Array.from(playnodes, ([_, pn]) => pn),
            playroots: playtree.playroots
        };

        (async () => {
            const response = await fetch(`http://localhost:8080/playtrees/${playtree.summary.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(newPlaytree)
            })
        })()

        setUnsavedChangesExist(false)
    }, [playnodes])

    const handleSpawnPlayhead = () => {
        const newPlayheads = structuredClone(playheads)
        newPlayheads.push({
            name: "Playhead " + (playheads.length + 1).toString(),
            nodeID: "",
        })

        setPlayheads(newPlayheads)
    }

    return (
        <div className="mt-8 flex font-lilitaOne h-[500px]">
            <div className="h-full w-5/6 m-auto">
                <h2 className="text-3xl text-green-600">{playtree.summary.name}</h2>
                <div className="h-full border-4 border-green-600 bg-neutral-100">
                    {
                        playheads.filter(playhead => playhead.nodeID === "").map((playhead, index) => {
                            return <Playhead key={index} name={playhead.name}/>
                        })
                    }
                    <button title="Add Playnode" className="absolute z-10 rounded-lg bg-green-400 mx-1 my-1 px-2 py-1" onClick={handleAddFlownode}>➕</button>
                    <button id="playhead-spawner" title="Add Playhead" className="absolute z-10 rounded-lg bg-amber-300 mx-1 my-10 px-2 py-1" onClick={handleSpawnPlayhead}>💽</button>
                    {
                        unsavedChangesExist ?
                            <button type="button" title="Save Changes" className="absolute z-10 rounded-lg bg-neutral-400 mx-1 my-[4.75rem] px-2 py-1" onClick={handleSave}>💾</button> :
                        null
                    }
                    <ReactFlow nodeTypes={customFlowNodeTypes} nodes={flownodes} edges={initialFlowedges} elevateNodesOnSelect>
                        <Background />
                        <Controls />
                    </ReactFlow>
                </div>
            </div>
        </div>
    )
}
