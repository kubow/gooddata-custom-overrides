import { useEffect, useMemo, useState } from "react";

import {
    type DateAttributeGranularity,
    type IAttribute,
    type ICatalogDateAttribute,
    type ICatalogDateDataset,
    type IInsight,
    areObjRefsEqual,
    attributeDisplayFormRef,
    attributeLocalId,
    insightAttributes,
    insightId,
    insightModifyItems,
    isAttribute,
    modifyAttribute,
    serializeObjRef,
} from "@gooddata/sdk-model";
import { useBackendStrict, useWorkspaceStrict } from "@gooddata/sdk-ui";

type SupportedGranularity =
    | "GDC.time.date"
    | "GDC.time.week_us"
    | "GDC.time.month"
    | "GDC.time.quarter";
type CatalogStatus = "loading" | "ready" | "error";

interface DateDimension {
    attribute: IAttribute;
    dataset: ICatalogDateDataset;
    dateAttribute: ICatalogDateAttribute;
}

interface DateOverride {
    datasetKey: string;
    granularity: DateAttributeGranularity;
}

interface PivotDateControlsProps {
    dimensions: DateDimension[];
    dateDatasets: ICatalogDateDataset[];
    overrides: Record<string, DateOverride>;
    onChange: (localId: string, override: DateOverride) => void;
}

export interface PivotDateConfiguration {
    insight: IInsight;
    controls: React.ReactNode;
    loading: boolean;
}

const SUPPORTED_GRANULARITIES: Array<{
    value: SupportedGranularity;
    label: string;
}> = [
    { value: "GDC.time.date", label: "Day" },
    { value: "GDC.time.week_us", label: "Week" },
    { value: "GDC.time.month", label: "Month" },
    { value: "GDC.time.quarter", label: "Quarter" },
];

function datasetKey(dataset: ICatalogDateDataset): string {
    return serializeObjRef(dataset.dataSet.ref);
}

function supportedDateAttribute(
    dataset: ICatalogDateDataset,
    granularity: DateAttributeGranularity,
): ICatalogDateAttribute | undefined {
    return dataset.dateAttributes.find((item) => item.granularity === granularity);
}

function matchDateDimension(
    attribute: IAttribute,
    dateDatasets: ICatalogDateDataset[],
): DateDimension | undefined {
    const displayForm = attributeDisplayFormRef(attribute);
    for (const dataset of dateDatasets) {
        const dateAttribute = dataset.dateAttributes.find((item) =>
            areObjRefsEqual(item.defaultDisplayForm.ref, displayForm),
        );
        if (dateAttribute) {
            return { attribute, dataset, dateAttribute };
        }
    }
    return undefined;
}

function datasetCategory(dataset: ICatalogDateDataset): string {
    return dataset.dataSet.tags?.[0] || "Date fields";
}

