import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { Playitem, Playroot, Playnode, Playscope } from "../types";
import { useCallback, useState } from "react";
import SearchField, { queryString, SearchResult } from "./SearchField";
import React from "react";
import NaturalNumberInputField from "./NaturalNumberInputField";
import PlayitemComponent from "./PlayitemComponent";
import PlayrootComponent from "./PlayrootComponent";

export type PlaynodeFlowData = Node<{
	playnode: Playnode;
	playroot: Playroot | null;
	playscopes: Playscope[];
	dispatch: (action: PlaytreeEditorAction) => void;
	handleDeletePlaynode: (id: string) => void;
}, 'play'>;

export default function PlaynodeComponent(props: NodeProps<PlaynodeFlowData>) {
	const [adding, setAdding] = useState<boolean>(false)
	const [scopeView, setScopeView] = useState<boolean>(false)

	const handleAddBegin = useCallback((_: any) => {
		setAdding(true)
	}, [])

	const handleContentSelect = useCallback((newPlayitemAsSearchResult: SearchResult): boolean => {
		if (newPlayitemAsSearchResult.uri === null) {
			return false
		}
		props.data.dispatch({
			type: "added_playitem_to_playnode",
			playnodeID: props.data.playnode.id,
			playitem: {
				type: { source: "spotify", plurality: "single" },
				uri: newPlayitemAsSearchResult.uri,
				name: queryString(newPlayitemAsSearchResult),
				multiplier: 1,
				limit: -1
			}})
		setAdding(false)
		return true
	}, [])

	const handleSearchFocusOut = useCallback((event: FocusEvent) => {
		setAdding(false)
	}, [])

	const handleToggleScope = useCallback(() => {
		setScopeView(sv => !sv)
	}, [])

	const handleChangeName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { name: event.target.value } })
	}, [props.data.playnode.name]);

	const handleTogglePlaynodeType = useCallback(() => {
		const otherType: Playnode["type"] = props.data.playnode.type === "sequencer" ? "selector" : "sequencer"
		props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { type: otherType } })
	}, [props.data.playnode.type])

	const handleMoveUp = useCallback((index: number) => () => {
		props.data.dispatch({ type: "moved_playitem_up", playnodeID: props.data.playnode.id, index: index })
	}, [])

	const handleMoveDown = useCallback((index: number) => () => {
		props.data.dispatch({ type: "moved_playitem_down", playnodeID: props.data.playnode.id, index: index })
	}, [])

	const handleDeleteSelf = useCallback(() => {
		props.data.handleDeletePlaynode(props.data.playnode.id)
	}, [])

	const isSequence = props.data.playnode.type === "sequencer"
	const color = isSequence ? "green" : "amber"

	const handleDrop = (event: any) => {
		event.preventDefault();
		props.data.dispatch({ type: "added_playhead", playnodeID: props.data.playnode.id })
	}

	const handleAddScope : React.FormEventHandler<HTMLFormElement> = event => {
		event.preventDefault()
		const form = event.target;
		const formData = new FormData(form as any);

		props.data.dispatch({type: "added_scope_to_playnode", index: parseInt((formData.get("scope-id") as string).toString()), playnodeID: (formData.get("node-id") as string).toString() })
	}

	return (
		<React.Fragment key={props.id}>
			<div>{props.data.playroot ? <PlayrootComponent name={props.data.playroot.name} playnodeID={props.id} dispatch={(x) => props.data.dispatch(x)} /> : null}</div>
			<Handle type="target" isConnectableStart={false} position={Position.Top} style={{ width: 12, height: 12 }} />
			{
				props.selected ?
					<div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-64 p-4 text-${color}-600`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
						<div className="mb-5">
							<button className={`bg-${color}-300 rounded-lg px-2 py-1 absolute top-1 left-1`} onClick={handleTogglePlaynodeType} title={props.data.playnode.type}>{isSequence ? <>🔢</> : <>🎲</>}</button>
							<button className={`bg-blue-300 rounded-lg px-2 py-1 absolute top-1 left-10`} onClick={handleToggleScope} title={scopeView ? "Toggle Song View" : "Toggle Scope View"}>{scopeView ? <>🎶</> : <>🔲</>}</button>
							<button className={`bg-red-300 rounded-lg px-2 py-1 absolute top-1 right-1`} onClick={handleDeleteSelf} title="Delete Playnode">🗑️</button>
						</div>
						<input id="text" name="text" value={props.data.playnode.name} onChange={handleChangeName} className={`w-full bg-${color}-100 text-center`} />
						<ul className="my-3">
							{
								scopeView ?
								<>
									{
										props.data.playnode.playscopes.map((scopeIndex, index) => {
											const scope = props.data.playscopes[scopeIndex]
											return <li key={index} className={`font-markazi`} style={{color: scope.color}}>{scope.name}</li>
										})
									}
									{
										<form method="post" onSubmit={handleAddScope}>
											<input type="hidden" name={"node-id"} value={props.data.playnode.id}></input>
											<select name={"scope-id"} className="font-markazi">
												{
													props.data.playscopes.map((scope, index) =>
														props.data.playnode.playscopes.includes(index) ? null
														: <option key={index} value={index}>{scope.name}</option>
													)
												}
											</select>
											<button type="submit" className="border-black border-2 px-1 font-markazi">Add</button>
										</form>
									}
								</>
								 :
								 <>
								 	<div className="font-markazi flex w-fit">
										<span className="mr-1">Limit:</span>
										<div className="w-8">
											<NaturalNumberInputField
												canBeInfinite={true}
												defaultValue={1}
												value={props.data.playnode.limit}
												onChange={(n : number) => props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { limit: n } })}/>
										</div>
									</div>
									<div className="flex font-markazi"><div className="ml-14">Name</div><div className="ml-[3.75rem]">M</div><div className="ml-3">R</div></div>
									{
										props.data.playnode.playitems.map((playitem: Playitem, index: number) => {
											return <PlayitemComponent
												key={playitem.id}
												playnodeID={props.id}
												playitem={playitem}
												index={index}
												color={color}
												shouldHaveMoveUpButton={index > 0}
												shouldHaveMoveDownButton={index + 1 < props.data.playnode.playitems.length}
												dispatch={props.data.dispatch} />
										})
									}
								 </>
							}
						</ul>
						{
							adding ?
								<SearchField onContentSelect={handleContentSelect} onFocusOut={handleSearchFocusOut} /> :
								<div className="flex"><button title="Add Content" className={`border-${color}-600 bg-${color}-400 border-2 rounded-full px-2 py-1 m-auto`} onClick={handleAddBegin}>➕</button></div>
						}
					</div> :
					<div className={`border-${color}-600 bg-${color}-100 text-${color}-600 border-4 rounded-xl w-64 h-16 py-4 text-center`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>{props.data.playnode.name}</div>
			}
			<Handle type="source" position={Position.Bottom} id="a" style={{ width: 12, height: 12 }} />
		</React.Fragment>
	)
}