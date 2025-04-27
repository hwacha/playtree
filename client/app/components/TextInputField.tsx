import { useCallback, useRef, useState } from "react";

type TextInputFieldProps = {
	value: string;
	onCommit: (s: string) => void;
    className: string;
}

const TextInputField = (props: TextInputFieldProps) => {
    const [text, setText] = useState<string>(props.value)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setText(event.target.value)
    }, [text])

    const commitInput = useCallback(() => {
        props.onCommit(text)
    }, [text])

    const cancelInput = useCallback(() => {
        setText(props.value)
    }, [])

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

    const handleFocusExit = () => {
        if (!manuallyBlurred) {
            cancelInput()
        }
    }

    return (
        <input id="text" ref={inputRef} name="text" title={text} value={text} onChange={handleChange} onBlur={handleFocusExit} onKeyDown={handleKeyDown} className={props.className + (" bg-inherit focus:bg-white")} />
    )
}

export default TextInputField
