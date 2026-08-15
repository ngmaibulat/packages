//Only emitted with --api. This is the App Router equivalent of the few lines
//genAppTsx.ts splices into root.render: the provider holds React state, so it
//has to be a client component, and a server component cannot pass one a
//non-serialisable prop - hence a module of its own rather than a wrapper
//inside layout.tsx.
//
//The client is created in useState rather than at module scope, which is the
//opposite of what the browser-only templates do. On the server the module is
//evaluated once per process and shared by every concurrent request, so a
//module-scope client would leak one user's cache into another's response.
export default function genProvidersTsx() {
    const tpl = `
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
`;

    return tpl;
}
