import encodePng from "./png.js";

//Chrome will not offer to install a PWA without raster icons, so these are
//drawn here rather than shipped as a checked-in blob - which would be the one
//binary asset in a repo whose whole premise is that templates are code.
//
//The pattern is derived from the app name rather than being random, so
//scaffolding the same name twice gives the same icon and a rebuild produces
//no diff. Different names get different colours and layouts.

//FNV-1a. Not cryptographic - it just needs to scatter similar names apart.
function hash(name: string) {
    let h = 2166136261;

    for (let i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return h >>> 0;
}

//FNV's low bits are its weakest, and "seed % 360" uses nothing else - which
//clusters most names into the reds. Mix first, then take the high bits.
function hue(seed: number) {
    return Math.floor(((Math.imul(seed, 2654435761) >>> 0) / 0x100000000) * 360);
}

//one well-mixed bit per grid cell, so neighbouring indexes are uncorrelated
function bitAt(seed: number, i: number) {
    const x = Math.imul(seed ^ Math.imul(i + 1, 0x9e3779b9), 0x85ebca6b);

    return (x >>> 13) & 1;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    const rgb: [number, number, number] =
        h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x];

    return [
        Math.round((rgb[0] + m) * 255),
        Math.round((rgb[1] + m) * 255),
        Math.round((rgb[2] + m) * 255),
    ];
}

//standard rounded-rectangle test: clamp the point into the inner rectangle
//and measure how far it had to move. r = 0 degenerates to a plain square.
function inside(x: number, y: number, dim: number, r: number) {
    const cx = Math.min(Math.max(x, r), dim - r);
    const cy = Math.min(Math.max(y, r), dim - r);
    const dx = x - cx;
    const dy = y - cy;

    return dx * dx + dy * dy <= r * r;
}

const GRID = 5;
const SS = 2; //supersampling factor, so the rounded corners are not jagged

export default function icon(name: string, size: number, maskable = false) {
    const seed = hash(name);
    const h = hue(seed);
    const fg = hsl(h, 0.72, 0.62);
    const bg = hsl(h, 0.45, 0.14);

    //a maskable icon is cropped to a circle by the launcher, so it bleeds to
    //the edges and keeps its content inside the 80% safe zone. A normal icon
    //is drawn as-is, so it gets the rounded corners itself.
    const dim = size * SS;
    const radius = maskable ? 0 : dim * 0.1875;
    const inset = Math.round(dim * (maskable ? 0.28 : 0.18));
    const cell = (dim - inset * 2) / GRID;

    //mirror the left two columns onto the right, which is what stops the
    //pattern reading as noise
    const cells: boolean[] = [];
    let filled = 0;

    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
            const mirrored = Math.min(col, GRID - 1 - col);
            const on = bitAt(seed, row * GRID + mirrored) === 1;

            cells.push(on);
            filled += on ? 1 : 0;
        }
    }

    //a name that happens to hash to an empty grid would render as a blank
    //square - fall back to the centre cell so there is always something
    if (filled === 0) {
        cells[Math.floor((GRID * GRID) / 2)] = true;
    }

    const big = Buffer.alloc(dim * dim * 4);

    for (let y = 0; y < dim; y++) {
        for (let x = 0; x < dim; x++) {
            const i = (y * dim + x) * 4;

            if (!inside(x + 0.5, y + 0.5, dim, radius)) {
                continue; //left transparent
            }

            const col = Math.floor((x - inset) / cell);
            const row = Math.floor((y - inset) / cell);

            const on = col >= 0 && col < GRID && row >= 0 && row < GRID && cells[row * GRID + col];

            const [r, g, b] = on ? fg : bg;

            big[i] = r;
            big[i + 1] = g;
            big[i + 2] = b;
            big[i + 3] = 255;
        }
    }

    //box-downsample the supersampled buffer
    const out = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;

            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const j = ((y * SS + sy) * dim + (x * SS + sx)) * 4;

                    r += big[j];
                    g += big[j + 1];
                    b += big[j + 2];
                    a += big[j + 3];
                }
            }

            const n = SS * SS;
            const i = (y * size + x) * 4;

            out[i] = Math.round(r / n);
            out[i + 1] = Math.round(g / n);
            out[i + 2] = Math.round(b / n);
            out[i + 3] = Math.round(a / n);
        }
    }

    return encodePng(size, out);
}
