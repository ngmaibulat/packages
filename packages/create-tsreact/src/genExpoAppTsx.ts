import type { Opts } from "./cli.js";

//React Native has no DOM and no CSS: layout comes from StyleSheet objects and
//flexbox, and there is no div/h1 - only View, Text and friends.
//
//TanStack Query works unchanged on React Native - it is transport-agnostic and
//the generated client uses fetch, which react-native polyfills. What it does
//not get for free is refetch-on-reconnect/on-focus, which need
//@tanstack/react-query's AppState and NetInfo wiring; that is left out rather
//than pulling in @react-native-community/netinfo unasked.
export default function genExpoAppTsx(o: Opts) {
    const query = o.api
        ? {
              imports: `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";\n`,
              client: `\nconst queryClient = new QueryClient();\n`,
              open: `\n            <QueryClientProvider client={queryClient}>`,
              close: `\n            </QueryClientProvider>`,
          }
        : { imports: "", client: "", open: "", close: "" };

    //the provider has to sit inside the root View rather than wrap it, so the
    //flex container still fills the screen
    const inner = o.api ? "    " : "";

    const tpl = `
${query.imports}import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
${query.client}
export default function App() {
    return (
        <View style={styles.container}>${query.open}
${inner}            <Text style={styles.title}>Hello World from ${o.name} app!</Text>
${inner}            <StatusBar style="auto" />${query.close}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontSize: 18,
    },
});
`;

    return tpl;
}
