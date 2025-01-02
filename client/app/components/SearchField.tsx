import { FormEventHandler, useEffect, useState } from "react";

type SearchFieldProps = {
    onContentSelect: (content: string) => boolean;
}

export default function SearchField(props: SearchFieldProps) {
    const [query, setQuery] = useState<string>("")
    const [searchResults, setSearchResults] = useState<string[]>([])
    const [isQueryValidSelection, setIsQueryValidSelection] = useState<boolean>(false)

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
            <input className="w-40" list="spotify-search-suggestions" id="search-field" name="search-field" value={query} placeholder="Search for a song" onChange={onSearchQueryChange}/>
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