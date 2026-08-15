export async function* loader1() {
    yield "one";
    yield "two";
}

export async function* loader2() {
    yield "one";
    yield "two";
}

export async function* stringLoader(inp: string[]) {
    for (const str of inp) {
        yield str;
    }
}
