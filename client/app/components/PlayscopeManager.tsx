import { PlaytreeEditorAction } from "../reducers/editor";
import { Playscope } from "../types";

type PlayscopeManagerProps = {
	playscopes: Playscope[];
	dispatch: (action: PlaytreeEditorAction) => void;
	onExit: () => void;

}
export const PlayscopeManager = (props: PlayscopeManagerProps) => {
	// TODO find a way to manage the following variables programmatically
	//      so they don't have to be hard-coded into the tailwind classes
	//      simply variable substitution means that tailind doesn't precompile,
	//      and it's unclear how to save these results in the tailwind config file
	// banner height: 4rem
	// sidebar width: 13.5rem
	// player height: 9rem
	// banner plus player height: 13 rem
	const anchorLeft = `left-[calc(13.5rem+0.125*(100%-13.5rem))]`
	const width = `w-[calc(0.5*(100%-13.5rem))]`
	const anchorTop = `top-[calc(4rem+0.25*(100%-13rem))]`
	const height = `h-[calc(0.5*(100%-13rem))]`
	
	return (
		<div className={`absolute z-10 ${anchorLeft} ${anchorTop} ${width} ${height} min-h-40 border-2 border-indigo-300 bg-indigo-100 rounded-lg overflow-hidden font-markazi p-4`}>
			<div className={`max-h-[calc(100%-5rem)] overflow-y-auto`}>
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
					onClick={() => { props.dispatch({ type: "added_playscope" }) }}>Add Scope</button>
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
