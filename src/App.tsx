import { useEffect, useState } from "react";

import {
    type IInsight,
    insightId,
    insightTitle,
    insightVisualizationUrl,
} from "@gooddata/sdk-model";
import {
    BackendProvider,
    WorkspaceProvider,
    useBackendStrict,
    useWorkspaceStrict,
} from "@gooddata/sdk-ui";
import {
    Dashboard,
    type IInsightBodyProps,
} from "@gooddata/sdk-ui-dashboard";
import { InsightView } from "@gooddata/sdk-ui-ext";

import { backend } from "./backend.js";
import { CustomPivotTable } from "./CustomPivotTable.js";

type View = "visual" | "dashboard";
const ALL_CATEGORIES = "all";

function DashboardPivotTable(props: IInsightBodyProps) {
    return (
        <CustomPivotTable
            insight={props.insight}
            afterRender={props.afterRender}
            onDataView={props.onDataView}
            onError={props.onError}
            onLoadingChanged={props.onLoadingChanged}
        />
    );
}

const insightBodyProvider = (insight: IInsight) =>
    insightVisualizationUrl(insight) === "local:table" ? DashboardPivotTable : undefined;

function categoryLabel(visualizationUrl: string): string {
    const name = visualizationUrl
        .replace(/^local:/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]/g, " ");

    return name ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : "Other";
}

function VisualPanel() {
    const backend = useBackendStrict();
    const workspace = useWorkspaceStrict();
    const configuredInsightId = (import.meta.env.VITE_GOODDATA_PIVOT_TABLE_ID ?? "").trim();
    const [insights, setInsights] = useState<IInsight[]>([]);
    const [selectedInsightId, setSelectedInsightId] = useState(configuredInsightId);
    const [category, setCategory] = useState(ALL_CATEGORIES);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    const categories = [...new Set(insights.map(insightVisualizationUrl))].sort((left, right) =>
        categoryLabel(left).localeCompare(categoryLabel(right)),
    );
    const visibleInsights =
        category === ALL_CATEGORIES
            ? insights
            : insights.filter((insight) => insightVisualizationUrl(insight) === category);
    const selectedInsight = insights.find((insight) => insightId(insight) === selectedInsightId);

    useEffect(() => {
        let active = true;

        backend
            .workspace(workspace)
            .insights()
            .getInsights({ limit: 100 })
            .then((page) => page.all())
            .then((items) => {
                if (!active) {
                    return;
                }

                const sortedItems = [...items].sort((left, right) =>
                    insightTitle(left).localeCompare(insightTitle(right)),
                );
                setInsights(sortedItems);
                setSelectedInsightId((currentId) => {
                    const currentExists = sortedItems.some((item) => insightId(item) === currentId);
                    return currentExists
                        ? currentId
                        : sortedItems[0]
                          ? insightId(sortedItems[0])
                          : "";
                });
                setStatus("ready");
            })
            .catch(() => {
                if (active) {
                    setStatus("error");
                }
            });

        return () => {
            active = false;
        };
    }, [backend, workspace]);

    const selectCategory = (nextCategory: string) => {
        setCategory(nextCategory);

        const matchingInsights =
            nextCategory === ALL_CATEGORIES
                ? insights
                : insights.filter(
                      (insight) => insightVisualizationUrl(insight) === nextCategory,
                  );
        const selectionIsVisible = matchingInsights.some(
            (insight) => insightId(insight) === selectedInsightId,
        );

        if (!selectionIsVisible) {
            setSelectedInsightId(matchingInsights[0] ? insightId(matchingInsights[0]) : "");
        }
    };

    return (
        <section
            className="panel visual-panel"
            id="visual-panel"
            role="tabpanel"
            aria-label="Single visual"
        >
            <div className="visual-toolbar">
                <div className="picker-field category-field">
                    <label htmlFor="category-picker">Category</label>
                    <select
                        id="category-picker"
                        value={category}
                        disabled={status !== "ready" || categories.length === 0}
                        onChange={(event) => selectCategory(event.target.value)}
                    >
                        <option value={ALL_CATEGORIES}>All categories</option>
                        {categories.map((visualizationUrl) => (
                            <option key={visualizationUrl} value={visualizationUrl}>
                                {categoryLabel(visualizationUrl)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="picker-field visual-field">
                    <label htmlFor="insight-picker">Visual</label>
                    <select
                        id="insight-picker"
                        value={selectedInsightId}
                        disabled={status !== "ready" || visibleInsights.length === 0}
                        onChange={(event) => setSelectedInsightId(event.target.value)}
                    >
                        {status === "loading" ? (
                            <option>Loading workspace catalog...</option>
                        ) : null}
                        {visibleInsights.map((insight) => (
                            <option key={insightId(insight)} value={insightId(insight)}>
                                {insightTitle(insight)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="insight">
                {status === "error" ? (
                    <p className="empty-state">Could not load the workspace catalog.</p>
                ) : null}
                {status === "ready" && insights.length === 0 ? (
                    <p className="empty-state">This workspace contains no saved visuals.</p>
                ) : null}
                {status === "ready" && selectedInsight ? (
                    insightVisualizationUrl(selectedInsight) === "local:table" ? (
                        <CustomPivotTable key={selectedInsightId} insight={selectedInsight} />
                    ) : (
                        <InsightView key={selectedInsightId} insight={selectedInsightId} />
                    )
                ) : null}
            </div>
        </section>
    );
}

export function App() {
    const [view, setView] = useState<View>("visual");
    const dashboardId = (import.meta.env.VITE_GOODDATA_DASHBOARD_ID ?? "").trim();

    return (
        <BackendProvider backend={backend}>
            <WorkspaceProvider workspace={import.meta.env.VITE_GOODDATA_WORKSPACE_ID}>
                <div className="app">
                    <div className="tabs" role="tablist" aria-label="Analytics view">
                        <button
                            className="tab"
                            type="button"
                            role="tab"
                            aria-selected={view === "visual"}
                            aria-controls="visual-panel"
                            onClick={() => setView("visual")}
                        >
                            Single visual
                        </button>
                        <button
                            className="tab"
                            type="button"
                            role="tab"
                            aria-selected={view === "dashboard"}
                            aria-controls="dashboard-panel"
                            onClick={() => setView("dashboard")}
                        >
                            Dashboard
                        </button>
                    </div>

                    <main className="content">
                        {view === "visual" ? (
                            <VisualPanel />
                        ) : (
                            <section
                                className="panel dashboard-panel"
                                id="dashboard-panel"
                                role="tabpanel"
                                aria-label="Dashboard"
                            >
                                {dashboardId ? (
                                    <Dashboard
                                        dashboard={dashboardId}
                                        config={{ isEmbedded: true, isReadOnly: true }}
                                        InsightBodyComponentProvider={insightBodyProvider}
                                    />
                                ) : (
                                    <p className="empty-state">
                                        Set <code>VITE_GOODDATA_DASHBOARD_ID</code> in <code>.env</code>{" "}
                                        to display a dashboard.
                                    </p>
                                )}
                            </section>
                        )}
                    </main>
                </div>
            </WorkspaceProvider>
        </BackendProvider>
    );
}
