---
layout: home

hero:
    name: aibulat packages
    text: Small CLI tools for Node
    tagline: A pnpm monorepo of command line utilities published to npm.
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
    - title: "@aibulat/naser"
      details: Convert files containing ANSI escape output into HTML, built on the anser package.
      link: /naser/
      linkText: Read the docs
    - title: Notes
      details: Scratch notes on CLI libraries, chokidar event types and file type detection.
      link: /notes/cli
      linkText: Browse notes
---
