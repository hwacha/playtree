import { FormEventHandler, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SPOTIFY_SEARCH_API_PATH } from "../settings/spotify_api_endpoints";
import { clientFetchWithToken } from "../utils/client-fetch-with-token";
import { ServerPath, Token } from "../root";

type SearchFieldProps = {
	onContentSelect: (content: SearchResult) => boolean;
}

export type SearchResult = {
	uri: string | null;
	creatorURI: string | null;
	name: string;
	creator: string;
}

export const queryString: ((sr: SearchResult) => string) = sr => {
	if (sr.creator === "") {
		return sr.name
	} else {
		return `${sr.name} - ${sr.creator}`
	}
}

export default function SearchField(props: SearchFieldProps) {
	const [query, setQuery] = useState<SearchResult>({ uri: null, creatorURI: null, name: "", creator: "" })
	const [searchResults, setSearchResults] = useState<SearchResult[]>([])

	const onSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const newQueryString = event.target.value
		let newQuery: SearchResult = { uri: null, creatorURI: null, name: event.target.value, creator: "" }
		const matchingSearchResult = searchResults.find(sr => queryString(sr) === newQueryString)
		if (matchingSearchResult) {
			newQuery = matchingSearchResult
		}
		setQuery(newQuery)
	}

	const handleSubmit: FormEventHandler<HTMLFormElement> = event => {
		if (query.uri !== null) {
			if (props.onContentSelect(query)) {
				setQuery({ uri: null, creatorURI: null, name: "", creator: "" })
				setSearchResults([])
			}
		}
		event.preventDefault()
		return false
	}

	const remixServerPath = useContext(ServerPath).remix ?? undefined
	const token = useContext(Token)

	useEffect(() => {
		if (query.name.length >= 2) {
			(async () => {
				const data = await clientFetchWithToken(remixServerPath, token, SPOTIFY_SEARCH_API_PATH(query.name))
				const dataAsJSON = await data.json()
				const searchResultsJSON: SearchResult[] = dataAsJSON.tracks.items.map((item: any) => { return { uri: item.uri, creatorURI: item.artists[0].uri, name: item.name, creator: item.artists[0].name } })
				setSearchResults(searchResultsJSON)
			})()
		} else if (searchResults.length > 0) {
			setSearchResults([])
		}
	}, [query])

	const queryMatchesASearchResult = useMemo(() => {
		return searchResults.some(sr => queryString(sr) === queryString(query))
	}, [searchResults, query])

	return (
		<form onSubmit={handleSubmit} className="flex">
			<input
				autoComplete="off"
				className="w-full font-markazi text-black mr-1"
				list="spotify-search-suggestions"
				id="search-field"
				name="search-field"
				value={queryString(query)}
				placeholder={"Search for a song with Spotify"}
				onChange={onSearchQueryChange}
			/>
			<datalist id="spotify-search-suggestions">
				{
					searchResults.map((searchResult, index) => {
						const qs = queryString(searchResult)
						return <option key={index} title={qs} value={qs} />
					})
				}
			</datalist>
			<button
				type="submit"

				className={`rounded-lg px-2 ${queryMatchesASearchResult ? `bg-blue-200 text-blue-600` : "bg-neutral-300 text-neutral-500"} font-markazi ${queryMatchesASearchResult ? "" : "hover:cursor-not-allowed"}`}
				disabled={!queryMatchesASearchResult}
			>Add</button>
		</form>
	)
}