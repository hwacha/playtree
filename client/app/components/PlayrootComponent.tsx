import React, { useCallback, useState } from "react";
import { PlaytreeEditorAction } from "../reducers/editor";

type PlayheadProps = {
	name: string;
	playnodeID: string;
	dispatch: (action: PlaytreeEditorAction) => void;
}

export default function PlayheadComponent(props: PlayheadProps) {
	const [name, setName] = useState(props.name)
	const onNameChange = useCallback((evt: React.ChangeEvent<HTMLInputElement>) => {
		setName(evt.target.value)
		props.dispatch({
			type: "updated_playhead",
			playnodeID: props.playnodeID,
			patch: {
				name: evt.target.value,
			}
		})
	}, [name])

	const handleDeleteSelf = () => {
		props.dispatch({
			type: "deleted_playhead",
			playnodeID: props.playnodeID
		})
	}

	return (
		<div id={name} title={name} className="group flex absolute -top-9 left-1 min-w-32">
			<button onClick={handleDeleteSelf} className="bg-red-200 px-1 py-[2px] rounded-full text-xs absolute -top-3 -left-2 hidden group-hover:block">🗑️</button>
			<div className="mr-2 bg-purple-300 px-2 py-1 rounded-md">💽</div>
			<input value={name} onChange={onNameChange} className="bg-transparent w-full resize-x" />
		</div>
	)
}