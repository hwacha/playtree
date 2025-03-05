import { useMemo, useRef, useState } from "react";
import { PlaytreeEditorAction } from "../reducers/editor";
import { Playscope } from "../types";

type PlayscopeManagerProps = {
	playscopes: Playscope[];
	dispatch: (action: PlaytreeEditorAction) => void;
	onExit: () => void;
}
export const PlayscopeManager = (props: PlayscopeManagerProps) => {
	const [colorCounter, setColorCounter]  = useState<number>(0)
	const colorSuggestion = useMemo(() => {
		const colors = [
			"#ffdd00",
			"#3f51b5",
			"#00bcd4",
			"#4caf50",
			"#ff6f61",
			"#9c27b0",
			"#673ab7",
			"#ff4081",
			"#2196f3",
			"#8bc34a",
			"#ba68c8",
			"#ffeb3b",
			"#009688",
			"#cddc39",
			"#f57f17",
			"#d84315",
			"#03a9f4",
			"#e91e63",
			"#1e88e5",
			"#aeea00",
		]
		return colors[colorCounter % colors.length]
	}, [colorCounter])

	return (
		<div className="absolute z-10 left-1/4 top-1/4 h-96 w-96 border-2 border-indigo-300 bg-indigo-100 rounded-lg overflow-hidden font-markazi p-4">
			<div className="max-h-64 overflow-y-auto">
				<table className="table-fixed w-full text-xl">
					<colgroup>
						<col className="w-2/3"></col>
						<col className="w-1/4"></col>
						<col className="w-1/12"></col>
					</colgroup>
					<thead><tr><th className="text-left" title="Playscope">Playscope</th><th title="Color">Color</th><th title="Delete Playscope">Del</th></tr></thead>
					<tbody>
						{
							props.playscopes.map((playscope, index) => {
								return (
									<tr key={index} className="group border-indigo-400">
										<td>
											<input
												className="w-full py-auto bg-inherit"
												title={playscope.name}
												value={playscope.name}
												onChange={e => props.dispatch({ type: "updated_playscope", index: index, patch: { name: e.target.value } })} />
										</td>
										<td>
											<div className="w-full flex justify-center">
												<input
													type="color"
													className="w-1/2 py-auto"
													title={playscope.color}
													value={playscope.color}
													onChange={e => props.dispatch({ type: "updated_playscope", index: index, patch: { color: e.target.value } })} />
											</div>
										</td>
										<td>
											<div className="w-full flex justify-center items-center">
												<button
													className="my-auto hidden group-hover:block"
													title={`Delete ${playscope.name}`}
													onClick={() => props.dispatch({ type: "deleted_playscope", index: index })}>❌</button>
											</div>
										</td>
									</tr>
								)
							})
						}
					</tbody>
				</table>
			</div>
			<div className="w-full flex justify-center">
				<button
					className="border-2 bg-indigo-300 border-none px-2 rounded-lg py-1 mt-4"
					onClick={() => {
						props.dispatch({ type: "added_playscope", color: colorSuggestion })
						setColorCounter(cc => cc + 1)
					}}>Add Scope</button>
			</div>
			<div className="absolute w-[calc(100%-2rem)] bottom-1 flex justify-center">
				<button
					onClick={props.onExit}
					className="w-fit border-2 border-slate-400 bg-slate-300 text-slate-600 rounded-lg px-2 py-1">
						Close
				</button>
			</div>
		</div>
	)
}
