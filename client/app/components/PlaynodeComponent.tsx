import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { PlaytreeEditorAction } from "../reducers/playtree-editor";
import { Content, PlayheadInfo, PlayNode, Playscope } from "../types";
import { useCallback, useState } from "react";
import SearchField, { queryString, SearchResult } from "./SearchField";
import React from "react";
import NaturalNumberInputField from "./NaturalNumberInputField";
import ContentComponent from "./ContentComponent";
import PlayheadComponent from "./PlayheadComponent";

export type PlaynodeFlowData = Node<{
	playnode: PlayNode;
	playhead: PlayheadInfo | null;
	scopes: Playscope[];
	dispatch: (action: PlaytreeEditorAction) => void;
	handleDeletePlaynode: (id: string) => void;
}, 'play'>;

export default function PlaynodeComponent(props: NodeProps<PlaynodeFlowData>) {
	const [adding, setAdding] = useState<boolean>(false)
	const [scopeView, setScopeView] = useState<boolean>(false)

	const [contentList, setContentList] = useState<Content[]>(props.data.playnode.content)

	const highestID = props.data.playnode.content.map(content => parseInt(content.id)).reduce((id1, id2) => Math.max(id1, id2), -1)
	const [contentID, setContentID] = useState<number>(highestID + 1)

	const getNextID = useCallback(() => {
		const nextID = contentID
		setContentID(c => c + 1)
		return nextID
	}, [contentID])

	const handleAddBegin = useCallback((_: any) => {
		setAdding(true)
	}, [])

	const handleContentSelect = useCallback((newContent: SearchResult): boolean => {
		if (newContent.uri === null) {
			return false
		}
		const newContentList = structuredClone(contentList)
		newContentList.push({ id: getNextID().toString(), type: "spotify-track", name: queryString(newContent), uri: newContent.uri, mult: 1, repeat: -1 })
		setContentList(newContentList)
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { content: newContentList } })
		setAdding(false)
		return false
	}, [adding, contentList])

	const handleSearchFocusOut = useCallback((event: FocusEvent) => {
		setAdding(false)
	}, [])

	const handleChangeName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { name: event.target.value } })
	}, [props.data.playnode.name]);

	const handleTogglePlaynodeType = useCallback(() => {
		const otherType: PlayNode["type"] = props.data.playnode.type === "sequence" ? "selector" : "sequence"
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { type: otherType } })
	}, [props.data.playnode.type])

	const handleToggleScope = useCallback(() => {
		setScopeView(sv => !sv)
	}, [])

	const handleMoveUp = useCallback((index: number) => () => {
		if (index <= 0) {
			return
		}
		const newContentList = structuredClone(contentList)
		newContentList[index - 1] = contentList[index]
		newContentList[index] = contentList[index - 1]
		setContentList(newContentList)
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { content: newContentList } })
	}, [contentList])

	const handleMoveDown = useCallback((index: number) => () => {
		if (index + 1 >= contentList.length) {
			return
		}
		const newContentList = structuredClone(contentList)
		newContentList[index + 1] = contentList[index]
		newContentList[index] = contentList[index + 1]
		setContentList(newContentList)
	}, [contentList])

	const handleDeleteContent = useCallback((index: number) => () => {
		const newContentList = structuredClone(contentList)
		newContentList.splice(index, 1)
		setContentList(newContentList)
		props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { content: newContentList } })
	}, [contentList])

	const handleDeleteSelf = useCallback(() => {
		props.data.handleDeletePlaynode(props.data.playnode.id)
	}, [])

	const isSequence = props.data.playnode.type === "sequence"
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
			<div>{props.data.playhead ? <PlayheadComponent name={props.data.playhead.name} nodeID={props.id} dispatch={(x) => props.data.dispatch(x)} /> : null}</div>
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
										props.data.playnode.scopes.map((scopeIndex, index) => {
											const scope = props.data.scopes[scopeIndex]
											return <li key={index} className={`font-markazi`} style={{color: scope.color}}>{scope.name}</li>
										})
									}
									{
										<form method="post" onSubmit={handleAddScope}>
											<input type="hidden" name={"node-id"} value={props.data.playnode.id}></input>
											<select name={"scope-id"} className="font-markazi">
												{
													props.data.scopes.map((scope, index) =>
														props.data.playnode.scopes.includes(index) ? null
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
										<NaturalNumberInputField canBeInfinite={true} defaultValue={1} value={props.data.playnode.repeat} onChange={(n : number) => props.data.dispatch({ type: "updated_playnode", nodeID: props.data.playnode.id, patch: { repeat: n } })}/>
									</div>
									<div className="flex font-markazi"><div className="ml-14">Name</div><div className="ml-[3.75rem]">M</div><div className="ml-3">R</div></div>
									{
										contentList.map((content: Content, index: number) => {
											return <ContentComponent key={content.id} nodeID={props.id} index={index} color={color} contentList={contentList}
												onMoveUp={index > 0 ? handleMoveUp(index) : undefined}
												onMoveDown={index + 1 < contentList.length ? handleMoveDown(index) : undefined}
												onDeleteSelf={handleDeleteContent}
												onUpdateContentList={setContentList}
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