import test from "node:test";
import assert from "node:assert/strict";

import { getInterface, getInterfaces, mapType, typeByRef } from "@/types";

test("typeByRef takes the last segment of a JSON pointer", () => {
    assert.equal(typeByRef("#/components/schemas/Pet"), "Pet");
    assert.equal(typeByRef("Pet"), "Pet");
});

test("typeByRef answers empty for a missing ref", () => {
    assert.equal(typeByRef(undefined), "");
    assert.equal(typeByRef(""), "");
});

test("mapType maps the OpenAPI primitives", () => {
    assert.equal(mapType("integer"), "number");
    assert.equal(mapType("number"), "number");
    assert.equal(mapType("string"), "string");
    assert.equal(mapType("boolean"), "boolean");
});

test("mapType falls back to any", () => {
    assert.equal(mapType("object"), "any");
    assert.equal(mapType(undefined), "any");
});

test("getInterface renders primitive properties", () => {
    const code = getInterface("Owner", {
        id: { type: "integer" },
        email: { type: "string" },
    });

    assert.equal(
        code,
        ["export interface Owner {", "    id: number;", "    email: string;", "}", ""].join(
            "\n"
        )
    );
});

test("getInterface resolves a $ref to its type name", () => {
    const code = getInterface("Pet", {
        owner: { $ref: "#/components/schemas/Owner" },
    });

    assert.match(code, /owner: Owner;/);
});

test("getInterface renders an array of primitives", () => {
    const code = getInterface("Pet", {
        tags: { type: "array", items: { type: "string" } },
    });

    assert.match(code, /tags: Array<string>;/);
});

test("getInterface renders an array of $ref as the referenced type", () => {
    // The original ran the referenced name through the primitive mapping,
    // which turned every Array<Pet> into Array<any>.
    const code = getInterface("PetList", {
        items: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
    });

    assert.match(code, /items: Array<Pet>;/);
});

test("getInterface falls back to any for a property with no type or ref", () => {
    const code = getInterface("Pet", { metadata: {} });

    assert.match(code, /metadata: any;/);
});

test("getInterface renders an empty body for a schema with no properties", () => {
    assert.equal(getInterface("Empty"), "export interface Empty {\n}\n");
});

test("getInterfaces renders every schema in the document", () => {
    const code = getInterfaces({
        components: {
            schemas: {
                Owner: { properties: { id: { type: "integer" } } },
                Pet: { properties: { name: { type: "string" } } },
            },
        },
    });

    assert.match(code, /export interface Owner \{/);
    assert.match(code, /export interface Pet \{/);
});

test("getInterfaces answers empty for a document with no schemas", () => {
    assert.equal(getInterfaces({}), "");
    assert.equal(getInterfaces({ components: {} }), "");
});
