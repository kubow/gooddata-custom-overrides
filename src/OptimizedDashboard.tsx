import { useEffect, useMemo, useState } from "react";

import {
    type IDashboard,
    dashboardAttributeFilterItemDisplayForm,
    insightDisplayFormUsage,
    isDashboardAttributeFilter,
    serializeObjRef,
} from "@gooddata/sdk-model";
import { useBackendStrict, useWorkspaceStrict } from "@gooddata/sdk-ui";
import {
    Dashboard,
    type DashboardConfig,
    type IDashboardProps,
} from "@gooddata/sdk-ui-dashboard";

type Backend = ReturnType<typeof useBackendStrict>;
type DashboardReferences = NonNullable<DashboardConfig["references"]>;

interface DashboardBundle {
    dashboard: IDashboard;
    references: DashboardReferences;
}

interface OptimizedDashboardProps {
    dashboardId: string;
    InsightBodyComponentProvider?: IDashboardProps["InsightBodyComponentProvider"];
}

const bundlesByBackend = new WeakMap<Backend, Map<string, Promise<DashboardBundle>>>();

function uniqueRefs<T>(refs: T[], serialize: (ref: T) => string): T[] {
    return [...new Map(refs.map((ref) => [serialize(ref), ref])).values()];
}

function dashboardFilterDisplayForms(dashboard: IDashboard) {
    const contexts = [dashboard.filterContext, ...(dashboard.tabs?.map((tab) => tab.filterContext) ?? [])];
    return contexts.flatMap((context) =>
        (context?.filters ?? [])
            .filter(isDashboardAttributeFilter)
            .map(dashboardAttributeFilterItemDisplayForm),
    );
}

async function warmLabelMetadata(
    backend: Backend,
    workspace: string,
    bundle: DashboardBundle,
): Promise<void> {
    const insightDisplayForms = bundle.references.insights.flatMap((insight) => {
        const usage = insightDisplayFormUsage(insight);
        return [...usage.inAttributes, ...usage.inFilters, ...usage.inMeasureFilters];
    });
    const displayFormRefs = uniqueRefs(
        [...insightDisplayForms, ...dashboardFilterDisplayForms(bundle.dashboard)],
        serializeObjRef,
    );
    if (displayFormRefs.length === 0) {
        return;
    }

    const attributesService = backend.workspace(workspace).attributes();
    const displayForms = await attributesService.getAttributeDisplayForms(displayFormRefs);
    const attributeRefs = uniqueRefs(
        displayForms.map((displayForm) => displayForm.attribute),
        serializeObjRef,
    );
    if (attributeRefs.length > 0) {
        await attributesService.getAttributes(attributeRefs);
    }
}

function loadDashboardBundle(
    backend: Backend,
    workspace: string,
    dashboardId: string,
): Promise<DashboardBundle> {
    let backendBundles = bundlesByBackend.get(backend);
    if (!backendBundles) {
        backendBundles = new Map();
        bundlesByBackend.set(backend, backendBundles);
    }

    const key = `${workspace}:${dashboardId}`;
    const cached = backendBundles.get(key);
    if (cached) {
        return cached;
    }

    const pending = backend
        .workspace(workspace)
        .dashboards()
        .getDashboardWithReferences(
            { identifier: dashboardId, type: "analyticalDashboard" },
            undefined,
            { loadUserData: true },
            ["insight", "dataSet"],
        )
        .then(async (bundle) => {
            await warmLabelMetadata(backend, workspace, bundle);
            return bundle;
        })
        .catch((error) => {
            backendBundles?.delete(key);
            throw error;
        });
    backendBundles.set(key, pending);
    return pending;
}

export function OptimizedDashboard({
    dashboardId,
    InsightBodyComponentProvider,
}: OptimizedDashboardProps) {
    const backend = useBackendStrict();
    const workspace = useWorkspaceStrict();
    const [bundle, setBundle] = useState<DashboardBundle | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        setBundle(null);
        setFailed(false);
        loadDashboardBundle(backend, workspace, dashboardId).then(
            (loaded) => {
                if (active) {
                    setBundle(loaded);
                }
            },
            () => {
                if (active) {
                    setFailed(true);
                }
            },
        );
        return () => {
            active = false;
        };
    }, [backend, dashboardId, workspace]);

    const config = useMemo<DashboardConfig | undefined>(
        () =>
            bundle
                ? {
                      isEmbedded: true,
                      isReadOnly: true,
                      references: bundle.references,
                  }
                : undefined,
        [bundle],
    );

    if (failed) {
        return <p className="empty-state">Could not preload the dashboard.</p>;
    }
    if (!bundle || !config) {
        return <p className="empty-state">Preparing dashboard metadata...</p>;
    }

    return (
        <Dashboard
            dashboard={bundle.dashboard}
            persistedDashboard={bundle.dashboard}
            config={config}
            InsightBodyComponentProvider={InsightBodyComponentProvider}
        />
    );
}
