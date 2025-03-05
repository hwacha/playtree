export const getDeviceName = () => {
	const userAgent = navigator.userAgent;
	
	let browserName = "Unknown Browser"

	if (userAgent.includes('Firefox')) browserName = "Firefox";
	if (userAgent.includes('Chrome')) browserName = "Chrome";
	if (userAgent.includes('Safari')) browserName = "Safari";
	if (userAgent.includes('Edge')) browserName = "Edge";

	let platformName = "Unknown Platform"
	if (userAgent.includes('Win')) platformName = "Windows";
	if (userAgent.includes('Mac')) platformName = "macOS";
	if (userAgent.includes('Linux')) platformName = "Linux";
	if (userAgent.includes('Android')) platformName = "Android";
	if (userAgent.includes('iPhone')) platformName = "iOS";

	return browserName + " on " + platformName;
}
