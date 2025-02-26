import React, { useCallback, useState } from "react"

type NaturalNumberInputFieldProps = {
	onChange: (n: number) => void;
	canBeInfinite: boolean;
	defaultValue: 0 | 1;
	value: number;
}

const NaturalNumberInputField = (props: NaturalNumberInputFieldProps) => {
	const [text, setText] = useState<string | undefined>(undefined)
	const [errorText, setErrorText] = useState<string | null>(null)

	const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setText(event.target.value)
		const newTextAsNumber = Number(event.target.value)
		if (Number.isInteger(newTextAsNumber) && newTextAsNumber > 0) {
			props.onChange(newTextAsNumber)
			if (errorText !== null) {
				setErrorText(null)
			}
		} else if (event.target.value !== "") {
			setErrorText("Please enter a natural number (positive integer or 0).")
		}
	}

	const handleLimitCheckboxChange = (event : React.ChangeEvent<HTMLInputElement>) => {
		switch (event.target.value) {
			case "off": {
				if (text === undefined || errorText !== null) {
					props.onChange(props.defaultValue)
				} else {
					props.onChange(Number(text))
				}
				return
			}
			case "on": {
				props.onChange(-1)
				return
			}
			default: {
				return
			}
		}
	}

	const isUnlimited : boolean = props.value === -1
	return (
		<div className="flex w-full">
			{
				props.canBeInfinite ?
				<div className="flex items-start">
					<input id="is-limited" type="checkbox" value={isUnlimited ? "off" : "on"} checked={!isUnlimited} onChange={handleLimitCheckboxChange} />
					<label htmlFor={"is-limited"}>Limit</label>
				</div> : null
			}
			<div hidden={isUnlimited}>
				<input id="n" type="text" disabled={isUnlimited} value={text ?? props.value} defaultValue={props.defaultValue} onChange={handleTextChange} className="w-full text-right bg-inherit" />
				{errorText ? <label htmlFor="n" className="text-red-600">{errorText}</label> : null}
			</div>
		</div>

	)
}

export default NaturalNumberInputField