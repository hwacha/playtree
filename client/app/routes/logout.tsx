import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { destroySession, getSession } from "../sessions";

export async function action({
	request
}: ActionFunctionArgs) {
	return redirect("/", {
		headers: {
			"Set-Cookie": await destroySession(await getSession(request.headers.get("Cookie")))
		}
	})
}
