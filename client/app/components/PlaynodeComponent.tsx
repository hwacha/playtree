import { Handle, Node, NodeProps, Position, useKeyPress } from "@xyflow/react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { Playitem, Playroot, Playnode, Playscope } from "../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchField, { SearchResult } from "./SearchField";
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
	playscopeComparator: (i: number, j: number) => number;
}, 'play'>;

export const PLAYNODE_COLLAPSED_WIDTH = 16;
export const PLAYNODE_EXPANDED_WIDTH  = 32;

export default function PlaynodeComponent(props: NodeProps<PlaynodeFlowData>) {
	const [scopeView, setScopeView] = useState<boolean>(false)

	// when dragging stops, update the playnode position
	const wasDragging = useRef<boolean>(false)
	useEffect(() => {
		if (wasDragging.current && !props.dragging) {
			props.data.dispatch({
				type: "updated_playnode",
				playnodeID: props.data.playnode.id,
				patch: {
					position: {
						x: props.positionAbsoluteX,
						y: props.positionAbsoluteY,
					}
				}
			})
		}
		wasDragging.current = props.dragging
	}, [props.dragging])

	// delete node with backspace or delete
	const deleteKeyPressed = useKeyPress(['Backspace', 'Delete'])
	useEffect(() => {
		if (props.selected && deleteKeyPressed) {
			handleDeleteSelf()
		}
	}, [deleteKeyPressed])

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
				creatorURI: newPlayitemAsSearchResult.creatorURI ?? "",
				name: newPlayitemAsSearchResult.name,
				creator: newPlayitemAsSearchResult.creator,
				exponent: 0,
				multiplier: 1,
				limit: -1
			}})
		return true
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

	const handleTogglePlayscope = useCallback((playscopeID : number) => {
		return () => {
			props.data.dispatch({type: "toggled_playscope_in_playnode", playnodeID: props.data.playnode.id, playscopeID: playscopeID})
		}
	}, [])

	const isSequence = props.data.playnode.type === "sequencer"
	const otherType = isSequence ? "selector" : "sequencer"
	const color = isSequence ? "green" : "amber"

	const playscopesOnPlaynode = useMemo(() => {
		return [...props.data.playscopes].sort((p1, p2) => {
			return props.data.playscopeComparator(p1.id, p2.id)
		}).filter(({id}) => props.data.playnode.playscopes.includes(id))
	}, [props.data.playscopes, props.data.playnode.playscopes])

	const numScopes = playscopesOnPlaynode.length

	let component = <div className="opacity-100" style={{zIndex: props.zIndex}}>
		<Handle type="target" isConnectableStart={false} position={Position.Top} style={{ width: 12, height: 12, top: 2 + 4 * numScopes, left: 128 }} />
		{
			props.selected && !props.dragging ?
				<div
					className={`border-${color}-600 bg-${color}-100 border-4 rounded-xl p-4 text-${color}-600`}
					style={{ width: `${PLAYNODE_EXPANDED_WIDTH}rem`, marginLeft: `calc(-${PLAYNODE_EXPANDED_WIDTH}rem/4)` }}
					onDrop={handleDrop}
					onDragOver={e => e.preventDefault()}
				>
					<div className="mb-5">
						<button
							className={`bg-${color}-300 rounded-lg px-2 py-1 absolute left-[1.25rem]`}
							style={{left: 4 * (1 + numScopes) - (PLAYNODE_EXPANDED_WIDTH*4), top: 4 * (1 + numScopes)}}
							onClick={handleTogglePlaynodeType} title={`Toggle node type from ${props.data.playnode.type} to ${otherType}`}>
								{isSequence ? <>🔢</> : <>🎲</>}
						</button>
						<button
							className={`bg-indigo-300 rounded-lg px-2 py-1 absolute left-[3.5rem]`}
							style={{left: 4 * (9.5 + numScopes) - (PLAYNODE_EXPANDED_WIDTH*4), top: 4 * (1 + numScopes)}}
							onClick={handleToggleScope} title={scopeView ? "Toggle Song View" : "Toggle Scope View"}>
								{scopeView ? <>🎶</> : <>🔲</>}
						</button>
						<button
							className={`bg-red-300 rounded-lg px-2 py-1 absolute right-[1.25rem]`}
							style={{right: 4 * (1 + numScopes), top: 4 * (1 + numScopes)}}
							onClick={handleDeleteSelf}
							title="Delete Playnode">
								🗑️
						</button>
					</div>
					<input id="text" name="text" title={props.data.playnode.name} value={props.data.playnode.name} onChange={handleChangeName} className={`w-full bg-${color}-100 text-center`} />
					{
						scopeView ?
						<ul className="my-3 font-markazi">
							{
								props.data.playscopes.map(scope => {
									const [r, g, b] = hexToRGB(scope.color)
									const contrastColor = r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000000" : "#ffffff"
									return <li key={scope.id} className={`flex`} title={scope.name} style={{ backgroundColor: scope.color, color: contrastColor }}>
										<input
											type="checkbox"
											checked={props.data.playnode.playscopes.includes(scope.id)}
											onChange={handleTogglePlayscope(scope.id)}
											className="mx-1"/>
										{scope.name}
									</li>
								})
							}
						</ul> :
						<>
							<div className="font-markazi text-xl w-full flex justify-between items-center my-2">
								<div title="You can edit the repeat value, but it is not implemented on the player." className="w-fit flex hover:cursor-help line-through">
									Repeat:
									<div>
										<div className="w-8">
											<NaturalNumberInputField
												canBeInfinite={false}
												defaultValue={1}
												value={props.data.playnode.repeat}
												onChange={(n : number) => props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { repeat: n } })}/>
										</div>
									</div>
								</div>
								<div className="flex w-fit">
									Limit:
									<div className="w-8">
										<NaturalNumberInputField
											canBeInfinite={true}
											defaultValue={1}
											value={props.data.playnode.limit}
											onChange={(n : number) => props.data.dispatch({ type: "updated_playnode", playnodeID: props.data.playnode.id, patch: { limit: n } })}/>
									</div>
								</div>
								<div className="w-fit h-5 flex">
									<img src="/images/Full_Logo_Black_RGB.svg" />
								</div>
							</div>
							<table className="font-markazi table-fixed w-full mb-1">
								<thead>
									<tr>
										<th className="w-6">⬆️</th>
										<th className="w-6">⬇️</th>
										<th className="w-2/5 text-left text-xl">&nbsp;&nbsp;&nbsp;Name</th>
										<th className="w-1/5 text-left text-xl">&nbsp;&nbsp;&nbsp;Artist</th>
										<th title="Exponent: You can edit this value, but the player hasn't implemented it yet." className="text-right text-lg line-through hover:cursor-help">Exp</th>
										<th title="Multiplier" className="text-right text-lg">Mult</th>
										<th title="Limit" className="text-right text-lg">Lim</th>
										<th>❌</th>
									</tr>
								</thead>
								<tbody>
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
								</tbody>
							</table>
							<SearchField onContentSelect={handleContentSelect} />
						</>
					}
				</div> :
				<div
					className={`border-${color}-600 bg-${color}-100 text-${color}-600 border-4 rounded-xl h-16 py-4 text-center text-nowrap whitespace-nowrap overflow-hidden overflow-ellipsis`}
					style={{ width: `${PLAYNODE_COLLAPSED_WIDTH}rem`}}
					title={props.data.playnode.name}
					onDrop={handleDrop}
					onDragOver={e => e.preventDefault()}
				>{props.data.playnode.name}</div>
		}
		<Handle type="source" position={Position.Bottom} id="a" style={{ width: 12, height: 12, bottom: 2 + 4 * numScopes, left: 128 }} />
	</div>

	playscopesOnPlaynode.forEach((playscope, depth) => {
		const [r, g, b] = hexToRGB(playscope.color);
		const rgba = `rgba(${r}, ${g}, ${b}, ${0.5})`
		component = <div key={playscope.id} className={`w-fit h-fit border-4`} style={{borderColor: rgba, borderRadius: 4 * (4 + depth), zIndex: -200 - depth - 1}}>{component}</div>
	})

	return (
		<React.Fragment key={props.id}>
			<div>{props.data.playroot ? <PlayrootComponent name={props.data.playroot.name} playnodeID={props.id} dispatch={(x) => props.data.dispatch(x)} /> : null}</div>
			{component}
		</React.Fragment>
	)
}