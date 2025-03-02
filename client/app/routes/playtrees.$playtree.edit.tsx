import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Background, Controls, MarkerType, ReactFlow, getBezierPath, addEdge, OnConnect, useNodesState, useEdgesState, ConnectionLineComponent } from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import invariant from "tiny-invariant";
import { jsonFromPlaytree, Playedge, Playnode, Playscope, Playtree, playtreeFromJson } from "../types";
import Dagre from '@dagrejs/dagre';
import { PlaytreeEditorAction, playtreeReducer } from "../reducers/editor";
import PlaynodeComponent, { PlaynodeFlowData } from "../components/PlaynodeComponent";
import PlayedgeComponent, { PlayedgeFlowData } from "../components/PlayedgeComponent";
import { PlayConnectionLine } from "../components/PlayConnectionLine";
import { intersection, isSubsetOf, isSupersetOf } from "@opentf/std";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	invariant(params.playtree)
	const response = await fetch(`http://localhost:8080/playtrees/${params.playtree}`)
	return await response.json()
}

type ScopeManagerProps = {
	scopes: Playscope[];
	dispatch: (action: PlaytreeEditorAction) => void;
}
const ScopeManager = (props: ScopeManagerProps) => {
	return (
		<div className="absolute z-10 left-48 top-48 h-96 w-96 bg-slate-50 font-markazi">
			<ul>
			{
				props.scopes.map((scope, index) => {
					return (<li key={index}>
						<div className="flex">
							<input value={scope.name} onChange={e => props.dispatch({type: "updated_playscope", index: index, patch: { name: e.target.value }})}/>
							<input type="color" value={scope.color} onChange={e => props.dispatch({type: "updated_playscope", index: index, patch: { color: e.target.value }})}/>
							<button className="border-4 border-red bg-red-400 mt-4 mx-auto" onClick={() => props.dispatch({type: "deleted_playscope", index: index})}>Delete</button>
						</div>
						
					</li>)
				})
			}
			</ul>
			<div className="w-full flex">
				<button className="border-4 border-black bg-blue-400 mt-4 mx-auto" onClick={() => props.dispatch({type: "added_playscope"})}>Add Scope</button>
			</div>
		</div>
	)
}

