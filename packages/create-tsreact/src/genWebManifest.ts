//Chrome's installability check wants raster icons at 192x192 and 512x512, so
//those are generated (see src/png/) rather than left to the user. The
//svg is listed first for browsers that will take a vector.
//
//The maskable icon is a separate entry rather than "purpose": "any maskable"
//on one of the others: a maskable image carries ~20% padding so a launcher
//can crop it to any shape, which makes it look shrunken when used as-is.
//
//"id" defaults to start_url, but pinning it means start_url can change later
//without the browser treating it as a different application.
export default function genWebManifest(name: string) {
    const tpl = `
{
    "id": "/",
    "name": "${name}",
    "short_name": "${name}",
    "description": "Installable Typescript/React PWA",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#ffffff",
    "theme_color": "#111827",
    "icons": [
        {
            "src": "icon.svg",
            "sizes": "any",
            "type": "image/svg+xml"
        },
        {
            "src": "icon-192.png",
            "sizes": "192x192",
            "type": "image/png"
        },
        {
            "src": "icon-512.png",
            "sizes": "512x512",
            "type": "image/png"
        },
        {
            "src": "icon-maskable-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable"
        }
    ]
}
`;

    return tpl;
}
