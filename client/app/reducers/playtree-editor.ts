import { rgbToHex } from "@opentf/std";
import { PlayEdge, PlayheadInfo, PlayNode, Playscope, Playtree } from "../types"

export type LogMessage = {
	type: "error" | "warning" | "success";
	message: string;
}

export type PlaytreeEditorState = {
    playtree: Playtree,
    unsavedChangesExist: boolean,
    messageLog: LogMessage[],
}

export type PlaytreeEditorAction = {
    type: "loaded_playtree",
    playtree: Playtree
} | {
    type: "added_playnode" | "saved_playtree" | "added_playscope",
} | {
    type: "updated_playnode",
    nodeID: string,
    patch: Partial<Omit<PlayNode, 'id' | 'next'>>
} | {
    type: "deleted_playnode",
    nodeID: string
} | {
    type: "added_playedge" | "deleted_playedge",
    sourceID: string,
    targetID: string
} | {
    type: "updated_playedge",
    sourceID: string,
    targetID: string,
    patch: Partial<Omit<PlayEdge, 'nodeID'>>
} | {
    type: "added_playhead",
    nodeID: string
} | {
    type: "updated_playhead",
    nodeID: string,
    patch: Partial<Omit<PlayheadInfo, 'nodeID'>>
} | {
    type: "deleted_playhead",
    nodeID: string,
} | {
    type: "logged_message",
    message: LogMessage,
} | {
    type: "updated_playscope",
    index: number,
    patch: Partial<Playscope>
} | {
    type: "deleted_playscope",
    index: number
} | {
    type: "added_scope_to_playnode",
    index: number,
    nodeID: string
}

