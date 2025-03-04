import { ReactNode, useMemo } from "react"

type SnackProps = {
	type: "info" | "success" | "warning" | "error",
	body: ReactNode
}

export default function Snack(props: SnackProps) {
	const [color, symbol] = useMemo(() => {
		switch (props.type) {
			case "info": return ["blue", "ℹ️"]
			case "success": return ["green", "✅"]
			case "warning": return ["amber", "⚠️"]
			case "error": return ["red", "🛑"]
		}
	}, [props.type])

	return (
		<div className={`w-fit m-8 p-4 bg-${color}-200 rounded-lg font-markazi text-xl flex`}>
			<div className="mx-3 my-auto">{symbol}</div><div className="w-fit my-auto">{props.body}</div>
		</div>
	)
}