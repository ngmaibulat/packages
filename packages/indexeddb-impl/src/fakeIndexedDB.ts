import FDBFactory from "./FDBFactory.ts";
import { constructInternally } from "./lib/webidl.ts";

const fakeIndexedDB = constructInternally(() => new FDBFactory());

export default fakeIndexedDB;