const playtreeReducer = (state: PlaytreeEditorState, action: PlaytreeEditorAction): PlaytreeEditorState => {
    const unsavedChangeOccurred = !["loaded_playtree", "saved_playtree", "logged_message"].includes(action.type)
    switch (action.type) {
        case "loaded_playtree": {
            return {
                ...state,
                playtree: action.playtree,
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "saved_playtree": {
            return {
                ...state,
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "added_playnode": {
            let maxValue = -1
            state.playtree.nodes.forEach((_, id) => {
                const x = parseInt(id)
                if (maxValue < x) {
                    maxValue = x
                }
            })
            const newPlaynode: PlayNode = {
                id: (maxValue + 1).toString(),
                name: "Playnode",
                type: "sequence",
                repeat: -1,
                scopes: [],
                content: [],
                next: []
            }
            const newPlaynodes = structuredClone(state.playtree.nodes)
            newPlaynodes.set(newPlaynode.id, newPlaynode)
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    nodes: newPlaynodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "updated_playnode": {
            const newNodes = structuredClone(state.playtree.nodes)
            let newPlaynode = newNodes.get(action.nodeID)
            if (newPlaynode) {
                newPlaynode = Object.assign(newPlaynode, action.patch)
                newNodes.set(action.nodeID, newPlaynode)
            }
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    nodes: newNodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "deleted_playnode": {
            let newNodes = structuredClone(state.playtree.nodes)
            newNodes.delete(action.nodeID)
            Array.from(newNodes.values()).forEach(node => {
                newNodes.set(node.id, {
                    ...node,
                    next: node.next.filter(playedge => playedge.nodeID !== action.nodeID)
                })
            })
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    nodes: newNodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "added_playedge": {
            const newNodes = structuredClone(state.playtree.nodes)
            const sourceNode = newNodes.get(action.sourceID)

            if (sourceNode) {
                if (!sourceNode.next) {
                    sourceNode.next = []
                }
                sourceNode.next.push({
                    nodeID: action.targetID,
                    shares: 1,
                    priority: 0,
                    repeat: -1,
                })
                return {
                    ...state,
                    playtree: {
                        ...state.playtree,
                        nodes: newNodes
                    },
                    unsavedChangesExist: unsavedChangeOccurred,
                }
            }

            return state
        }
        case "updated_playedge": {
            const newNodes = structuredClone(state.playtree.nodes)
            const sourceNode = newNodes.get(action.sourceID)

            if (sourceNode && sourceNode.next) {
                const playedgeIndex = sourceNode.next.findIndex(playedge => playedge.nodeID === action.targetID)
                const playedge = sourceNode.next[playedgeIndex]
                if (playedgeIndex !== -1) {
                    sourceNode.next.splice(playedgeIndex, 1, Object.assign(playedge, action.patch))
                    return {
                        ...state,
                        playtree: {
                            ...state.playtree,
                            nodes: newNodes
                        },
                        unsavedChangesExist: unsavedChangeOccurred
                    }
                }
            }
            return state
        }
        case "deleted_playedge": {
            const newNodes = structuredClone(state.playtree.nodes)
            const sourceNode = newNodes.get(action.sourceID)

            if (sourceNode && sourceNode.next) {
                const playedgeIndex = sourceNode.next.findIndex(playedge => playedge.nodeID === action.targetID)
                if (playedgeIndex !== -1) {
                    sourceNode.next.splice(playedgeIndex, 1)
                    return {
                        ...state,
                        playtree: {
                            ...state.playtree,
                            nodes: newNodes
                        },
                        unsavedChangesExist: unsavedChangeOccurred
                    }
                }
            }
            return state
        }
        case "added_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            const newPlayhead: PlayheadInfo = {
                index: state.playtree.playroots.size,
                name: "Playhead",
            }
            newPlayroots.set(action.nodeID, newPlayhead)
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "updated_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            const playroot = newPlayroots.get(action.nodeID)
            if (playroot) {
                const newPlayroot = Object.assign(playroot, action.patch)
                newPlayroots.set(action.nodeID, newPlayroot)
            }
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "deleted_playhead": {
            const newPlayroots = structuredClone(state.playtree.playroots)
            newPlayroots.delete(action.nodeID)
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playroots: newPlayroots
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "logged_message": {
            const newMessageLog = [...state.messageLog]
            newMessageLog.push(action.message)
            return {
                ...state,
                messageLog: newMessageLog,
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "added_playscope": {
            const newPlayscopes = [...state.playtree.playscopes]
            const index = newPlayscopes.length
            const defaultColor = rgbToHex([255 * ((index & 4) >> 2), 255 * ((index & 2) >> 1), 255 * (index & 1)])
            newPlayscopes.push({name: "Scope " + (index + 1), color: defaultColor})
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playscopes: newPlayscopes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "updated_playscope": {
            const newPlayscopes = [...state.playtree.playscopes]
            Object.assign(newPlayscopes[action.index], action.patch)
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playscopes: newPlayscopes,
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "deleted_playscope": {
            const newPlayscopes = [...state.playtree.playscopes]
            newPlayscopes.splice(action.index, 1)
            const newNodes = structuredClone(state.playtree.nodes)
            newNodes.forEach(node => {
                node.scopes = node.scopes.filter(scope => scope !== action.index).map(scope => {
                    return scope >= action.index ? scope + 1 : scope
                })
            })
            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    playscopes: newPlayscopes,
                    nodes: newNodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
        case "added_scope_to_playnode": {
            const nodesByScope = new Map<number, string>()
            state.playtree.nodes.forEach(node => {
                node.scopes.forEach(scopeID => {
                    if (!nodesByScope.has(scopeID)) {
                        nodesByScope.set(scopeID, node.id)
                    }
                })
            })

            const newNodes = structuredClone(state.playtree.nodes)
            newNodes.get(action.nodeID)?.scopes.push(action.index)

            return {
                ...state,
                playtree: {
                    ...state.playtree,
                    nodes: newNodes
                },
                unsavedChangesExist: unsavedChangeOccurred
            }
        }
    }
}

export { playtreeReducer }
