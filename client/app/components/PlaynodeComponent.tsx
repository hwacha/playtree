import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { Playitem, Playroot, Playnode, Playscope } from "../types";
import { useCallback, useState } from "react";
import SearchField, { queryString, SearchResult } from "./SearchField";
import React from "react";
import NaturalNumberInputField from "./NaturalNumberInputField";
import PlayitemComponent from "./PlayitemComponent";
import PlayheadComponent from "./PlayrootComponent";

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

	const [playitems, setPlayitems] = useState<Playitem[]>(props.data.playnode.playitems)

	const highestID = props.data.playnode.playitems.map(playitem => parseInt(playitem.id)).reduce((id1, id2) => Math.max(id1, id2), -1)
	const [playitemID, setContentID] = useState<number>(highestID + 1)

	const getNextID = useCallback(() => {
		const nextID = playitemID
		setContentID(c => c + 1)
		return nextID
	}, [playitemID])

	const handleAddBegin = useCallback((_: any) => {
		setAdding(true)
	}, [])

	const handleContentSelect = useCallback((newContent: SearchResult): boolean => {
		if (newContent.uri === null) {
			return false
		}
		const newPlayitems = structuredClone(playitems)
		newPlayitems.push({ id: getNextID().toString(), type: {source: "spotify", plurality: "single"}, name: queryString(newContent), uri: newContent.uri, multiplier: 1, limit: -1 })
		setPlayitems(newPlayitems)
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { playitems: newPlayitems } })
		setAdding(false)
		return false
	}, [adding, playitems])

	const handleSearchFocusOut = useCallback((event: FocusEvent) => {
		setAdding(false)
	}, [])

	const handleChangeName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { name: event.target.value } })
	}, [props.data.playnode.name]);

	const handleTogglePlaynodeType = useCallback(() => {
		const otherType: Playnode["type"] = props.data.playnode.type === "sequencer" ? "selector" : "sequencer"
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { type: otherType } })
	}, [props.data.playnode.type])

	const handleToggleScope = useCallback(() => {
		setScopeView(sv => !sv)
	}, [])

	const handleMoveUp = useCallback((index: number) => () => {
		if (index <= 0) {
			return
		}
		const newPlayitems = structuredClone(playitems)
		newPlayitems[index - 1] = playitems[index]
		newPlayitems[index] = playitems[index - 1]
		setPlayitems(newPlayitems)
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { playitems: newPlayitems } })
	}, [playitems])

	const handleMoveDown = useCallback((index: number) => () => {
		if (index + 1 >= playitems.length) {
			return
		}
		const newPlayitems = structuredClone(playitems)
		newPlayitems[index + 1] = playitems[index]
		newPlayitems[index] = playitems[index + 1]
		setPlayitems(newPlayitems)
	}, [playitems])

	const handleDeleteContent = useCallback((index: number) => () => {
		const newPlayitems = structuredClone(playitems)
		newPlayitems.splice(index, 1)
		setPlayitems(newPlayitems)
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { playitems: newPlayitems } })
	}, [playitems])

	const handleDeleteSelf = useCallback(() => {
		props.data.handleDeletePlaynode(props.data.playnode.id)
	}, [])

	const isSequence = props.data.playnode.type === "sequencer"
	const color = isSequence ? "green" : "amber"

	const handleDrop = (event: any) => {
		event.preventDefault();
		props.data.dispatch({ type: "added_playhead", nodeID: props.data.playnode.id })
	}

	const handleAddScope : React.FormEventHandler<HTMLFormElement> = event => {
		event.preventDefault()
		const form = event.target;
		const formData = new FormData(form as any);

		props.data.dispatch({type: "added_scope_to_playnode", index: parseInt((formData.get("scope-id") as string).toString()), nodeID: (formData.get("node-id") as string).toString() })
	}

	return (
		<React.Fragment key={props.id}>
			<div>{props.data.playroot ? <PlayheadComponent name={props.data.playroot.name} nodeID={props.id} dispatch={(x) => props.data.dispatch(x)} /> : null}</div>
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
								 	<div className="font-markazi">
										<span className="mr-1">Repeat:</span>
										<NaturalNumberInputField canBeInfinite={true} defaultValue={1} value={props.data.playnode.limit} onChange={(n : number) => props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { limit: n } })}/>
									</div>
									<div className="flex font-markazi"><div className="ml-14">Name</div><div className="ml-[3.75rem]">M</div><div className="ml-3">R</div></div>
									{
										playitems.map((playitem: Playitem, index: number) => {
											return <PlayitemComponent key={playitem.id} nodeID={props.id} index={index} color={color} playitems={playitems}
												onMoveUp={index > 0 ? handleMoveUp(index) : undefined}
												onMoveDown={index + 1 < playitems.length ? handleMoveDown(index) : undefined}
												onDeleteSelf={handleDeleteContent}
												onUpdatePlayitems={setPlayitems}
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