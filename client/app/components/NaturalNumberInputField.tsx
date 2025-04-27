import React, { useCallback, useMemo, useRef, useState } from "react"

type NaturalNumberInputFieldProps = {
	canBeInfinite: boolean;
	defaultValue: -1 | 0 | 1;
	value: number;
	onCommit: (n: number) => void;
}

const NaturalNumberInputField = (props: NaturalNumberInputFieldProps) => {
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

	const [text, setText] = useState<string>(specialValuesToOptions.get(props.value) ?? props.value.toString() ?? "")
	const [errorText, setErrorText] = useState<string | null>(null)

	const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setText(event.target.value)

		let newValue = specialOptionsToValues.get(event.target.value)

		if (newValue === undefined) {
			const newTextAsNumber = Number(event.target.value)
			if (Number.isInteger(newTextAsNumber) && newTextAsNumber >= 0) {
				newValue = newTextAsNumber
			}
		}

		if (newValue === undefined) {
			const specialOptionsCSL = Array.from(specialOptionsToValues.keys()).reduce((s1, s2) => s1 === "" ? s2 : s1 + ", " + s2, "")
			setErrorText(`Please enter a natural number${specialValuesToOptions.size > 0 ? ", or " : ""}${specialOptionsCSL}.`)
		} else {
			setErrorText(null)
		}
	}, [text, errorText])

	const inputRef = useRef<HTMLInputElement>(null)

	let manuallyBlurred = false
	const handleKeyDown = useCallback((event : React.KeyboardEvent<HTMLInputElement>) => {
		switch (event.key) {
			case "Enter":
				event.preventDefault()
				manuallyBlurred = true
				commitInput()
				inputRef.current?.blur()
				break
			case "Escape":
				event.preventDefault()
				manuallyBlurred = true
				cancelInput()
				inputRef.current?.blur()
				break
			default:
				return
		}
	}, [props.value, text])

	const cancelInput = useCallback(() => {
		setErrorText(null)
		setText(props.value.toString())
	}, [props.value, text])

	const commitInput = useCallback(() => {
		if (errorText === null) {
			let valueToCommit = specialOptionsToValues.get(text)
			if (!valueToCommit) {
				valueToCommit = Number(text)
			}
			if (props.value !== valueToCommit) {
				props.onCommit(valueToCommit)
			}
			setText(valueToCommit.toString())
			return true
		}

		setText(props.value.toString())
		setErrorText(null)
		return false
	}, [props.value, text])

	const handleFocusExit = (event : React.FocusEvent<HTMLInputElement>) => {
		if (!manuallyBlurred) {
			cancelInput()
		}
	}

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
				ref={inputRef}
				type="text"
				list="options"
				title={errorText ?? text}
				value={text}
				onChange={handleTextChange}
				onKeyDown={handleKeyDown}
				onBlur={handleFocusExit}
				className={`w-full text-right focus:bg-white bg-inherit ${errorText ? "text-red-600 line-through" : "" }`}
			/>
			{/* <datalist id="options">
				{
					Array.from(specialOptionsToValues.keys()).filter(key => key !== "").map(option => {
						return <option key={option}>{option}</option>
					})
				}
			</datalist> */}
		</div>

	)
}

export default NaturalNumberInputField