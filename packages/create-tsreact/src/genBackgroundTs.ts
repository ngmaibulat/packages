//MV3 service worker. It is not a persistent background page: Chrome stops it
//when idle and restarts it on the next event, so keep state in chrome.storage
//rather than in module scope.
//
//Note: this runs in a ServiceWorkerGlobalScope, but tsconfig.json declares the
//DOM lib for the popup's sake, so TypeScript types `self` as a Window here.
export default function genBackgroundTs(name: string) {
    const tpl = `
chrome.runtime.onInstalled.addListener(() => {
    console.log("${name}: installed");
});

chrome.runtime.onMessage.addListener((msg, sender) => {
    console.log("${name}: message", msg, "from tab", sender.tab?.id);
});
`;

    return tpl;
}
