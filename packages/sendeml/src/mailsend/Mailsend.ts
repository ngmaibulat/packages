import type { Loader } from "./types.js";

export class Mailsend {
    public loader: Loader;

    constructor(loader: Loader) {
        this.loader = loader;
    }

    send() {
        console.log(this.loader);
    }

    async run() {
        for await (const str of this.loader) {
            console.log(str);
        }
    }
}
