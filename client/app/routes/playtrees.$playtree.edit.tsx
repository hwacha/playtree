import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, Node, NodeProps, EdgeProps, getBezierPath, Edge, BaseEdge } from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import invariant from "tiny-invariant";
import SearchField from "~/components/SearchField";

export const loader = async ({params} : LoaderFunctionArgs) => {
    invariant(params.playtree)
    const response = await fetch(`http://localhost:8080/playtrees/${params.playtree}`)
    return await response.json()
}

export type PlayNodeFlow = Node<{
    playnode: PlayNode;
    reportChangeOccurrence: () => void;
}, 'play'>;

function PlayNode(props : NodeProps<PlayNodeFlow>) {
    const [playnodeType, setPlaynodeType] = useState<"sequence"|"selector">(props.data.playnode.type)
    const [playnodeName, setPlaynodeName] = useState<string>(props.id)
    const [expanded, setExpanded] = useState<boolean>(false)
    const [contentList, setContentList] = useState<Content[]>(props.data.playnode.content)
    const [adding, setAdding] = useState<boolean>(false)

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
        props.data.reportChangeOccurrence()
    }, [playnodeType, playnodeName, contentList])
    
    const onChange = useCallback((evt : any) => {
        setPlaynodeName(evt.target.value)
    }, []);

    const onExpandOrCollapse = useCallback(() => {
        setExpanded(!expanded)
    }, [expanded])

    const onTogglePlaynodeType = useCallback(() => {
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

    return (
        <>
            <Handle type="target" position={Position.Top} />
            {
                expanded ?
                <div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-48 p-4 nodrag`}>
                    <button className="absolute -mx-3 -my-4" onClick={onExpandOrCollapse} title="Collapse">↖️</button>
                    {
                        <button className={`bg-${color}-300 rounded-lg absolute -my-4 px-2 py-1`}
                                style={{marginLeft: 136}}
                                onClick={onTogglePlaynodeType}
                                title={playnodeType}
                        >
                            {isSequence ? <>🔢</> : <>🎲</> }
                        </button>
                    }
                    
                    <input id="text" name="text" value={playnodeName} onChange={onChange} className={`nodrag w-full bg-${color}-100 text-center`} />
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
                <div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-48 h-16 py-4 text-center`} onClick={onExpandOrCollapse}>{playnodeName}</div>
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

    const onChangeReported = useCallback(() => {
        setUnsavedChangesExist(true)
    }, [])
    
    let flownodes : any[] = []
    let flowedges : any[] = []
    if (playtree) {
        flownodes = playtree.nodes.map((playnode, index) => {
            return {
                type: "play",
                id: playnode.id,
                position: { x: 100 + 300 * (index % 3), y: 50 + Math.floor(index / 3) * 300 },
                zIndex: 100 - index,
                data: {
                    label: playnode.id,
                    playnode: playnode,
                    reportChangeOccurrence: onChangeReported,
                }
            }
        })

        if (playtree.nodes) {
            playtree.nodes.forEach(playnode => {
                if (playnode.next) {
                    playnode.next.forEach(playedge => {
                        flowedges.push({
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

    return (
        <div className="flex mt-8" style={{height: 500}}>
            <div className="w-5/6 h-full m-auto border-4 border-green-600 bg-neutral-100">
                {unsavedChangesExist ? <button title="Save Changes" className="absolute z-10 rounded-lg bg-neutral-400 px-2 py-1">💾</button> : null}
                <ReactFlow nodeTypes={customFlowNodeTypes} nodes={flownodes} edges={flowedges} elevateNodesOnSelect>
                    <Background />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    )
}