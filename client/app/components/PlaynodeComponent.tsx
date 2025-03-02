import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { Playitem, Playroot, Playnode, Playscope } from "../types";
import { useCallback, useMemo, useState } from "react";
import SearchField, { queryString, SearchResult } from "./SearchField";
import React from "react";
import NaturalNumberInputField from "./NaturalNumberInputField";
import PlayitemComponent from "./PlayitemComponent";
import PlayrootComponent from "./PlayrootComponent";
import { hexToRGB } from "@opentf/std";

export type PlaynodeFlowData = Node<{
	playnode: Playnode;
	playroot: Playroot | null;
	playscopes: Playscope[];
	dispatch: (action: PlaytreeEditorAction) => void;
	playscopeComparator: ((i : number, j : number) => number)
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

	const handleTogglePlaynodeType = useCallback(() => {
		const otherType: Playnode["type"] = props.data.playnode.type === "sequencer" ? "selector" : "sequencer"
		props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { type: otherType } })
	}, [props.data.playnode.type])

	const handleDeleteSelf = useCallback(() => {
		props.data.dispatch({ type: "deleted_playnode", playnodeID: props.data.playnode.id })
		props.data.dispatch({ type: "deleted_playhead", playnodeID: props.data.playnode.id })
	}, [])

	const handleChangeName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { name: event.target.value } })
	}, [props.data.playnode.name]);

	const handleDrop = useCallback((event: any) => {
		event.preventDefault();
		props.data.dispatch({ type: "added_playhead", playnodeID: props.data.playnode.id })
	}, [])

	const handleTogglePlayscope = useCallback((index : number) => {
		return () => {
			props.data.dispatch({type: "toggled_playscope_in_playnode", playnodeID: props.data.playnode.id, index: index})
		}
	}, [])

	const isSequence = props.data.playnode.type === "sequencer"
	const color = isSequence ? "green" : "amber"

	const playscopesOnPlaynode = useMemo(() => {
		return [...props.data.playscopes].map((p, i) => {
			return {playscope: p, index: i}
		}).sort(({playscope: p1, index: i1}, {playscope: p2, index: i2}) => {
			return props.data.playscopeComparator(i1, i2)
		}).filter(({index}) => props.data.playnode.playscopes.includes(index))
	}, [props.data.playscopes, props.data.playnode.playscopes])

	const numScopes = playscopesOnPlaynode.length

	let component = <div className="opacity-100" style={{zIndex: props.zIndex}}>
		<Handle type="target" isConnectableStart={false} position={Position.Top} style={{ width: 12, height: 12, top: 2 + 4 * numScopes }} />
		{
			props.selected ?
				<div className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl w-64 p-4 text-${color}-600`} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
					<div className="mb-5">
						<button className={`bg-${color}-300 rounded-lg px-2 py-1 absolute left-[1.25rem]`} style={{left: 4 * (1 + numScopes), top: 4 * (1 + numScopes)}} onClick={handleTogglePlaynodeType} title={props.data.playnode.type}>{isSequence ? <>🔢</> : <>🎲</>}</button>
						<button className={`bg-blue-300 rounded-lg px-2 py-1 absolute left-[3.5rem]`} style={{left: 4 * (9.5 + numScopes), top: 4 * (1 + numScopes)}} onClick={handleToggleScope} title={scopeView ? "Toggle Song View" : "Toggle Scope View"}>{scopeView ? <>🎶</> : <>🔲</>}</button>
						<button className={`bg-red-300 rounded-lg px-2 py-1 absolute right-[1.25rem]`} style={{right: 4 * (1 + numScopes), top: 4 * (1 + numScopes)}} onClick={handleDeleteSelf} title="Delete Playnode">🗑️</button>
					</div>
					<input id="text" name="text" value={props.data.playnode.name} onChange={handleChangeName} className={`w-full bg-${color}-100 text-center`} />
					<ul className="my-3 font-markazi">
						{
							scopeView ?
							<>
								{
									props.data.playscopes.map((scope, index) => {
										const [r, g, b] = hexToRGB(scope.color)
										const contrastColor = r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000000" : "#ffffff"
										return <li key={index} className={`flex`} style={{ backgroundColor: scope.color, color: contrastColor }}>
											<input
												type="checkbox"
												checked={props.data.playnode.playscopes.includes(index)}
												onChange={handleTogglePlayscope(index)}
												className="mx-1"/>
											{scope.name}
										</li>
									})
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
		<Handle type="source" position={Position.Bottom} id="a" style={{ width: 12, height: 12, bottom: 2 + 4 * numScopes }} />
	</div>

	playscopesOnPlaynode.forEach(({playscope, index}, depth) => {
		const [r, g, b] = hexToRGB(playscope.color);
		const rgba = `rgba(${r}, ${g}, ${b}, ${0.5})`
		component = <div key={index} className={`w-fit h-fit border-4`} style={{borderColor: rgba, borderRadius: 4 * (4 + depth), zIndex: -200 - depth - 1}}>{component}</div>
	})

	return (
		<React.Fragment key={props.id}>
			<div>{props.data.playroot ? <PlayrootComponent name={props.data.playroot.name} playnodeID={props.id} dispatch={(x) => props.data.dispatch(x)} /> : null}</div>
			{component}
		</React.Fragment>
	)
}