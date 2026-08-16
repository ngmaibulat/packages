---
layout: home

hero:
    name: aibulat packages
    text: Small tools and libraries for Node
    tagline: A pnpm monorepo of command line utilities and libraries published to npm.
    actions:
        - theme: brand
          text: Get started with run
          link: /run/
        - theme: alt
          text: View on GitHub
          link: https://github.com/ngmaibulat/packages

features:
    - title: "@aibulat/run"
      details: Run a process with env vars preloaded from a file — repeatedly, on a pause, or on filesystem events. Every run is captured through a PTY and logged to disk, SQLite and optionally a web endpoint.
      link: /run/
      linkText: Read the docs
    - title: "@aibulat/http"
      details: An HTTPie-style command line HTTP client where the method is the command, with first-class support for QUERY. Zero runtime dependencies.
      link: /http/
      linkText: Read the docs
    - title: "@aibulat/restclients"
      details: Thin, typed wrappers around nine public REST APIs. Subpath imports only, no caching, no retry policy — the native Response and the types that describe it.
      link: /restclients/
      linkText: Read the docs
    - title: "@aibulat/naser"
      details: Convert files containing ANSI escape output into HTML, built on the anser package.
      link: /naser/
      linkText: Read the docs
    - title: "@aibulat/funtest"
      details: Zero-dependency smoke tests for a handful of public REST APIs, written with node:test and fetch. Published reference code you can run in one command.
      link: /funtest/
      linkText: Read the docs
    - title: "@aibulat/svelte-admin-kit"
      details: Reusable Svelte 5 admin-UI primitives — controls, layout, feedback, data display, overlays, an icon registry, and Monaco and tiptap editors behind their own subpaths.
      link: /svelte-admin-kit/
      linkText: Read the docs
    - title: "@aibulat/fs"
      details: Filesystem helpers as a library and an `fs` command — listings carrying owner, group and libmagic-detected type, plus directory counts, hashes and move operations.
      link: /fs/
      linkText: Read the docs
    - title: "@aibulat/mark"
      details: Render Markdown in the terminal, from a file or straight off stdin.
      link: /mark/
      linkText: Read the docs
    - title: mk-swagger-ui
      details: Turn an OpenAPI YAML document into a static, self-contained API reference rendered with Scalar, with a built-in preview server and a TypeScript interface generator for its schemas.
      link: /mk-swagger-ui/
      linkText: Read the docs
    - title: "@aibulat/sendeml"
      details: Send raw .eml files to an SMTP server — one file, a directory, or a Haraka queue with its own envelope format.
      link: /sendeml/
      linkText: Read the docs
    - title: "@aibulat/watch-dir-count"
      details: Poll a directory's file count and, when it crosses a threshold, run a command and send a templated email report. A queue-depth alarm.
      link: /watch-dir-count/
      linkText: Read the docs
    - title: "@aibulat/auth"
      details: Manage a table of bcrypt-hashed credentials over knex, and hash or verify a password on its own.
      link: /auth/
      linkText: Read the docs
    - title: "@aibulat/installer"
      details: Ubuntu provisioning scripts packaged as commands — MySQL with a generated root password, vim, and a password generator.
      link: /installer/
      linkText: Read the docs
    - title: "@aibulat/ctl-ufw"
      details: Configure ufw from a JSON list of ports — allow each, default deny, enable.
      link: /ctl-ufw/
      linkText: Read the docs
    - title: "@aibulat/isfile"
      details: Check that a path exists and is a regular file. The leaf of the dependency graph — fs, json, mark, naser and sendeml all build on it.
      link: /isfile/
      linkText: Read the docs
    - title: "@aibulat/json"
      details: Read a JSON file into a typed value instead of any, with a clear error when the file is missing.
      link: /json/
      linkText: Read the docs
    - title: "@aibulat/indexeddb"
      details: IndexedDB with usability — promises instead of request objects, schema-aware types, store shortcuts and async iteration. A fork of idb.
      link: /indexeddb/
      linkText: Read the docs
    - title: Notes
      details: Scratch notes on CLI libraries, chokidar event types and file type detection.
      link: /notes/cli
      linkText: Browse notes
---
