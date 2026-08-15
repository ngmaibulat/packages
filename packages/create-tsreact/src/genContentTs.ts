//Runs in the page, in an isolated world: it shares the DOM but not the page's
//JS. Which pages it runs on is set by "matches" in manifest.json.
export default function genContentTs(name: string) {
    const tpl = `
console.log("${name}: content script running on", location.hostname);

//content scripts talk to the service worker over messages
chrome.runtime.sendMessage({ type: "pageview", url: location.href });
`;

    return tpl;
}
