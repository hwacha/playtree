import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { destroySession, getSession } from "../utils/sessions";

export async function action({
	request
}: ActionFunctionArgs) {
	return redirect("/?just-tried=logout&first-visit=false", {
		headers: {
			"Set-Cookie": await destroySession(await getSession(request.headers.get("Cookie")))
		}
	})
}
