#!/bin/bash

# Entry point for both `pnpm test` and `npx @aibulat/funtest`.
#
# From a clone, Node runs the TypeScript sources directly via type stripping.
# A published install instead runs the compiled dist/, because Node refuses to
# strip types for files under node_modules.

set -e

# every package manager installs the bin as a symlink in node_modules/.bin, so
# $0 has to be resolved back to the real file before locating the package root
target="$0"
while [ -L "$target" ]; do
    link="$(readlink "$target")"
    case "$link" in
        /*) target="$link" ;;
        *) target="$(dirname "$target")/$link" ;;
    esac
done

cd "$(dirname "$target")/.."

if [ "$#" -gt 0 ]; then
    exec node --test "$@"
fi

shopt -s nullglob

tests=(dist/*.test.js)

if [ ${#tests[@]} -eq 0 ]; then
    tests=(src/*.test.ts)
fi

if [ ${#tests[@]} -eq 0 ]; then
    echo "funtest: no test files found in dist/ or src/" >&2
    exit 1
fi

# paths are passed explicitly rather than as a glob: Node's test runner skips
# anything under node_modules during discovery, which is where an install lives
exec node --test "${tests[@]}"
