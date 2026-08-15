//package.json points "main" here rather than at a metro default.
//registerRootComponent wraps AppRegistry.registerComponent('main', () => App)
//and additionally sets the environment up the same way whether the app is
//opened in Expo Go or in a native build.
export default function genExpoIndexTs() {
    const tpl = `
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
`;

    return tpl;
}
