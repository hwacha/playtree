import { FormEventHandler, useEffect, useRef, useState } from "react";

type SearchFieldProps = {
    onContentSelect: (content: string) => boolean;
    onFocusOut: (event: FocusEvent) => void
}

export default function SearchField(props: SearchFieldProps) {
    const [query, setQuery] = useState<string>("")
    const [searchResults, setSearchResults] = useState<string[]>([])
    const [isQueryValidSelection, setIsQueryValidSelection] = useState<boolean>(false)

    const inputRef = useRef<HTMLInputElement>(null)
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.addEventListener("focusout", event => {
                props.onFocusOut(event)
            })
        }
    }, [])

    const onSearchQueryChange = (event : React.ChangeEvent<HTMLInputElement>) => {
        const newQuery = event.target.value
        setIsQueryValidSelection(searchResults.includes(newQuery))
        setQuery(newQuery)
    }

    const handleSubmit : FormEventHandler<HTMLFormElement> = event => {
        if (isQueryValidSelection) {
            if (props.onContentSelect(query)) {
                setQuery("")
                setSearchResults([])
                setIsQueryValidSelection(false)
            }
        }
        event.preventDefault()
        return false
    }



    useEffect(() => {
        if (query.length >= 2) {
            (async () => {
                const data = await fetch(`http://localhost:8081/search?q=${query}`)
                const searchResultsJSON : string[] = await data.json()
                setSearchResults(searchResultsJSON)
            })()
        } else if (searchResults.length > 0) {
            setSearchResults([])
        }
    }, [query])

    return (
        <form onSubmit={handleSubmit}>
            <input ref={inputRef} autoComplete="off" className="w-40 font-markazi text-black" list="spotify-search-suggestions" id="search-field" name="search-field" value={query} placeholder="Search for a song" onChange={onSearchQueryChange}/>
            <datalist id="spotify-search-suggestions">
                {
                    searchResults.map((searchResult, index) => {
                        return <option key={index} value={searchResult}/>
                    })
                }
            </datalist>
        </form>
    )
}