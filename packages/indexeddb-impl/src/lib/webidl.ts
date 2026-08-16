// Making these classes look the way WebIDL says a platform interface looks.
//
// The implementation classes are named FDB* so they can coexist with the real
// IDB* globals when this package is loaded in a browser. That is an
// implementation detail, and WebIDL says the interface object's `name` is the
// interface's name -- so `IDBRequest.name` must be "IDBRequest", not
// "FDBRequest". It shows up in stack traces, in `constructor.name` checks and
// in every debugger, so it is worth getting right beyond the conformance tests.
//
// `length` is the number of required constructor arguments. Every interface in
// IndexedDB.idl except IDBVersionChangeEvent has no constructor at all, so
// their interface objects are length 0, while our classes report however many
// parameters they happen to take.
//
// See CONFORMANCE.md for the rest of the WebIDL fidelity work.

interface InterfaceShape {
    /** The interface name from IndexedDB.idl, e.g. "IDBRequest". */
    name: string;
    /** Required constructor arguments; 0 for an interface with no constructor. */
    length?: number;
    /**
     * Required argument counts for operations whose JS arity differs from the
     * IDL's.
     *
     * A WebIDL operation's `length` counts only its required arguments, but
     * `getAll(query?, count?)` compiles to two ordinary parameters and so
     * reports 2. Rather than give every optional parameter a default just to
     * move `Function.length`, the counts are declared here, transcribed from
     * IndexedDB.idl. Operations absent from the map keep their natural arity.
     */
    operations?: Record<string, number>;
}

type AnyCtor = new (...args: never[]) => unknown;

/**
 * Wrap an accessor so that it throws on anything that is not an instance.
 *
 * WebIDL getters do a brand check before touching internal state. A plain class
 * getter does not: reading it off the prototype, or off an unrelated object,
 * quietly returns whatever `this.<field>` happens to be — usually undefined.
 * `instanceof` rather than a private-field probe, so subclasses (an
 * IDBOpenDBRequest reading IDBRequest's `readyState`) still pass.
 */
function brandChecked(
    ctor: AnyCtor,
    original: (this: unknown, ...args: never[]) => unknown,
    interfaceName: string,
    property: string,
) {
    const wrapper = function (this: unknown, ...args: never[]) {
        if (!(this instanceof ctor)) {
            throw new TypeError(
                `Illegal invocation: ${interfaceName}.${property} called on an incompatible receiver`,
            );
        }
        return original.apply(this, args);
    };

    // Carry the original's identity across. A getter is named "get foo", and
    // idlharness asserts exactly that; `length` matters for the operations,
    // where it is the arity the IDL declares.
    Object.defineProperty(wrapper, "name", {
        value: original.name,
        configurable: true,
    });
    Object.defineProperty(wrapper, "length", {
        value: original.length,
        configurable: true,
    });

    return wrapper;
}

/** Set an operation's `length` to the IDL's required-argument count. */
function applyArity(fn: unknown, arity: number | undefined): void {
    if (arity === undefined || typeof fn !== "function") return;
    Object.defineProperty(fn, "length", {
        value: arity,
        writable: false,
        enumerable: false,
        configurable: true,
    });
}

/**
 * Give a constructor the shape WebIDL says its interface object and prototype
 * should have.
 *
 * Called once per class, right after the declaration. It fixes four things that
 * JS class syntax gets differently from WebIDL:
 *
 *   - `name` and `length` on the interface object. Both are own properties of a
 *     class constructor, non-writable but configurable, so they are redefined
 *     rather than assigned.
 *   - `@@toStringTag`, which WebIDL declares as a data property holding the
 *     interface name, not the getter a class body can express.
 *   - Enumerability. Class members are non-enumerable; WebIDL members are
 *     enumerable, and browsers behave that way.
 *   - Brand checks on accessors.
 *
 * Members whose name begins with `_` are this implementation's own and are
 * skipped: they stay non-enumerable and unwrapped.
 */
export function defineInterface(
    ctor: AnyCtor,
    { name, length = 0, operations = {} }: InterfaceShape,
): void {
    Object.defineProperty(ctor, "name", {
        value: name,
        writable: false,
        enumerable: false,
        configurable: true,
    });
    Object.defineProperty(ctor, "length", {
        value: length,
        writable: false,
        enumerable: false,
        configurable: true,
    });

    // A data property, per https://webidl.spec.whatwg.org/#dfn-class-string.
    // This also replaces any `get [Symbol.toStringTag]()` in the class body.
    Object.defineProperty(ctor.prototype, Symbol.toStringTag, {
        value: name,
        writable: false,
        enumerable: false,
        configurable: true,
    });

    for (const key of Object.getOwnPropertyNames(ctor.prototype)) {
        if (key === "constructor" || key.startsWith("_")) continue;

        const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, key);
        if (!descriptor?.configurable) continue;

        descriptor.enumerable = true;
        if (descriptor.get) {
            descriptor.get = brandChecked(ctor, descriptor.get, name, key);
        }
        if (descriptor.set) {
            descriptor.set = brandChecked(ctor, descriptor.set, name, key);
        }
        if (typeof descriptor.value === "function") {
            descriptor.value = brandChecked(ctor, descriptor.value, name, key);
            applyArity(descriptor.value, operations[key]);
        }
        Object.defineProperty(ctor.prototype, key, descriptor);
    }

    // Static operations -- IDBKeyRange.only and friends. They take no brand
    // check (they are not called on an instance), but WebIDL still wants them
    // enumerable.
    for (const key of Object.getOwnPropertyNames(ctor)) {
        if (
            key === "length" ||
            key === "name" ||
            key === "prototype" ||
            key.startsWith("_")
        ) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(ctor, key);
        if (!descriptor?.configurable || typeof descriptor.value !== "function")
            continue;
        applyArity(descriptor.value, operations[key]);
        Object.defineProperty(ctor, key, { ...descriptor, enumerable: true });
    }
}
