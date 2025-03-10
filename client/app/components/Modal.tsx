import { useRef } from "react"
import { useClickOutside } from "../hooks/useClickOutside"

type ModalProps = {
	type: "normal" | "dangerous",
	description: string,
	exitAction: () => void,
	primaryAction?: {label: string, callback: () => void},
}

export default function Modal(props: ModalProps) {
	const ref = useRef<HTMLDivElement>(null)
	useClickOutside(ref, props.exitAction)

	const color = props.type === "normal" ? "blue" : "red"
	return (
		<div ref={ref} className={`absolute z-50 top-1/4 left-1/4 w-1/2 h-1/2 border-${color}-600 rounded-xl border-2 bg-${color}-200 font-markazi text-[24px] p-8`}>
			<div className="overflow-hidden h-full pb-4" title={props.description}>{props.description}</div>
			<div className="absolute bottom-0 w-[calc(100%-4rem)] h-fit flex justify-center">
				<div className="my-2">
					<button
						className={`border-slate-400 bg-slate-200 border-2 rounded-lg mx-[2px] px-2`}
						onClick={props.exitAction}>
							{props.primaryAction ? "Cancel" : "OK" }
					</button>
					{
						props.primaryAction ?
						<button
							className={`bg-${color}-600 border-${color}-600 text-white rounded-lg h-fit border-2 mx-[2px] px-2`}
							onClick={props.primaryAction.callback}>
							{props.primaryAction.label}
						</button>
						: null
					}
				</div>
			</div>
		</div>
	)
}
