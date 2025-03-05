import { ConnectionLineComponent, getBezierPath } from "@xyflow/react"
import { PlaynodeFlowData } from "./PlaynodeComponent"

export const PlayConnectionLine: ConnectionLineComponent<PlaynodeFlowData> = ({ fromX, fromY, toX, toY }) => {
	const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY })
	return (
		<g>
			<path
				fill="none"
				stroke="brown"
				strokeWidth={2}
				className="animated"
				d={path}
			>
			</path>
		</g>
	)
}
