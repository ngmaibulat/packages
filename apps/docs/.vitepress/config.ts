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
        nav: [
            { text: "run", link: "/run/", activeMatch: "/run/" },
            { text: "http", link: "/http/", activeMatch: "/http/" },
            {
                text: "restclients",
                link: "/restclients/",
                activeMatch: "/restclients/",
            },
            { text: "naser", link: "/naser/", activeMatch: "/naser/" },
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
