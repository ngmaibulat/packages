//No inline script here, unlike the react template's index.html: MV3's default
//CSP is script-src 'self', which blocks inline <script> in extension pages.
//That also rules out the live-reload snippet - do not copy it in.
export default function genPopupHtml(name: string) {
    const tpl = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="popup.css">
    <title>${name}</title>
</head>
<body>
    <div id="app"></div>
    <script src="./popup.js"></script>
</body>
</html>
`;

    return tpl;
}
