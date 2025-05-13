import { LoaderFunctionArgs } from "@remix-run/node";
import { isRouteErrorResponse, useFetcher, useLoaderData, useRouteError, useSubmit } from "@remix-run/react";
import { Background, Controls, MarkerType, ReactFlow, addEdge, OnConnect, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider } from "@xyflow/react";
import '@xyflow/react/dist/style.css';
import { useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import invariant from "tiny-invariant";
import { jsonFromPlaytree, Playedge, Playnode, Playtree, playtreeFromJson } from "../types";
import Dagre from '@dagrejs/dagre';
import { PlaytreeEditorAction, playtreeReducer } from "../reducers/editor";
import PlaynodeComponent, { PlaynodeFlowData } from "../components/PlaynodeComponent";
import PlayedgeComponent, { PlayedgeFlowData } from "../components/PlayedgeComponent";
import { PlayConnectionLine } from "../components/PlayConnectionLine";
import { intersection, isSubsetOf, isSupersetOf } from "@opentf/std";
import { serverFetchWithToken } from "../utils/server-fetch-with-token.server";
import Snack from "../components/Snack";
import Modal from "../components/Modal";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import { PlayscopeManager } from "../components/PlayscopeManager";
import { ServerPath, Token } from "../root";
import PaneContextMenu from "../components/PaneContextMenu";
import PlaynodeContextMenu from "../components/PlaynodeContextMenu";
import PlayedgeContextMenu from "../components/PlayedgeContextMenu";
import TextInputField from "../components/TextInputField";

export const loader = async ({ request, params }: LoaderFunctionArgs) : Promise<Parameters<typeof playtreeFromJson>[0]> => {
	invariant(params.playtree)
	const response = await serverFetchWithToken(request, `${process.env.PLAYTREE_SERVER_API_PATH}/playtrees/${params.playtree}`)

	if (response.ok) {
		const playtreeJson = await response.json()
		if (!playtreeJson) {
			throw new Response("Internal Server Error", { status: 500 })
		}
		return playtreeJson
	} else if (response.status === 401) {
		throw new Response("Not Authenticated", { status: 401 })
	} else if (response.status === 403) {
		throw new Response("Permission Denied", { status: 403 })
	} else if (response.status === 404) {
		throw new Response("Not Found", { status: 404})
	} else {
		throw new Response("Internal Server Error", { status: 500})
	}
}

export function ErrorBoundary() {
	const error = useRouteError()
	let message: string = "Something went wrong."
	if (isRouteErrorResponse(error)) {
		switch (error.status) {
			case 401:
				message = "401 Authentication failed: try logging in again."
				break
			case 403:
				message = "403 Permission Denied: this isn't your playtree."
				break
			case 404:
				message = "404 Playtree not found."
				break
			case 500:
				message= "500 Internal Server Error: Something went wrong."
		}
	}

	return (
		<Snack type="error" body={<p className="text-white font-markazi text-lg">{message}</p>} />
	)
}

type AddNodeButtonProps = {
	onClick: (x: number, y: number) => void
}

const AddNodeButton = (props: AddNodeButtonProps) => {
	const reactFlowInstance = useReactFlow()

	const handleClick = useCallback(() => {
		const viewport = reactFlowInstance.getViewport()
		props.onClick((-viewport.x + 42) / viewport.zoom, (-viewport.y + 10) / viewport.zoom)
	}, [])

	return (
		<button
			title="Add Playnode"
			className="rounded-lg bg-green-400 px-2 py-1"
			onClick={handleClick}>➕</button>
	)
}

export default function PlaytreeEditor() {
	const customFlowNodeTypes = useMemo(() => ({ play: PlaynodeComponent }), []);
	const customFlowEdgeTypes = useMemo(() => ({ play: PlayedgeComponent }), []);

	const playtreeJson = useLoaderData<typeof loader>()

	const [state, dispatch] = useReducer<typeof playtreeReducer>(playtreeReducer, {
		playtree: playtreeFromJson(playtreeJson) as Playtree, // this is guaranteed from the loader
		unsavedChangesExist: false,
		messageLog: []
	})

	const playscopeComparator = useMemo(() => {
		if (!state.playtree) {
			return () => 0
		}
		const playnodesByPlayscope = new Map<number, Set<string>>()
		state.playtree.playscopes.forEach(playscope => {
			playnodesByPlayscope.set(playscope.id, new Set<string>())
		})
		state.playtree.playnodes.forEach((playnode) => {
			playnode.playscopes.forEach(playscopeID => {
				playnodesByPlayscope.get(playscopeID)?.add(playnode.id)
			})
		})
		return (a : number, b : number) : number => {
			const aNodes = playnodesByPlayscope.get(a) as Set<string>
			const bNodes = playnodesByPlayscope.get(b) as Set<string>
			const aSubsetOfB = isSubsetOf(aNodes, bNodes)
			const bSubsetOfA = isSubsetOf(bNodes, aNodes)
			if (aSubsetOfB && bSubsetOfA) {
				return 0
			}
			if (aSubsetOfB) {
				return -1
			}
			if (bSubsetOfA) {
				return 1
			}
			return 0
		}
	}, [state.playtree.playscopes, state.playtree.playnodes])

	const handleDeselectPlaynode = useCallback((playnodeID: string) => {
		setFlownodes(oldFlownodes => {
			const newFlownodes = [...oldFlownodes]
			const flownodeToDeselect = newFlownodes.find(flownode => flownode.id === playnodeID)
			if (flownodeToDeselect) {
				flownodeToDeselect.selected = false
			}
			return newFlownodes
		})
	}, []);

	let initialFlownodeData: PlaynodeFlowData[] = useMemo(() => {
		return Array.from(state.playtree.playnodes.values()).map((playnode, index) => {
			return {
				key: playnode.id,
				type: "play",
				id: playnode.id,
				label: playnode.name,
				position: { x: playnode.position.x, y: playnode.position.y },
				zIndex: 100 - index,
				data: {
					label: playnode.id,
					playnode: playnode,
					playroot: state.playtree?.playroots.get(playnode.id) ?? null,
					playscopes: state.playtree?.playscopes ?? [],
					dispatch: (x: PlaytreeEditorAction) => dispatch(x),
					playscopeComparator: playscopeComparator,
					onDeselect: handleDeselectPlaynode
				}
			}
		})
	}, [])

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
		state.playtree.playnodes.forEach(playnode => {
			if (playnode.next) {
				playnode.next.forEach(playedge => {
					initialFlowedgeData.push(makeNewPlayedgeFlowData(playnode, playedge))
				})
			}
		})

	const [flownodes, setFlownodes, onFlownodesChange] = useNodesState<PlaynodeFlowData>(initialFlownodeData)
	const [flowedges, setFlowedges, onFlowedgesChange] = useEdgesState<PlayedgeFlowData>(initialFlowedgeData)

	const handleAutolayoutGraph = useCallback(() => {
		const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
		g.setGraph({ rankdir: "TB", align: undefined, acyclicer: "greedy", ranker: "network-simplex" })
		flowedges.filter(edge => !state.playtree.playroots.has(edge.target)).forEach((edge) => g.setEdge(edge.source, edge.target));
		flownodes.forEach((node) =>
			g.setNode(node.id, {
				...node,
				width: node.measured?.width,
				height: node.measured?.height,
			}),
		);

		Dagre.layout(g);

		const newPositions = new Map<string, {x: number, y: number}>()
		flownodes.forEach((node) => {
			const position = g.node(node.id);
			// We are shifting the dagre node position (anchor=center center) to the top left
			// so it matches the React Flow node anchor point (top left).
			const x = position.x - (node.measured?.width ?? 0) / 2;
			const y = position.y - (node.measured?.height ?? 0) / 2;

			newPositions.set(node.id, {x: x, y: y})
		})

		dispatch({ type: "applied_autolayout", newPositions: newPositions})
		
		setFlowedges([...flowedges])
	}, [state.playtree.playroots, flownodes, flowedges])

	const onConnect: OnConnect = useCallback(connection => {
		const sourcePlaynode = state.playtree.playnodes.get(connection.source)
		if (sourcePlaynode) {
			const playedge = { targetID: connection.target, priority: 0, shares: 1, limit: -1 }
			setFlowedges((eds) => addEdge(makeNewPlayedgeFlowData(sourcePlaynode, playedge), eds))
			dispatch({ type: "added_playedge", sourceID: connection.source, targetID: connection.target })
		}
	}, [state.playtree.playnodes]);

	const makeNewPlaynodeFlowData = useCallback((id: string, x: number, y: number) : PlaynodeFlowData => {
		return {
			id: id,
			type: "play",
			position: { x: x, y: y },
			zIndex: 100 - parseInt(id),
			data: {
				playnode: {
					id: id,
					position: {
						x: x,
						y: y,
					},
					name: "Playnode",
					type: "sequencer",
					repeat: 1,
					limit: -1,
					playscopes: [],
					playitems: [],
					next: []
				},
				playscopes: state.playtree.playscopes,
				playroot: null,
				dispatch: (x: PlaytreeEditorAction) => dispatch(x),
				playscopeComparator: playscopeComparator,
				onDeselect: handleDeselectPlaynode
			}
		}
	}, [state.playtree])

	const handleAddPlaynode = useCallback((x : number, y: number) => {
		dispatch({ type: "added_playnode", x: x, y: y })
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
				}) ?? makeNewPlaynodeFlowData(playnode.id, playnode.position.x, playnode.position.y)
				
				playnodeFlowDataToUpsert = {
					...playnodeFlowDataToUpsert,
					position: {
						x: playnode.position.x,
						y: playnode.position.y,
					},
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

	const generateErrors = useCallback(() => {
		const errors: string[] = []
		const playnodesByPlayscopeIndex : Set<string>[] = state.playtree.playscopes.map(_ => new Set())

		state.playtree.playnodes.forEach(playnode => {
			playnode.playscopes.forEach(playscopeID => {
				playnodesByPlayscopeIndex[playscopeID].add(playnode.id)
			})
		})

		for (let i = 0; i < playnodesByPlayscopeIndex.length; i++) {
			const playnodeSetA = playnodesByPlayscopeIndex[i]
			const aHasAllNodes = playnodeSetA.size === state.playtree.playnodes.size && playnodeSetA.size > 0

			if (aHasAllNodes) {
				errors.push(`Redundant playscope: '${state.playtree.playscopes[i].name}' has every playnode, which is the same as the default scope.`)
			}

			for (let j = i + 1; j < playnodesByPlayscopeIndex.length; j++) {
				
				const playnodeSetB = playnodesByPlayscopeIndex[j]
				
				const aSupersetOfB = isSupersetOf(playnodeSetA, playnodeSetB)
				const bSupersetOfA = isSupersetOf(playnodeSetB, playnodeSetA)

				if (aSupersetOfB && bSupersetOfA) {
					if (playnodeSetA.size > 0) {
						// empty scopes will never be reached, and so they won't cause inconsistent reset behavior
						errors.push(`Redundant playscopes: '${state.playtree.playscopes[i].name}' and '${state.playtree.playscopes[j].name}' apply to the same set of nodes.`)
					}
				} else if (!(aSupersetOfB || bSupersetOfA) && intersection([Array.from(playnodeSetA), Array.from(playnodeSetB)]).length > 0) {
					errors.push(`Partially overlapping playscopes: '${state.playtree.playscopes[i].name}' and '${state.playtree.playscopes[j].name}' have nodes in common. This is only valid if one playscope's set of nodes is a strict subset of the other's.`)
				}
			}
		}

		return errors
	}, [state.playtree])

	const generateWarnings = useCallback(() => {
		const warnings: string[] = []
		if (state.playtree.playroots.size == 0) {
			warnings.push("Saved playtree has no playroots. You won't be able to play any music until you attach a playhead.")
		}
		return warnings
	}, [state.playtree.playroots])

	const serverPaths = useContext(ServerPath)
	const remixServerPath = serverPaths.remix ?? undefined
	const playtreeServerPath = serverPaths.playtree
	const token = useContext(Token)

	const handleSave = useCallback(() => {
		(async () => {
			try {
				const errors = generateErrors()

				if (errors.length > 0) {
					errors.forEach(error => {
						dispatch({ type: "logged_message", message: { type: "error", message: error } })
					})
					return
				}

				const response = await clientFetchWithToken(remixServerPath, token, `${playtreeServerPath}/playtrees/${state.playtree.summary.id}`, {
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
			}
		})()


	}, [state.playtree])

	const handleDragStart = useCallback((event: any) => {
		if (!state.playtree) {
			return
		}
		if (event && event.target) {
			event.dataTransfer.setData("index", state.playtree.playroots.size)
		}
	}, [])

	const fetcher = useFetcher({ key: "player" })
	const submit = useSubmit()

	const handleDelete = useCallback(() => {
		submit({}, {
			method: "POST",
			action: `/playtrees/${state.playtree.summary.id}/delete`
		})
	}, [])

	const [deleteModalOn, setDeleteModalOn] = useState<boolean>(false)
	const handleSetDeleteModalVisiblity = useCallback((on: boolean) => {
		setDeleteModalOn(_ => on)
	}, [])

	const [playscopeManagerVisible, setPlayscopeManagerVisible] = useState<boolean>(false)
	const handlePlayscopeManagerVisibility = useCallback((visible : boolean) => {
		return () => {
			setPlayscopeManagerVisible(_ => visible)
		}
	}, [])

	const [paneContextMenuPosition, setPaneContextMenuPosition] = useState<{x: number, y: number} | null>(null)
	const handleDisplayAndMovePaneContextMenu = useCallback((position: {x: number; y: number} | null) => {
		setPaneContextMenuPosition(position)
	}, [])

	type PlaynodeContextMenuState = {
		playnodeFlowData: PlaynodeFlowData;
		position: {
			x: number;
			y: number;
		};
	} | null;

	const [playnodeContextMenuState, setPlaynodeContextMenuState] = useState<PlaynodeContextMenuState>(null)
	const handleDisplayAndMovePlaynodeContextMenu = useCallback((menuState: PlaynodeContextMenuState) => {
		setPlaynodeContextMenuState(menuState)
	}, [])

	type PlayedgeContextMenuState = {
		playedgeFlowData: PlayedgeFlowData;
		position: {
			x: number;
			y: number;
		};
	} | null;

	const [playedgeContextMenuState, setPlayedgeContextMenuState] = useState<PlayedgeContextMenuState>(null)
	const handleDisplayAndMovePlayedgeContextMenu = useCallback((menuState: PlayedgeContextMenuState) => {
		setPlayedgeContextMenuState(menuState)
	}, [])

	return (
		<div className="w-5/6 h-full mx-auto font-lilitaOne flex flex-col justify-end">
			<div className="w-full h-[95%]">
				<div className="w-full h-fit flex justify-between">
					<div className="flex py-1">
						<fetcher.Form method="POST" action="/">
							<input type="hidden" id="playtreeID" name="playtreeID" value={state.playtree.summary.id} />
							<button type="submit" className="bg-green-300 font-markazi text-xl rounded-md px-2 py-1 mr-2">Play</button>
						</fetcher.Form>
						<h2 title={state.playtree.summary.name} className="max-w-[calc(70vw-18rem)] h-9 flex text-3xl text-green-600 resize-x">
							<TextInputField
								value={state.playtree.summary.name}
								onCommit={(s) => dispatch({ type: "updated_name", name: s})}
								className="whitespace-nowrap overflow-ellipsis overflow-hidden" />
						</h2>
					</div>
					<button
						type="button"
						className="bg-red-300 px-2 py-1 my-1 rounded-lg font-markazi text-xl"
						onClick={() => handleSetDeleteModalVisiblity(true)}
					>Delete</button>
				</div>
				{
					deleteModalOn ?
					<Modal
						type={"dangerous"}
						size="small"
						description={`Are you sure you want to delete the playtree '${state.playtree.summary.name}'?`}
						exitAction={() => handleSetDeleteModalVisiblity(false)}
						primaryAction={{ label: "Delete", callback: handleDelete }}
					/>
					: null
				}
				<ReactFlowProvider>
				<div className="h-[85%] flex">
					<PaneContextMenu position={paneContextMenuPosition} dispatch={dispatch} onExit={() => handleDisplayAndMovePaneContextMenu(null)} />
					<PlaynodeContextMenu
						playnodeFlowData={playnodeContextMenuState?.playnodeFlowData ?? null}
						position={playnodeContextMenuState?.position ?? null}
						dispatch={dispatch}
						onExit={() => handleDisplayAndMovePlaynodeContextMenu(null)}
					/>
					<PlayedgeContextMenu
						playedgeFlowData={playedgeContextMenuState?.playedgeFlowData ?? null}
						position={playedgeContextMenuState?.position ?? null}
						dispatch={dispatch}
						onExit={() => handleDisplayAndMovePlayedgeContextMenu(null)}
					/>

					<div className="h-full w-full flex-[4] border-4 border-green-600 bg-neutral-100">
						<div className="z-10 w-fit absolute m-1 gap-1 flex flex-col">
							<AddNodeButton onClick={handleAddPlaynode}/>
							<button
								id="playhead-spawner"
								title="Add Playhead"
								className="rounded-lg bg-purple-300 px-2 py-1 hover:cursor-grab"
								draggable={true}
								onDragStart={handleDragStart}>💽</button>
							<button
								title="Manage Scopes"
								className="rounded-lg bg-indigo-300 px-2 py-1"
								onClick={handlePlayscopeManagerVisibility(true)}>🔲</button>
							<button
								title="Auto-layout Graph"
								className="rounded-lg bg-sky-300 px-2 py-1"
								onClick={handleAutolayoutGraph}>🔄</button>
							{
								state.unsavedChangesExist ?
									<button
										type="button"
										title="Save Changes"
										className="rounded-lg bg-neutral-400 px-2 py-1"
										onClick={handleSave}>💾</button> :
									null
							}
						</div>
						<ReactFlow
							snapToGrid={true}
							snapGrid={[96, 96]}
							nodeTypes={customFlowNodeTypes}
							nodes={flownodes}
							onNodesChange={onFlownodesChange}
							edgeTypes={customFlowEdgeTypes}
							edges={flowedges}
							onEdgesChange={onFlowedgesChange}
							connectionLineComponent={PlayConnectionLine}
							onConnect={onConnect}
							deleteKeyCode={null}
							onPaneContextMenu={event => {
								event.preventDefault();
								handleDisplayAndMovePaneContextMenu({ x: event.clientX, y: event.clientY})
							}}
							onNodeContextMenu={(event, flownode) => {
								event.preventDefault();
								handleDisplayAndMovePlaynodeContextMenu({ playnodeFlowData: flownode, position: { x: event.clientX, y: event.clientY } })
							}}
							onEdgeContextMenu={(event, flowedge) => {
								event.preventDefault();
								handleDisplayAndMovePlayedgeContextMenu({ playedgeFlowData: flowedge, position: { x: event.clientX, y: event.clientY }})
							}}
						>
							<Background />
							<Controls />
						</ReactFlow>
						{
							playscopeManagerVisible ? <PlayscopeManager playscopes={state.playtree.playscopes ?? []} dispatch={dispatch} onExit={handlePlayscopeManagerVisibility(false)}/> : null
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
				</ReactFlowProvider>
			</div>
		</div>
	)
}
