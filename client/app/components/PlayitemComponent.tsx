import { useCallback, useState } from "react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { Playitem } from "../types";
import NaturalNumberInputField from "./NaturalNumberInputField";

type PlayitemComponentProps = {
	playnodeID: string;
	playitem: Playitem
	index: number;
	color: string;
	shouldHaveMoveUpButton: boolean;
	shouldHaveMoveDownButton: boolean;
	dispatch: (action: PlaytreeEditorAction) => void;
}

export default function PlayitemComponent(props: PlayitemComponentProps) {
	const handleChangeMult = useCallback((n: number) => {
		props.dispatch({ type: "updated_playitem", playnodeID: props.playnodeID, index: props.index, patch: { multiplier: n } })
	}, [props.playnodeID, props.index])

	const handleChangeLimit = useCallback((n: number) => {
		props.dispatch({ type: "updated_playitem", playnodeID: props.playnodeID, index: props.index, patch: { limit: n } })
	}, [props.playnodeID, props.index])

	const handleMoveUp = useCallback(() => {
		props.dispatch({ type: "moved_playitem_up", playnodeID: props.playnodeID, index: props.index })
	}, [props.playnodeID, props.index])

	const handleMoveDown = useCallback(() => {
		props.dispatch({ type: "moved_playitem_down", playnodeID: props.playnodeID, index: props.index })
	}, [props.playnodeID, props.index])

	const handleDeleteSelf = useCallback(() => {
		props.dispatch({ type: "deleted_playitem_from_playnode", playnodeID: props.playnodeID, index: props.index })
	}, [props.playnodeID, props.index])

	return (
		<li key={props.playitem.id} className={`border border-${props.color}-600 bg-${props.color}-200 font-markazi flex`}>
			{props.shouldHaveMoveUpButton ? <button className="w-fit ml-1" title="Move Content Up In List" onClick={handleMoveUp}>⬆️</button> : <div className="ml-5" />}
			{props.shouldHaveMoveDownButton ? <button className="w-fit ml-1" title="Move Content Down In List" onClick={handleMoveDown}>⬇️</button> : <div className="ml-5" />}
			<span className="w-full ml-3">{props.playitem.name}</span>
			<div className={`bg-${props.color}-200 w-6`}>
				<NaturalNumberInputField canBeInfinite={false} defaultValue={1} value={props.playitem.multiplier} onChange={handleChangeMult} />
			</div>
			<div className={`bg-${props.color}-200 w-6`}>
				<NaturalNumberInputField canBeInfinite={false} defaultValue={1} value={props.playitem.limit} onChange={handleChangeLimit} />
			</div>
			<button className="w-fit mr-1" title="Delete Content" onClick={handleDeleteSelf}>❌</button>
		</li>
	)
}
