import { ContextDeferredAuthProvider, tigerFactory } from "@gooddata/sdk-backend-tiger";
import {
    RecommendedCachingConfiguration,
    withCaching,
} from "@gooddata/sdk-backend-base";

const tiger = tigerFactory().withAuthentication(new ContextDeferredAuthProvider());

export const backend = withCaching(tiger, {
    ...RecommendedCachingConfiguration,
    maxExecutions: undefined,
    maxResultWindows: undefined,
    maxInsightsPerWorkspace: 250,
    maxAttributeDisplayFormsPerWorkspace: 1_000,
    maxAttributesPerWorkspace: 1_000,
});
