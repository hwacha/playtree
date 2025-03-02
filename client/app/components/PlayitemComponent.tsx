import { useState } from "react";
import { PlaytreeEditorAction } from "../reducers/playtree-editor";
import { Playitem } from "../types";

type PlayitemComponentProps = {
    nodeID: string;
    index: number;
    color: string;
    playitems: Playitem[];
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onDeleteSelf: (index: number) => () => void;
    onUpdatePlayitems: React.Dispatch<React.SetStateAction<Playitem[]>>;
    dispatch: (action: PlaytreeEditorAction) => void;
}

export default function PlayitemComponent(props: PlayitemComponentProps) {
    const [mult, setMult] = useState<string>(props.playitems[props.index].multiplier.toString())
    const [limit, setLimit] = useState<string>(props.playitems[props.index].limit.toString())
    const handleChangeMult = (event: React.ChangeEvent<HTMLInputElement>) => {
        let inputAsNumber = Number(event.target.value)
        if (event.target.value === "" || (Number.isInteger(inputAsNumber) && inputAsNumber >= 0)) {
            if (event.target.value === "") {
                inputAsNumber = 1
            }
            setMult(event.target.value)
            const newPlayitems = [...props.playitems]
            newPlayitems[props.index].multiplier = inputAsNumber
            props.onUpdatePlayitems(newPlayitems)
            props.dispatch({ type: "updated_playnode", nodeID: props.nodeID, patch: { playitems: newPlayitems } })
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
            setLimit(event.target.value)
            const newPlayitems = [...props.playitems]
            newPlayitems[props.index].limit = inputAsNumber
            props.onUpdatePlayitems(newPlayitems)
            props.dispatch({ type: "updated_playnode", nodeID: props.nodeID, patch: { playitems: newPlayitems } })
        }
    }
    return (
        <li key={props.playitems[props.index].id} className={`border border-${props.color}-600 bg-${props.color}-200 font-markazi flex`}>
            {props.onMoveUp ? <button className="w-fit ml-1" title="Move Content Up In List" onClick={props.onMoveUp}>⬆️</button> : <div className="ml-5" />}
            {props.onMoveDown ? <button className="w-fit ml-1" title="Move Content Down In List" onClick={props.onMoveDown}>⬇️</button> : <div className="ml-5" />}
            <span className="w-full ml-3">{props.playitems[props.index].name}</span>
            <input id="mult" name="mult" value={mult} onChange={handleChangeMult} className={`bg-${props.color}-200 w-6`} />
            <input id="limit" name="limit" value={limit} onChange={handleChangeRepeat} className={`bg-${props.color}-200 w-6`} />
            <button className="w-fit mr-1" title="Delete Content" onClick={props.onDeleteSelf(props.index)}>❌</button>
        </li>
    )
}
