import { useClickOutside } from "../hooks/useClickOutside";
import { useCallback, useMemo, useRef } from "react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { PlaynodeFlowData } from "./PlaynodeComponent";

type PlaynodeContextMenuProps = {
    playnodeFlowData: PlaynodeFlowData | null;
    position: {
        x: number;
        y: number;
    } | null;
    dispatch: (action: PlaytreeEditorAction) => void;
    onExit: () => void;
}

export default function PlaynodeContextMenu(props: PlaynodeContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null)
    useClickOutside(ref, props.onExit)

    const handleAddPlayhead = useCallback(() => {
        if (props.playnodeFlowData) {
            props.dispatch({ type: "added_playhead", playnodeID: props.playnodeFlowData.id })
        }
        props.onExit()
    }, [props.playnodeFlowData?.id, props.position])

    const handleRemovePlayhead = useCallback(() => {
        if (props.playnodeFlowData) {
            props.dispatch({ type: "deleted_playhead", playnodeID: props.playnodeFlowData.id})
        }
        props.onExit()
    }, [props.playnodeFlowData?.id])

    const handleRemovePlaynode = useCallback(() => {
        if (props.playnodeFlowData) {
            props.dispatch({ type: "deleted_playnode", playnodeID: props.playnodeFlowData.id })
		    props.dispatch({ type: "deleted_playhead", playnodeID: props.playnodeFlowData.id })
        }
        props.onExit()
    }, [props.playnodeFlowData?.id])

    const hasPlayhead : boolean = useMemo(() => {
        return !!props.playnodeFlowData?.data.playroot
    }, [props.playnodeFlowData])

    if (!props.playnodeFlowData) {
        return null
    }

    return (
        props.position &&
        <div ref={ref} className="absolute z-[100] border-neutral-300 bg-neutral-200 border font-markazi py-2" style={ { left: props.position.x, top: props.position.y } }>
            <ul>
                <li className="px-1 hover:bg-purple-300">
                    <button onClick={hasPlayhead ? handleRemovePlayhead : handleAddPlayhead} className="flex py-auto">
                        <div className="w-fit mt-1">💽</div>
                        <div className="w-fit my-auto mx-1">{hasPlayhead ? "Remove Playhead" : "Add Playhead"}</div>
                    </button>
                </li>
                <li className="px-1 hover:bg-red-300">
                    <button onClick={handleRemovePlaynode} className="flex py-auto">
                        <div className="w-fit mt-1">🗑️</div>
                        <div className="w-fit my-auto mx-1">{"Remove Playnode"}</div>
                    </button>
                </li>
            </ul>
        </div>
    )
}
