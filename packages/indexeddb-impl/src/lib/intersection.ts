/**
 * `Set.prototype.intersection`, with a fallback for runtimes without it.
 *
 * Native since Node 22 and Bun 1.1, but the tsconfig `lib` here is ES2023 and
 * the method landed in ES2024, so it is not in the type surface we compile
 * against. The narrow local type is deliberate: widening `lib` to ES2024 to get
 * one method would also let unrelated newer APIs in without us noticing.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/intersection
 */
type SetWithIntersection<T> = Set<T> & {
    intersection(other: Set<T>): Set<T>;
};

function hasNativeIntersection<T>(set: Set<T>): set is SetWithIntersection<T> {
    return (
        typeof (set as Partial<SetWithIntersection<T>>).intersection ===
        "function"
    );
}

export function intersection<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    if (hasNativeIntersection(set1)) {
        return set1.intersection(set2);
    }
    return new Set([...set1].filter((item) => set2.has(item)));
}
