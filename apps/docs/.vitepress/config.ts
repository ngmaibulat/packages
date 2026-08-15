import { defineConfig } from "vitepress";

// Served from https://ngmaibulat.github.io/packages/ — the base must match the
// repository name, otherwise every asset and link 404s on GitHub Pages.
export default defineConfig({
    title: "aibulat packages",
    description: "CLI tools published from the ngmaibulat/packages monorepo",
    base: "/packages/",
    lastUpdated: true,
    cleanUrls: true,

    themeConfig: {
        // Grouped rather than flat: there are seventeen packages, and a nav bar
        // with seventeen top-level entries wraps and stops being scannable.
        nav: [
            {
                text: "CLI tools",
                items: [
                    { text: "run", link: "/run/" },
                    { text: "http", link: "/http/" },
                    { text: "mark", link: "/mark/" },
                    { text: "naser", link: "/naser/" },
                    { text: "fs", link: "/fs/" },
                    { text: "mk-swagger-ui", link: "/mk-swagger-ui/" },
                    { text: "sendeml", link: "/sendeml/" },
                    { text: "watch-dir-count", link: "/watch-dir-count/" },
                    { text: "auth", link: "/auth/" },
                    { text: "installer", link: "/installer/" },
                    { text: "ctl-ufw", link: "/ctl-ufw/" },
                    { text: "create-tsreact", link: "/create-tsreact/" },
                ],
            },
            {
                text: "Libraries",
                items: [
                    { text: "restclients", link: "/restclients/" },
                    { text: "isfile", link: "/isfile/" },
                    { text: "json", link: "/json/" },
                    { text: "svelte-admin-kit", link: "/svelte-admin-kit/" },
                ],
            },
            { text: "funtest", link: "/funtest/", activeMatch: "/funtest/" },
            { text: "Notes", link: "/notes/cli", activeMatch: "/notes/" },
        ],

        sidebar: {
            "/run/": [
                {
                    text: "@aibulat/run",
                    items: [
                        { text: "Overview", link: "/run/" },
                        { text: "Usage", link: "/run/usage" },
                        { text: "API", link: "/run/api" },
                        { text: "Alternatives", link: "/run/alternatives" },
                    ],
                },
            ],
            "/http/": [
                {
                    text: "@aibulat/http",
                    items: [{ text: "Overview", link: "/http/" }],
                },
            ],
            "/restclients/": [
                {
                    text: "@aibulat/restclients",
                    items: [
                        { text: "Overview", link: "/restclients/" },
                        { text: "core", link: "/restclients/core" },
                    ],
                },
                {
                    text: "Clients",
                    items: [
                        {
                            text: "jsonplaceholder",
                            link: "/restclients/jsonplaceholder",
                        },
                        { text: "reqres", link: "/restclients/reqres" },
                        { text: "dummyjson", link: "/restclients/dummyjson" },
                        { text: "httpbin", link: "/restclients/httpbin" },
                        { text: "github", link: "/restclients/github" },
                        { text: "ipinfo", link: "/restclients/ipinfo" },
                        { text: "openmeteo", link: "/restclients/openmeteo" },
                        { text: "worldbank", link: "/restclients/worldbank" },
                    ],
                },
            ],
            "/naser/": [
                {
                    text: "@aibulat/naser",
                    items: [{ text: "Overview", link: "/naser/" }],
                },
            ],
            "/funtest/": [
                {
                    text: "@aibulat/funtest",
                    items: [{ text: "Overview", link: "/funtest/" }],
                },
            ],
            "/svelte-admin-kit/": [
                {
                    text: "@aibulat/svelte-admin-kit",
                    items: [{ text: "Overview", link: "/svelte-admin-kit/" }],
                },
            ],
            "/isfile/": [
                {
                    text: "@aibulat/isfile",
                    items: [{ text: "Overview", link: "/isfile/" }],
                },
            ],
            "/json/": [
                {
                    text: "@aibulat/json",
                    items: [{ text: "Overview", link: "/json/" }],
                },
            ],
            "/fs/": [
                {
                    text: "@aibulat/fs",
                    items: [{ text: "Overview", link: "/fs/" }],
                },
            ],
            "/mark/": [
                {
                    text: "@aibulat/mark",
                    items: [{ text: "Overview", link: "/mark/" }],
                },
            ],
            // No scope: this one is published as plain `mk-swagger-ui`, which
            // is the name it has had on npm since 2022.
            "/mk-swagger-ui/": [
                {
                    text: "mk-swagger-ui",
                    items: [{ text: "Overview", link: "/mk-swagger-ui/" }],
                },
            ],
            "/auth/": [
                {
                    text: "@aibulat/auth",
                    items: [{ text: "Overview", link: "/auth/" }],
                },
            ],
            "/installer/": [
                {
                    text: "@aibulat/installer",
                    items: [{ text: "Overview", link: "/installer/" }],
                },
            ],
            "/create-tsreact/": [
                {
                    // Unscoped, like mk-swagger-ui - but here the name is
                    // load-bearing: `npm create tsreact` resolves to it.
                    text: "create-tsreact",
                    items: [{ text: "Overview", link: "/create-tsreact/" }],
                },
            ],
            "/ctl-ufw/": [
                {
                    text: "@aibulat/ctl-ufw",
                    items: [{ text: "Overview", link: "/ctl-ufw/" }],
                },
            ],
            "/sendeml/": [
                {
                    text: "@aibulat/sendeml",
                    items: [{ text: "Overview", link: "/sendeml/" }],
                },
            ],
            "/watch-dir-count/": [
                {
                    text: "@aibulat/watch-dir-count",
                    items: [{ text: "Overview", link: "/watch-dir-count/" }],
                },
            ],
            "/notes/": [
                {
                    text: "Notes",
                    items: [
                        { text: "CLI libraries", link: "/notes/cli" },
                        {
                            text: "Chokidar event types",
                            link: "/notes/chokidar-event-types",
                        },
                        {
                            text: "File type detection",
                            link: "/notes/file-type",
                        },
                    ],
                },
            ],
        },

        socialLinks: [
            {
                icon: "github",
                link: "https://github.com/ngmaibulat/packages",
            },
        ],

        editLink: {
            pattern:
                "https://github.com/ngmaibulat/packages/edit/main/apps/docs/:path",
            text: "Edit this page on GitHub",
        },

        search: {
            provider: "local",
        },

        footer: {
            message: "Released under the MIT License.",
            copyright: "Copyright © Aibulat",
        },
    },
});
