import React, { useCallback, useMemo, useState } from "react"

type NaturalNumberInputFieldProps = {
	onChange: (n: number) => void;
	canBeInfinite: boolean;
	defaultValue: -1 | 0 | 1;
	value: number;
}

const NaturalNumberInputField = (props: NaturalNumberInputFieldProps) => {
	const [text, setText] = useState<string | null>(null)
	const [errorText, setErrorText] = useState<string | null>(null)

	const [specialOptionsToValues, specialValuesToOptions] : [Map<string, number>, Map<Number, string>] = useMemo(() => {
		const optionsToValues = new Map<string, number>()
		const valuesToOptions = new Map<number, string>()
		optionsToValues.set("", props.defaultValue)

		if (props.canBeInfinite) {
			optionsToValues.set("-1", -1)
			valuesToOptions.set(-1, "-1")
		}
		return [optionsToValues, valuesToOptions]
	}, [])

	const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setText(event.target.value)

		let newValue = specialOptionsToValues.get(event.target.value)

		if (newValue === undefined) {
			const newTextAsNumber = Number(event.target.value)
			if (Number.isInteger(newTextAsNumber) && newTextAsNumber > 0) {
				newValue = newTextAsNumber
			}
		}

		if (newValue === undefined) {
			setErrorText("Please enter a natural number (positive integer or 0).")
		} else {
			props.onChange(newValue)
			setErrorText(null)
		}
	}, [text, errorText])

	return (
		<div className="flex w-full">
			{/* <select>
				{
					Array.from(specialOptionsToValues.keys()).filter(key => key !== "").map(option => {
						return <option key={option}>{option}</option>
					})
				}
			</select> */}
			<input
				id="n"
				type="text"
				list="options"
				value={text ?? specialValuesToOptions.get(props.value) ?? props.value}
				onChange={handleTextChange}
				className="w-full text-right bg-inherit"
			/>
			{/* <datalist id="options">
				{
					Array.from(specialOptionsToValues.keys()).filter(key => key !== "").map(option => {
						return <option key={option}>{option}</option>
					})
				}
			</datalist> */}
			{errorText ? <label htmlFor="n" className="text-red-600 text-[6px]">{errorText}</label> : null}
		</div>

	)
}

export default NaturalNumberInputField