import { useClickOutside } from "../hooks/useClickOutside";
import { useCallback, useMemo, useRef } from "react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { PlayedgeFlowData } from "./PlayedgeComponent";

type PlayedgeContextMenuProps = {
    playedgeFlowData: PlayedgeFlowData | null;
    position: {
        x: number;
        y: number;
    } | null;
    dispatch: (action: PlaytreeEditorAction) => void;
    onExit: () => void;
}

export default function PlayedgeContextMenu(props: PlayedgeContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    useClickOutside(ref, props.onExit)

    const handleRemovePlayedge = useCallback(() => {
        if (props.playedgeFlowData) {
            props.dispatch({ type: "deleted_playedge", sourceID: props.playedgeFlowData.source, targetID: props.playedgeFlowData.target })
        }
        props.onExit()
    }, [props.playedgeFlowData?.id])

    const handleMoveLabel = useCallback(() => {
        if (props.playedgeFlowData) {
            console.log("move label not yet implemented")
        }
        props.onExit()
    }, [props.playedgeFlowData])

    if (!props.playedgeFlowData) {
        return null
    }

    return (
        props.position &&
        <div ref={ref} className="absolute z-[100] border-neutral-300 bg-neutral-200 border font-markazi py-2" style={ { left: props.position.x, top: props.position.y } }>
            <ul>
            <li className="px-1 hover:bg-slate-300">
                    <button onClick={handleMoveLabel} disabled={true} className="flex py-auto hover:cursor-help" title="Not yet implemented">
                        <div className="w-fit mt-1">🏷️</div>
                        <div className="w-fit my-auto mx-1">{"Move Label"}</div>
                    </button>
                </li>
                <li className="px-1 hover:bg-red-300">
                    <button onClick={handleRemovePlayedge} className="flex py-auto">
                        <div className="w-fit mt-1">🗑️</div>
                        <div className="w-fit my-auto mx-1">{"Remove Playedge"}</div>
                    </button>
                </li>
            </ul>
        </div>
    )
}
