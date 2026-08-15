//An svg, not a png, because writeTree only writes text. Chrome wants raster
//icons for installability - see the note in genWebManifest.ts.
//
//viewBox is 512x512 so exporting to the sizes Chrome asks for is a one-liner.
export default function genIconSvg(name: string) {
    const initial = name.slice(0, 1).toUpperCase();

    const tpl = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" rx="96" fill="#111827"/>
    <text x="256" y="256" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="256"
          font-weight="700" text-anchor="middle" dominant-baseline="central">${initial}</text>
</svg>
`;

    return tpl;
}
