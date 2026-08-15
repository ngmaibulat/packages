/**
 * TypeScript interface generation from an OpenAPI document's
 * `components.schemas`.
 *
 * This is the published package's `utils.mjs` plus the driver half of
 * `bin/gen-ts-interfaces.mjs`, typed and made pure so it can be unit tested.
 */

/** One entry of a schema's `properties` map. Only the fields we act on. */
export interface SchemaProperty {
    type?: string;
    $ref?: string;
    items?: SchemaProperty;
}

export interface Schema {
    properties?: Record<string, SchemaProperty>;
}

/** The slice of an OpenAPI document this generator reads. */
export interface OpenApiDocument {
    components?: {
        schemas?: Record<string, Schema>;
    };
}

/**
 * The type name at the end of a JSON pointer.
 *
 * `#/components/schemas/Pet` -> `Pet`
 */
export function typeByRef(ref: string | undefined): string {
    if (!ref) {
        return "";
    }

    const parts = ref.split("/");

    return parts[parts.length - 1];
}

/**
 * OpenAPI primitive -> TypeScript primitive.
 *
 * The original mapping knew only `integer` and `string` and answered `any` for
 * everything else, which silently degraded every boolean and float in a spec.
 * `number` and `boolean` are added here; anything still unrecognised keeps the
 * original `any` fallback.
 */
export function mapType(type: string | undefined): string {
    const mapping: Record<string, string> = {
        integer: "number",
        number: "number",
        string: "string",
        boolean: "boolean",
    };

    if (type && type in mapping) {
        return mapping[type];
    }

    return "any";
}

/** The TypeScript type for a single property. */
function fieldType(params: SchemaProperty): string {
    if (!("type" in params) || params.type === undefined) {
        if (params.$ref) {
            return typeByRef(params.$ref);
        }

        return "any";
    }

    if (params.type === "array") {
        const items = params.items;

        // A $ref names a generated interface, so it is already a TypeScript
        // type. Only a bare `items.type` goes through the primitive mapping --
        // the original ran both through it, which turned every `Array<Pet>`
        // into `Array<any>`.
        if (items?.$ref) {
            return `Array<${typeByRef(items.$ref)}>`;
        }

        return `Array<${mapType(items?.type)}>`;
    }

    return mapType(params.type);
}

/** Render one `export interface` block. */
export function getInterface(
    name: string,
    properties: Record<string, SchemaProperty> = {}
): string {
    let fields = "";

    for (const [field, params] of Object.entries(properties)) {
        fields += `\n    ${field}: ${fieldType(params)};`;
    }

    return `export interface ${name} {${fields}\n}\n`;
}

/** Render an interface for every schema in `components.schemas`. */
export function getInterfaces(doc: OpenApiDocument): string {
    const schemas = doc.components?.schemas;

    if (!schemas) {
        return "";
    }

    const blocks: string[] = [];

    for (const [entity, schema] of Object.entries(schemas)) {
        blocks.push(getInterface(entity, schema.properties));
    }

    return blocks.join("\n");
}