export default function PlaytreeEditor() {
	const customFlowNodeTypes = useMemo(() => ({ play: PlaynodeComponent }), []);
	const customFlowEdgeTypes = useMemo(() => ({ play: PlayedgeComponent }), []);

	const initialPlaytree: Playtree | null = playtreeFromJson(useLoaderData())
	if (initialPlaytree === null) {
		return null
	}

	const [state, dispatch] = useReducer<typeof playtreeReducer>(playtreeReducer, {
		playtree: initialPlaytree,
		unsavedChangesExist: false,
		messageLog: []
	})
	const [scopeManagerVisible, setScopeManagerVisible] = useState<boolean>(false)

	const playscopeComparator = useMemo(() => {
		const playnodesByPlayscope = state.playtree.playscopes.map(_ => new Set<string>())
		state.playtree.playnodes.forEach((playnode) => {
			playnode.playscopes.forEach(playscopeID => {
				playnodesByPlayscope[playscopeID].add(playnode.id)
			})
		})

		return (i : number, j : number) : number => {
			const iSubsetOfJ = isSubsetOf(playnodesByPlayscope[i], playnodesByPlayscope[j])
			const jSubsetOfI = isSubsetOf(playnodesByPlayscope[j], playnodesByPlayscope[i])
			if (iSubsetOfJ && jSubsetOfI) {
				return 0
			}
			if (iSubsetOfJ) {
				return -1
			}
			if (jSubsetOfI) {
				return 1
			}

			return 0
		}
	}, [state.playtree.playscopes, state.playtree.playnodes])

	const initialFlownodeData: PlaynodeFlowData[] = Array.from(initialPlaytree.playnodes.values()).map((playnode, index) => {
		return {
			key: playnode.id,
			type: "play",
			id: playnode.id,
			label: playnode.name,
			position: { x: 100 + 300 * (index % 3), y: 50 + Math.floor(index / 3) * 300 },
			zIndex: 100 - index,
			data: {
				label: playnode.id,
				playnode: playnode,
				playroot: initialPlaytree.playroots.get(playnode.id) ?? null,
				playscopes: initialPlaytree.playscopes,
				dispatch: (x: PlaytreeEditorAction) => dispatch(x),
				playscopeComparator: playscopeComparator,
			}
		}
	})

	const makeNewPlayedgeFlowData = useCallback((playnode: Playnode, playedge: Playedge): PlayedgeFlowData => {
		return {
			id: playnode.id + "-" + playedge.targetID,
			type: "play",
			label: playnode.id + "-" + playedge.targetID,
			source: playnode.id,
			target: playedge.targetID,
			markerEnd: {
				type: MarkerType.Arrow,
				color: "brown",
			},
			style: {
				stroke: "brown",
				strokeWidth: 2,
			},
			data: {
				playedge: playedge,
				dispatch: dispatch
			}
		}
	}, [])

	let initialFlowedgeData: PlayedgeFlowData[] = []
	initialPlaytree.playnodes.forEach(playnode => {
		if (playnode.next) {
			playnode.next.forEach(playedge => {
				initialFlowedgeData.push(makeNewPlayedgeFlowData(playnode, playedge))
			})
		}
	})

	const [flownodes, setFlownodes, onFlownodesChange] = useNodesState<PlaynodeFlowData>(initialFlownodeData)
	const [flowedges, setFlowedges, onFlowedgesChange] = useEdgesState<PlayedgeFlowData>(initialFlowedgeData)

	useEffect(() => {
		const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
		g.setGraph({ rankdir: "TB", align: undefined, acyclicer: "greedy", ranker: "network-simplex" })
		flowedges.filter(edge => !state.playtree.playroots.has(edge.target)).forEach((edge) => g.setEdge(edge.source, edge.target));
		flownodes.forEach((node) =>
			g.setNode(node.id, {
				...node,
				width: node.measured?.width ?? 250,
				height: node.measured?.height ?? 175,
			}),
		);

		Dagre.layout(g);
		setFlownodes(flownodes.map((node) => {
			const position = g.node(node.id);
			// We are shifting the dagre node position (anchor=center center) to the top left
			// so it matches the React Flow node anchor point (top left).
			const x = position.x - (node.measured?.width ?? 0) / 2;
			const y = position.y - (node.measured?.height ?? 0) / 2;

			return { ...node, position: { x, y } };
		})
		)
		setFlowedges([...flowedges])
	}, [])

	const onConnect: OnConnect = useCallback(connection => {
		const sourcePlaynode = state.playtree.playnodes.get(connection.source)
		if (sourcePlaynode) {
			const playedge = { targetID: connection.target, priority: 0, shares: 1, limit: -1 }
			setFlowedges((eds) => addEdge(makeNewPlayedgeFlowData(sourcePlaynode, playedge), eds))
			dispatch({ type: "added_playedge", sourceID: connection.source, targetID: connection.target })
		}
	}, [state.playtree.playnodes]);

	const makeNewPlaynodeFlowData = useCallback((id: string) : PlaynodeFlowData => {
		return {
			id: id,
			type: "play",
			position: { x: 0, y: 0 },
			zIndex: 100 - parseInt(id),
			data: {
				playnode: {
					id: id,
					name: "Playnode",
					type: "sequencer",
					limit: -1,
					playscopes: [],
					playitems: [],
					next: []
				},
				playscopes: state.playtree.playscopes,
				playroot: null,
				dispatch: (x: PlaytreeEditorAction) => dispatch(x),
				playscopeComparator: playscopeComparator
			}
		}
	}, [])

	const handleAddPlaynode = useCallback(() => {
		dispatch({ type: "added_playnode" })
	}, [])

	useEffect(() => { // sync react flow components with playtree state
		// synchronize flownodes
		setFlownodes(oldFlownodes => {
			// next, upsert flownodes w/r/t the now-existing playnodes
			const upsertedAndFilteredPlaynodeFlowData : PlaynodeFlowData[] = []
			// Note: this procedure is O(n^2) whose performance could be improved if necessary
			state.playtree.playnodes.forEach(playnode => {
				let playnodeFlowDataToUpsert = oldFlownodes.find(flownode => {
					return flownode.id === playnode.id
				}) ?? makeNewPlaynodeFlowData(playnode.id)

				playnodeFlowDataToUpsert = {
					...playnodeFlowDataToUpsert,
					data: {
						...playnodeFlowDataToUpsert.data,
						playnode: {...playnode},
						playscopes: state.playtree.playscopes,
						playroot: state.playtree.playroots.get(playnode.id) ?? null,
						playscopeComparator: playscopeComparator
					}
				}

				upsertedAndFilteredPlaynodeFlowData.push(playnodeFlowDataToUpsert)
			})
			return upsertedAndFilteredPlaynodeFlowData
		})

		// synchronize flowedges
		setFlowedges(oldFlowedges => {
			// upsert
			const upsertedAndFilteredPlayedgeFlowData : PlayedgeFlowData[] = []
			state.playtree.playnodes.forEach(playnode => {
				playnode.next?.forEach(playedge => {
					const playedgeFlowDataToUpsert : PlayedgeFlowData = oldFlowedges.find(flowedge => {
						return flowedge.id === `${playnode.id}-${playedge.targetID}`
					}) ?? makeNewPlayedgeFlowData(playnode, playedge)

					if (playedgeFlowDataToUpsert.data) { // checking for typescript compiler
						playedgeFlowDataToUpsert.data = {
							...playedgeFlowDataToUpsert.data,
							playedge: playedge
						}
					}

					upsertedAndFilteredPlayedgeFlowData.push(playedgeFlowDataToUpsert)
				})
			})
			return upsertedAndFilteredPlayedgeFlowData
		})
	}, [state.playtree, playscopeComparator])

	const handleManageScopes = useCallback(() => {
		setScopeManagerVisible(!scopeManagerVisible)
	}, [scopeManagerVisible])

	const generateWarnings = useCallback(() => {
		const warnings: string[] = []
		if (state.playtree.playroots.size == 0) {
			warnings.push("Saved playtree has no playroots. You won't be able to play any music until you attach a playhead.")
		}
		return warnings
	}, [state.playtree.playroots])

	const handleSave = useCallback(() => {
		(async () => {
			try {
				console.log(jsonFromPlaytree(state.playtree))
				const response = await fetch(`http://localhost:8080/playtrees/${state.playtree.summary.id}`, {
					method: "PUT",
					body: JSON.stringify(jsonFromPlaytree(state.playtree))
				})

				if (response.ok) {
					dispatch({ type: "saved_playtree" })
					const warningsGenerated = generateWarnings();
					if (warningsGenerated.length === 0) {
						dispatch({ type: "logged_message", message: { type: "success", message: "Playtree saved successfully." } })
					} else {
						dispatch({ type: "logged_message", message: { type: "warning", message: "Playtree saved with the following warnings:" } })
						warningsGenerated.forEach(warning => {
							dispatch({ type: "logged_message", message: { type: "warning", message: warning } })
						})
					}
				} else {
					const errorMessage = await response.text()
					dispatch({ type: "logged_message", message: { type: "error", message: errorMessage } })
				}
			} catch (error: unknown) {
				if (error instanceof Error) {
					dispatch({ type: "logged_message", message: { type: "error", message: "Save failed: " + error.message } })
				} else {
					throw error
				}
			} finally {

			}
		})()


	}, [state.playtree])

	const handleDragStart = useCallback((event: any) => {
		if (event && event.target) {
			event.dataTransfer.setData("index", state.playtree.playroots.size)
		}
	}, [])

	return (
		<div className="font-lilitaOne w-5/6 m-auto h-[calc(100vh-15.25rem)]">
			<h2 className="w-full text-3xl text-green-600 mt-12">{state.playtree.summary.name}</h2>
			<div className="h-[calc(100%-8rem)] flex">
				<div className="h-full w-full flex-[4] border-4 border-green-600 bg-neutral-100">
					<button title="Add Playnode" className="z-10 absolute rounded-lg bg-green-400 mx-1 my-1 px-2 py-1" onClick={handleAddPlaynode}>➕</button>
					<button id="playhead-spawner" title="Add Playhead" className="z-10 absolute rounded-lg bg-purple-300 mx-1 my-10 px-2 py-1" draggable={true} onDragStart={handleDragStart}>💽</button>
					<button title="Manage Scopes" className="z-10 absolute rounded-lg bg-blue-400 mx-1 my-[4.75rem] px-2 py-1" onClick={handleManageScopes}>🔲</button>
					{
						state.unsavedChangesExist ?
							<button type="button" title="Save Changes" className="z-10 absolute rounded-lg bg-neutral-400 mx-1 my-28 px-2 py-1" onClick={handleSave}>💾</button> :
							null
					}
					<ReactFlow
						nodeTypes={customFlowNodeTypes}
						nodes={flownodes}
						onNodesChange={onFlownodesChange}
						edgeTypes={customFlowEdgeTypes}
						edges={flowedges}
						onEdgesChange={onFlowedgesChange}
						connectionLineComponent={PlayConnectionLine}
						onConnect={onConnect}
					>
						<Background />
						<Controls />
					</ReactFlow>
					{
						scopeManagerVisible ? <ScopeManager scopes={state.playtree.playscopes} dispatch={dispatch}/> : null
					}
				</div>
				<div className="border-green-600 bg-neutral-50 border-r-4 border-t-4 border-b-4 w-full flex-[1] h-full overflow-y-auto flex flex-col-reverse">
					<ul className="font-markazi">
						{
							state.messageLog.map((message, index) => {
								const color = message.type === "error" ? "red" : message.type === "warning" ? "amber" : "green";
								const emoji = message.type === "error" ? <>🛑</> : message.type === "warning" ? <>⚠️</> : <>✅</>;
								return <li key={index} className={`bg-${color}-200 text-${color}-500 pl-2 pt-1`}>{emoji} {` `} {message.message}</li>
							})
						}
					</ul>
				</div>
			</div>
		</div>
	)
}
