import { BaseEdge, Edge, EdgeLabelRenderer, EdgeProps, getBezierPath, useKeyPress } from "@xyflow/react";
import React, { useEffect } from "react";
import NaturalNumberInputField from "./NaturalNumberInputField";
import { Playedge } from "../types";
import { PlaytreeEditorAction } from "../reducers/editor";

export type PlayedgeFlowData = Edge<{
    playedge: Playedge;
    dispatch: (action: PlaytreeEditorAction) => void;
}, 'play'>;

export default function PlayedgeComponent(props: EdgeProps<PlayedgeFlowData>) {
    if (!props.data) {
        return null
    }

    const deleteKeyPressed = useKeyPress(['Backspace', 'Delete'])
    useEffect(() => {
        if (props.selected && deleteKeyPressed) {
            props.data?.dispatch({type: "deleted_playedge", sourceID: props.source, targetID: props.target})
        }
    }, [deleteKeyPressed])

    const { sourceX, sourceY, targetX, targetY, markerEnd } = props;
    let [edgePath, labelX, labelY] = getBezierPath(props)

    if (sourceY > targetY) {
        const distance = sourceY - targetY
        const logDistance = Math.log(distance)
        const scaledLogDistance = 40 * logDistance

        const dx = sourceX - targetX
        const nodeWidth = 500
        const underAndLeft = dx < 0 && dx > -nodeWidth
        const underAndRight = dx >= 0 && dx < nodeWidth

        if (underAndLeft || underAndRight) {
            const p0 = { x: sourceX, y: sourceY }
            const p1 = { x: underAndRight ? sourceX - scaledLogDistance : sourceX + scaledLogDistance, y: sourceY + scaledLogDistance }
            const p2 = { x: underAndRight ? targetX - scaledLogDistance : targetX + scaledLogDistance, y: targetY - scaledLogDistance }
            const p3 = { x: targetX, y: targetY }

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
                            <div className="w-full">
                                <button
                                    className="absolute -left-1 -top-1 hidden bg-red-300 text-xs rounded-full px-1 pt-1 group-hover:block"
                                    onClick={() => props.data?.dispatch({type: "deleted_playedge", sourceID: props.source, targetID: props.target})}
                                >🗑️</button></div>
                        </div>
                        <hr></hr>
                        <div className="w-24 flex">
                            <div className="w-full h-fit">Priority</div>
                            <div className="w-fit">|</div>
                            <NaturalNumberInputField onChange={n =>
                                props.data?.dispatch({type: "updated_playedge", sourceID: props.source, targetID: props.target, patch: {priority: n} })
                            } canBeInfinite={false} defaultValue={0} value={props.data.playedge.priority} />
                        </div>
                        <div className="w-24 flex">
                            <div className="w-full h-fit">Shares</div>
                            <div className="w-fit">|</div>
                            <NaturalNumberInputField onChange={n => {
                                props.data?.dispatch({ type: "updated_playedge", sourceID: props.source, targetID: props.target, patch: {shares: n}})
                            }} canBeInfinite={false} defaultValue={1} value={props.data.playedge.shares} />
                        </div>
                        <div className="w-24 flex">
                            <div className="w-full h-fit">Limit</div>
                            <div className="w-fit">|</div>
                            <NaturalNumberInputField onChange={n =>
                                props.data?.dispatch({type: "updated_playedge", sourceID: props.source, targetID: props.target, patch: {limit: n} })
                            } canBeInfinite={true} defaultValue={1} value={props.data.playedge.limit} />
                        </div>
                    </div> :
                    <div className="bg-neutral-200 rounded-md px-1 font-markazi" style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        pointerEvents: 'all'
                    }}>P={props.data.playedge.priority}, S={props.data.playedge.shares}, L={props.data?.playedge.limit === -1 ? "∞" : props.data?.playedge.limit}</div>
            }
            </EdgeLabelRenderer>
        </React.Fragment>
    )
}
