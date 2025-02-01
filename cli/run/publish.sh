#!/bin/bash

# esbuild does not bundle well: esm+nodejs+bundle
# either stick to CJS
# or use something else/don't bundle
# npx esbuild src/run.ts --bundle --outdir=dist --format=esm --platform=node --target=es2020

bun run build
bun run commit

npm version patch
npm publish

git push