function granularityLabel(granularity: DateAttributeGranularity): string {
    const name = granularity.replace("GDC.time.", "").replaceAll("_", " ");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function PivotDateControls({
    dimensions,
    dateDatasets,
    overrides,
    onChange,
}: PivotDateControlsProps) {
    const selectableDatasets = dateDatasets.filter((dataset) =>
        SUPPORTED_GRANULARITIES.some(({ value }) => supportedDateAttribute(dataset, value)),
    );
    const groups = [...new Set(selectableDatasets.map(datasetCategory))].sort((left, right) =>
        left.localeCompare(right),
    );

    return dimensions.map((dimension) => {
        const localId = attributeLocalId(dimension.attribute);
        const current = overrides[localId] ?? {
            datasetKey: datasetKey(dimension.dataset),
            granularity: dimension.dateAttribute.granularity,
        };
        const selectedDataset =
            selectableDatasets.find((dataset) => datasetKey(dataset) === current.datasetKey) ??
            dimension.dataset;
        const granularities = SUPPORTED_GRANULARITIES.some(
            ({ value }) => value === dimension.dateAttribute.granularity,
        )
            ? SUPPORTED_GRANULARITIES
            : [
                  {
                      value: dimension.dateAttribute.granularity,
                      label: granularityLabel(dimension.dateAttribute.granularity),
                  },
                  ...SUPPORTED_GRANULARITIES,
              ];

        return (
            <div className="date-dimension-control" key={localId}>
                <label>
                    <span>Date field</span>
                    <select
                        aria-label={`Date field for ${dimension.dateAttribute.attribute.title}`}
                        value={current.datasetKey}
                        onChange={(event) => {
                            const nextDataset = selectableDatasets.find(
                                (dataset) => datasetKey(dataset) === event.target.value,
                            );
                            if (!nextDataset) {
                                return;
                            }
                            const nextGranularity = supportedDateAttribute(
                                nextDataset,
                                current.granularity,
                            )
                                ? current.granularity
                                : (SUPPORTED_GRANULARITIES.find(({ value }) =>
                                      supportedDateAttribute(nextDataset, value),
                                  )?.value ?? "GDC.time.date");
                            onChange(localId, {
                                datasetKey: datasetKey(nextDataset),
                                granularity: nextGranularity,
                            });
                        }}
                    >
                        {groups.map((group) => (
                            <optgroup key={group} label={group}>
                                {selectableDatasets
                                    .filter((dataset) => datasetCategory(dataset) === group)
                                    .map((dataset) => (
                                        <option key={datasetKey(dataset)} value={datasetKey(dataset)}>
                                            {dataset.dataSet.title}
                                        </option>
                                    ))}
                            </optgroup>
                        ))}
                    </select>
                </label>

                <div className="granularity-toggle" role="group" aria-label="Date granularity">
                    {granularities.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={current.granularity === value}
                            disabled={!supportedDateAttribute(selectedDataset, value)}
                            onClick={() =>
                                onChange(localId, {
                                    datasetKey: current.datasetKey,
                                    granularity: value,
                                })
                            }
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        );
    });
}

export function usePivotDateConfiguration(insight: IInsight): PivotDateConfiguration {
    const backend = useBackendStrict();
    const workspace = useWorkspaceStrict();
    const [status, setStatus] = useState<CatalogStatus>("loading");
    const [dateDatasets, setDateDatasets] = useState<ICatalogDateDataset[]>([]);
    const [overrides, setOverrides] = useState<Record<string, DateOverride>>({});

    useEffect(() => {
        let active = true;
        setStatus("loading");
        backend
            .workspace(workspace)
            .catalog()
            .forTypes(["dateDataset"])
            .load()
            .then((catalog) => {
                if (active) {
                    setDateDatasets(catalog.dateDatasets());
                    setStatus("ready");
                }
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

    useEffect(() => {
        setOverrides({});
    }, [insightId(insight)]);

    const dimensions = useMemo(
        () =>
            insightAttributes(insight)
                .map((attribute) => matchDateDimension(attribute, dateDatasets))
                .filter((item): item is DateDimension => item !== undefined)
                .filter((item) =>
                    SUPPORTED_GRANULARITIES.some(({ value }) =>
                        supportedDateAttribute(item.dataset, value),
                    ),
                ),
        [dateDatasets, insight],
    );

    const effectiveInsight = useMemo(() => {
        if (dimensions.length === 0) {
            return insight;
        }
        const dimensionsByLocalId = new Map(
            dimensions.map((dimension) => [attributeLocalId(dimension.attribute), dimension]),
        );
        return insightModifyItems(insight, (item) => {
            if (!isAttribute(item)) {
                return item;
            }
            const localId = attributeLocalId(item);
            const dimension = dimensionsByLocalId.get(localId);
            const override = overrides[localId];
            if (!dimension || !override) {
                return item;
            }
            const dataset = dateDatasets.find(
                (candidate) => datasetKey(candidate) === override.datasetKey,
            );
            const dateAttribute = dataset
                ? supportedDateAttribute(dataset, override.granularity)
                : undefined;
            return dateAttribute
                ? modifyAttribute(item, (builder) =>
                      builder
                          .displayForm(dateAttribute.defaultDisplayForm.ref)
                          .alias(dateAttribute.attribute.title),
                  )
                : item;
        });
    }, [dateDatasets, dimensions, insight, overrides]);

    const controls =
        status === "ready" && dimensions.length > 0 ? (
            <PivotDateControls
                dimensions={dimensions}
                dateDatasets={dateDatasets}
                overrides={overrides}
                onChange={(localId, override) =>
                    setOverrides((current) => ({ ...current, [localId]: override }))
                }
            />
        ) : null;

    return {
        insight: effectiveInsight,
        controls,
        loading: status === "loading",
    };
}
