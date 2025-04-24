import { useReactFlow } from "@xyflow/react";
import { useClickOutside } from "../hooks/useClickOutside";
import { useCallback, useRef } from "react";
import { PlaytreeEditorAction } from "../reducers/editor";

type PaneContextMenuProps = {
	position: {
		x: number;
		y: number;
	} | null;
	dispatch: (action: PlaytreeEditorAction) => void;
	onExit: () => void;
}

export default function PaneContextMenu(props: PaneContextMenuProps) {
	const ref = useRef<HTMLDivElement>(null)
	useClickOutside(ref, props.onExit)

	const reactFlowInstance = useReactFlow()
	const handleAddPlaynode = useCallback(() => {
		if (props.position) {
			const viewport = reactFlowInstance.getViewport()
			const origin = reactFlowInstance.screenToFlowPosition({x: props.position.x, y: props.position.y})
			props.dispatch({ type: "added_playnode", x: origin.x, y: origin.y })
		}
		props.onExit()
	}, [props.position])

	return (
		props.position &&
		<div ref={ref} className="absolute z-[100] border-neutral-300 bg-neutral-200 border font-markazi py-2" style={ { left: props.position.x, top: props.position.y } }>
			<ul>
				<li className="px-1 hover:bg-green-300">
					<button onClick={handleAddPlaynode} className="flex py-auto">
						<div className="w-fit mt-1">➕</div>
						<div className="w-fit my-auto mx-1">Add Playnode</div>
					</button>
				</li>
			</ul>
		</div>
	)
}
