import { ActionFunctionArgs, json, LoaderFunctionArgs, redirect, replace } from "@remix-run/node";
import { useActionData, useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import invariant from "tiny-invariant";

export const action = async ({params}: ActionFunctionArgs) => {
    invariant(params.playtree, "Missing playtree ID parameter");
    await fetch(`http://localhost:8080/me/player?playtree=${params.playtree}`, {
        method: "PUT"
    })

    return redirect("/playtrees", {
        headers:  {
            "X-Remix-Reload-Document": "true"
        }
    })
}
