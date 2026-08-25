import { ContextDeferredAuthProvider, tigerFactory } from "@gooddata/sdk-backend-tiger";

export const backend = tigerFactory().withAuthentication(new ContextDeferredAuthProvider());
