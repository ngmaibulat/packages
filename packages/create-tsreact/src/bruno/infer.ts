//Turns captured JSON into TypeScript source.
//
//Everything observed for one endpoint is merged into a single Shape before
//anything is rendered, which is what makes the output honest rather than a
//snapshot of whichever element happened to come first: a key missing from one
//array element becomes optional, a field that was once null becomes nullable,
//and a field that held both a string and a number becomes a union. An empty
//array contributes no element information at all, so it widens to unknown[]
//instead of pretending the array is empty forever.

type Prim = "string" | "number" | "boolean" | "null";

//rendered in this order regardless of the order they were observed in, so the
//emitted types do not churn when a sample is re-captured
const PRIMS: readonly Prim[] = ["string", "number", "boolean", "null"];

type Obj = {
    //how many objects were merged in - a field seen fewer times than this is
    //optional
    total: number;
    fields: Map<string, { shape: Shape; seen: number }>;
};

type Shape = {
    prims: Set<Prim>;
    //present once an array has been seen; holds the merge of every element of
    //every array seen, so an empty one leaves it empty and renders unknown[]
    array?: Shape;
    object?: Obj;
};

//deeply nested payloads produce types nobody reads and slow tsc down. Past
//this the shape is reported as unknown, which still compiles.
const MAX_DEPTH = 12;

function empty(): Shape {
    return { prims: new Set() };
}

function observe(shape: Shape, value: unknown, depth = 0) {
    if (depth > MAX_DEPTH) {
        return;
    }

    if (value === null) {
        shape.prims.add("null");
        return;
    }

    if (Array.isArray(value)) {
        shape.array ??= empty();
        for (const item of value) {
            observe(shape.array, item, depth + 1);
        }
        return;
    }

    if (typeof value === "object") {
        shape.object ??= { total: 0, fields: new Map() };
        shape.object.total++;

        for (const [key, item] of Object.entries(value)) {
            let field = shape.object.fields.get(key);
            if (!field) {
                field = { shape: empty(), seen: 0 };
                shape.object.fields.set(key, field);
            }
            field.seen++;
            observe(field.shape, item, depth + 1);
        }
        return;
    }

    if (typeof value === "string") {
        shape.prims.add("string");
    } else if (typeof value === "number") {
        shape.prims.add("number");
    } else if (typeof value === "boolean") {
        shape.prims.add("boolean");
    }
    //anything else cannot have come out of JSON.parse, so it contributes
    //nothing and the shape stays unknown
}

function ident(key: string) {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderObject(obj: Obj, indent: string): string {
    if (obj.fields.size === 0) {
        //{} in TypeScript means "anything but null", which is not what an
        //object with no observed keys should say
        return "Record<string, unknown>";
    }

    const inner = indent + "    ";
    const lines = [...obj.fields].map(([key, field]) => {
        const optional = field.seen < obj.total ? "?" : "";
        return `${inner}${ident(key)}${optional}: ${render(field.shape, inner)};`;
    });

    return `{\n${lines.join("\n")}\n${indent}}`;
}

//the parts are kept separate rather than joined early so that an array can
//tell whether its *own* element type is a union - a nested "string | null"
//inside an object field must not drag parentheses onto the outer []
function parts(shape: Shape, indent: string): string[] {
    const out: string[] = PRIMS.filter((p) => shape.prims.has(p));

    if (shape.array) {
        const inner = parts(shape.array, indent);
        const element = inner.length ? inner.join(" | ") : "unknown";
        out.push(inner.length > 1 ? `(${element})[]` : `${element}[]`);
    }

    if (shape.object) {
        out.push(renderObject(shape.object, indent));
    }

    return out;
}

function render(shape: Shape, indent = ""): string {
    const out = parts(shape, indent);
    return out.length ? out.join(" | ") : "unknown";
}

//the whole point of the module: every value observed for one endpoint in, one
//TypeScript type expression out
export function infer(values: unknown[], indent = ""): string {
    if (values.length === 0) {
        return "unknown";
    }

    const shape = empty();
    for (const value of values) {
        observe(shape, value, 0);
    }

    return render(shape, indent);
}
