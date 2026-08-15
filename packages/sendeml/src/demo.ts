import fs from "node:fs/promises";
import path from "node:path";

import { moveFile } from "./utils/dir.js";

import { logger } from "./logger.js";

import { Mailsend } from "./mailsend/Mailsend.js";
import { stringLoader } from "./mailsend/loader/simple.js";

const mails = ["one", "two", "Three"];

const loader = stringLoader(mails);

const sender = new Mailsend(loader);

sender.send();

await sender.run();
