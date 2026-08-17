const messages = {
    AbortError:
        "A request was aborted, for example through a call to IDBTransaction.abort.",
    ConstraintError:
        "A mutation operation in the transaction failed because a constraint was not satisfied. For example, an object such as an object store or index already exists and a request attempted to create a new one.",
    DataCloneError:
        "The data being stored could not be cloned by the internal structured cloning algorithm.",
    DataError: "Data provided to an operation does not meet requirements.",
    InvalidAccessError:
        "An invalid operation was performed on an object. For example transaction creation attempt was made, but an empty scope was provided.",
    InvalidStateError:
        "An operation was called on an object on which it is not allowed or at a time when it is not allowed. Also occurs if a request is made on a source object that has been deleted or removed. Use TransactionInactiveError or ReadOnlyError when possible, as they are more specific variations of InvalidStateError.",
    NotFoundError:
        "The operation failed because the requested database object could not be found. For example, an object store did not exist but was being opened.",
    ReadOnlyError:
        'The mutating operation was attempted in a "readonly" transaction.',
    TransactionInactiveError:
        "A request was placed against a transaction which is currently not active, or which is finished.",
    SyntaxError: "The keypath argument contains an invalid key path",
    VersionError:
        "An attempt was made to open a database using a lower version than the existing version.",
};

// These are real DOMException subclasses, so `code` comes from the base class:
// passing the legacy name to `super()` gives the right value (11 for
// InvalidStateError, 12 for SyntaxError, 0 for the names without a legacy
// code). An earlier version also defined `code` as an own enumerable property
// on four of the classes, which made those four look different from the other
// seven (`Object.keys(err)` was `["code"]`) for no change in the value.

export class AbortError extends DOMException {
    constructor(message = messages.AbortError) {
        super(message, "AbortError");
    }
}

export class ConstraintError extends DOMException {
    constructor(message = messages.ConstraintError) {
        super(message, "ConstraintError");
    }
}

export class DataCloneError extends DOMException {
    constructor(message = messages.DataCloneError) {
        super(message, "DataCloneError");
    }
}

export class DataError extends DOMException {
    constructor(message = messages.DataError) {
        super(message, "DataError");
    }
}

export class InvalidAccessError extends DOMException {
    constructor(message = messages.InvalidAccessError) {
        super(message, "InvalidAccessError");
    }
}

export class InvalidStateError extends DOMException {
    constructor(message = messages.InvalidStateError) {
        super(message, "InvalidStateError");
    }
}

export class NotFoundError extends DOMException {
    constructor(message = messages.NotFoundError) {
        super(message, "NotFoundError");
    }
}

export class ReadOnlyError extends DOMException {
    constructor(message = messages.ReadOnlyError) {
        super(message, "ReadOnlyError");
    }
}

export class SyntaxError extends DOMException {
    constructor(message = messages.SyntaxError) {
        super(message, "SyntaxError");
    }
}

export class TransactionInactiveError extends DOMException {
    constructor(message = messages.TransactionInactiveError) {
        super(message, "TransactionInactiveError");
    }
}

export class VersionError extends DOMException {
    constructor(message = messages.VersionError) {
        super(message, "VersionError");
    }
}
