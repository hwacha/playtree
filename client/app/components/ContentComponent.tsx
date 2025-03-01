import { useState } from "react";
import { PlaytreeEditorAction } from "../reducers/playtree-editor";
import { Content } from "../types";

type ContentProps = {
    nodeID: string;
    index: number;
    color: string;
    contentList: Content[];
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onDeleteSelf: (index: number) => () => void;
    onUpdateContentList: React.Dispatch<React.SetStateAction<Content[]>>;
    dispatch: (action: PlaytreeEditorAction) => void;
}

export default function ContentComponent(props: ContentProps) {
    const [mult, setMult] = useState<string>(props.contentList[props.index].mult.toString())
    const [repeat, setRepeat] = useState<string>(props.contentList[props.index].repeat.toString())
    const handleChangeMult = (event: React.ChangeEvent<HTMLInputElement>) => {
        let inputAsNumber = Number(event.target.value)
        if (event.target.value === "" || (Number.isInteger(inputAsNumber) && inputAsNumber >= 0)) {
            if (event.target.value === "") {
                inputAsNumber = 1
            }
            setMult(event.target.value)
            const newContentList = [...props.contentList]
            newContentList[props.index].mult = inputAsNumber
            props.onUpdateContentList(newContentList)
            props.dispatch({ type: "updated_playnode", nodeID: props.nodeID, patch: { content: newContentList } })
        }
    }
    const handleChangeRepeat = (event: React.ChangeEvent<HTMLInputElement>) => {
        let inputAsNumber = Number(event.target.value)
        if (event.target.value === "" || event.target.value === "-" || (Number.isInteger(inputAsNumber) && inputAsNumber >= -1)) {
            if (event.target.value === "") {
                inputAsNumber = 1
            } else if (event.target.value === "-") {
                inputAsNumber = -1
            }
            setRepeat(event.target.value)
            const newContentList = [...props.contentList]
            newContentList[props.index].repeat = inputAsNumber
            props.onUpdateContentList(newContentList)
            props.dispatch({ type: "updated_playnode", nodeID: props.nodeID, patch: { content: newContentList } })
        }
    }
    return (
        <li key={props.contentList[props.index].id} className={`border border-${props.color}-600 bg-${props.color}-200 font-markazi flex`}>
            {props.onMoveUp ? <button className="w-fit ml-1" title="Move Content Up In List" onClick={props.onMoveUp}>⬆️</button> : <div className="ml-5" />}
            {props.onMoveDown ? <button className="w-fit ml-1" title="Move Content Down In List" onClick={props.onMoveDown}>⬇️</button> : <div className="ml-5" />}
            <span className="w-full ml-3">{props.contentList[props.index].name}</span>
            <input id="mult" name="mult" value={mult} onChange={handleChangeMult} className={`bg-${props.color}-200 w-6`} />
            <input id="repeat" name="repeat" value={repeat} onChange={handleChangeRepeat} className={`bg-${props.color}-200 w-6`} />
            <button className="w-fit mr-1" title="Delete Content" onClick={props.onDeleteSelf(props.index)}>❌</button>
        </li>
    )
}
