import { useCallback, useMemo, useState } from "react";
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
	const handleChangeExp = useCallback((n: number) => {
		props.dispatch({ type: "updated_playitem", playnodeID: props.playnodeID, index: props.index, patch: { exponent: n }})
	}, [props.playnodeID, props.index])
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

	const [songURI, artistURI] = useMemo(() => {
		const songURISplit = props.playitem.uri.split(":")
		const artistURISplit = props.playitem.creatorURI.split(":")

		return [songURISplit[songURISplit.length - 1], artistURISplit[artistURISplit.length - 1]]
	}, [props.playitem.uri, props.playitem.creatorURI])

	return (
		<tr key={props.playitem.id} className={`group w-full min-w-full border border-${props.color}-600 bg-${props.color}-200 font-markazi`}>
			<td><div className="min-w-5"><button className={`w-fit mx-auto hidden ${props.shouldHaveMoveUpButton ? "group-hover:block" : ""}`} title="Move Playitem Up In List" onClick={handleMoveUp}>⬆️</button></div></td>
			<td><div className="min-w-5"><button className={`w-fit mx-auto hidden ${props.shouldHaveMoveDownButton ? "group-hover:block" : ""}`} title="Move Playitem Down In List" onClick={handleMoveDown}>⬇️</button></div></td>
			<td><div className="ml-2 w-full underline" title={props.playitem.name}><a target="_blank" rel="noopener noreferrer" href={`https://open.spotify.com/track/${songURI}`}>{props.playitem.name}</a></div></td>
			<td><div className="ml-2 w-full underline" title={props.playitem.creator}><a target="_blank" rel="noopener noreferrer" href={`https://open.spotify.com/artist/${artistURI}`}>{props.playitem.creator}</a></div></td>
			<td className={`bg-${props.color}-200 w-8`}>
				<NaturalNumberInputField canBeInfinite={false} defaultValue={0} value={props.playitem.exponent} onChange={handleChangeExp} />
			</td>
			<td className={`bg-${props.color}-200 w-8`}>
				<NaturalNumberInputField canBeInfinite={false} defaultValue={1} value={props.playitem.multiplier} onChange={handleChangeMult} />
			</td>
			<td className={`bg-${props.color}-200 w-8`}>
				<NaturalNumberInputField canBeInfinite={true} defaultValue={1} value={props.playitem.limit} onChange={handleChangeLimit} />
			</td>
			<td><div className="min-w-5"><button className="w-fit mx-auto hidden group-hover:block" title="Delete Playitem" onClick={handleDeleteSelf}>❌</button></div></td>
		</tr>
	)
}
