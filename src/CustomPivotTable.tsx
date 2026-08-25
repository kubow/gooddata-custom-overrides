import {
    type DragEvent,
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { type DataValue, type IInsight, resultHeaderName } from "@gooddata/sdk-model";
import {
    type DataViewFacade,
    type IVisualizationCallbacks,
    createNumberJsFormatter,
    useBackendStrict,
    useExecutionDataView,
    useWorkspaceStrict,
} from "@gooddata/sdk-ui";

import { usePivotDateConfiguration } from "./PivotDateControls.js";

type SortDirection = "asc" | "desc";

interface SortState {
    columnIndex: number;
    direction: SortDirection;
}

interface TableColumn {
    id: string;
    kind: "attribute" | "measure";
    label: string;
    format: string | null;
}

interface TableCell {
    formattedValue: string;
    numericValue: number | null;
}

interface TableRow {
    id: string;
    type: "value" | "total";
    cells: TableCell[];
}

interface TableModel {
    columns: TableColumn[];
    rows: TableRow[];
}

interface CustomPivotTableProps
    extends Pick<
        IVisualizationCallbacks,
        "afterRender" | "onDataView" | "onError" | "onLoadingChanged"
    > {
    insight: IInsight;
}

const formatNumber = createNumberJsFormatter();

function numericValue(value: DataValue): number | null {
    if (value === null || value === "") {
        return null;
    }
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
}

function buildTableModel(dataView: DataViewFacade): TableModel {
    const data = dataView.data();
    const slices = data.slices().toArray();
    const series = data.series().toArray();
    const headerCount = slices.reduce(
        (largest, slice) => Math.max(largest, slice.descriptor.headers.length),
        0,
    );
    const attributeDescriptors = slices[0]?.descriptor.descriptors ?? [];

    const attributeColumns: TableColumn[] = Array.from({ length: headerCount }, (_, index) => ({
        id: `attribute:${index}`,
        kind: "attribute",
        label: attributeDescriptors[index]?.attributeHeader.name ?? `Row ${index + 1}`,
        format: null,
    }));
    const measureColumns: TableColumn[] = series.map((item) => {
        const scopes = item.scopeTitles().filter((title): title is string => title !== null && title !== "");
        return {
            id: `measure:${item.id}`,
            kind: "measure",
            label: [...scopes, item.measureTitle()].join(" / "),
            format: item.measureFormat(),
        };
    });

    const rows: TableRow[] = slices.map((slice, rowIndex) => {
        const points = slice.dataPoints();
        const headerCells: TableCell[] = Array.from({ length: headerCount }, (_, index) => {
            const header = slice.descriptor.headers[index];
            return {
                formattedValue: header ? resultHeaderName(header) ?? "-" : "-",
                numericValue: null,
            };
        });
        const measureCells: TableCell[] = series.map((_, seriesIndex) => {
            const point = points[seriesIndex];
            return {
                formattedValue: point?.formattedValue() ?? "-",
                numericValue: point ? numericValue(point.rawValue) : null,
            };
        });

        return {
            id: slice.id || `row:${rowIndex}`,
            type: slice.descriptor.isTotal || points.some((point) => point.total) ? "total" : "value",
            cells: [...headerCells, ...measureCells],
        };
    });

    if (rows.length === 0 && series.length > 0) {
        const cells = series.map((item) => {
            const point = item.dataPoints()[0];
            return {
                formattedValue: point?.formattedValue() ?? "-",
                numericValue: point ? numericValue(point.rawValue) : null,
            };
        });
        rows.push({ id: "row:0", type: "value", cells });
    }

    return {
        columns: [...attributeColumns, ...measureColumns],
        rows,
    };
}

function compareValues(left: string | number | null, right: string | number | null): number {
    if (left === null) {
        return right === null ? 0 : 1;
    }
    if (right === null) {
        return -1;
    }
    if (typeof left === "number" && typeof right === "number") {
        return left - right;
    }
    return String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: "base",
    });
}

function moveColumn(order: number[], fromColumn: number, toColumn: number): number[] {
    const fromIndex = order.indexOf(fromColumn);
    const toIndex = order.indexOf(toColumn);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return order;
    }

    const next = order.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
}

function PivotTableResult({
    table,
    afterRender,
    dateControls,
}: {
    table: TableModel;
    afterRender?: () => void;
    dateControls?: ReactNode;
}) {
    const canonicalOrder = useMemo(() => table.columns.map((_, index) => index), [table]);
    const [columnOrder, setColumnOrder] = useState(canonicalOrder);
    const [runningTotals, setRunningTotals] = useState<number[]>([]);
    const [sort, setSort] = useState<SortState | null>(null);
    const [dropTarget, setDropTarget] = useState<number | null>(null);
    const draggedColumn = useRef<number | null>(null);

    useEffect(() => {
        afterRender?.();
    }, [afterRender, table]);

    useEffect(() => {
        setColumnOrder((current) => {
            const available = new Set(canonicalOrder);
            const retained = current.filter((column) => available.has(column));
            const retainedSet = new Set(retained);
            return [...retained, ...canonicalOrder.filter((column) => !retainedSet.has(column))];
        });
        setRunningTotals((current) =>
            current.filter((columnIndex) => table.columns[columnIndex]?.kind === "measure"),
        );
    }, [canonicalOrder, table]);

    const runningTotalColumns = table.columns
        .map((column, columnIndex) => ({ column, columnIndex }))
        .filter(({ column }) => column.kind === "measure");
    const runningTotalSet = useMemo(() => new Set(runningTotals), [runningTotals]);

    const runningValues = useMemo(() => {
        const values = new Map<string, number>();
        for (const columnIndex of runningTotals) {
            let total = 0;
            table.rows.forEach((row, rowIndex) => {
                if (row.type !== "value") {
                    return;
                }
                const value = row.cells[columnIndex].numericValue;
                if (value !== null) {
                    total += value;
                    values.set(`${rowIndex}:${columnIndex}`, total);
                }
            });
        }
        return values;
    }, [runningTotals, table]);

    const rowOrder = useMemo(() => {
        const originalOrder = table.rows.map((_, index) => index);
        if (!sort) {
            return originalOrder;
        }

        const valueRows = originalOrder.filter((rowIndex) => table.rows[rowIndex].type === "value");
        const totalRows = originalOrder.filter((rowIndex) => table.rows[rowIndex].type !== "value");
        const direction = sort.direction === "asc" ? 1 : -1;

        valueRows.sort((leftRow, rightRow) => {
            const leftCell = table.rows[leftRow].cells[sort.columnIndex];
            const rightCell = table.rows[rightRow].cells[sort.columnIndex];
            const leftValue = runningTotalSet.has(sort.columnIndex)
                ? runningValues.get(`${leftRow}:${sort.columnIndex}`) ?? null
                : leftCell.numericValue ?? leftCell.formattedValue;
            const rightValue = runningTotalSet.has(sort.columnIndex)
                ? runningValues.get(`${rightRow}:${sort.columnIndex}`) ?? null
                : rightCell.numericValue ?? rightCell.formattedValue;
            const compared = compareValues(leftValue, rightValue);
            return compared === 0 ? leftRow - rightRow : compared * direction;
        });

        return [...valueRows, ...totalRows];
    }, [runningTotalSet, runningValues, sort, table]);

    const changeSort = (columnIndex: number) => {
        setSort((current) => {
            if (!current || current.columnIndex !== columnIndex) {
                return { columnIndex, direction: "asc" };
            }
            return current.direction === "asc"
                ? { columnIndex, direction: "desc" }
                : null;
        });
    };

    const toggleRunningTotal = (columnIndex: number) => {
        setRunningTotals((current) =>
            current.includes(columnIndex)
                ? current.filter((item) => item !== columnIndex)
                : [...current, columnIndex],
        );
    };

    const handleDragStart = (event: DragEvent<HTMLButtonElement>, columnIndex: number) => {
        draggedColumn.current = columnIndex;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(columnIndex));
    };

    const handleDrop = (event: DragEvent<HTMLTableCellElement>, columnIndex: number) => {
        event.preventDefault();
        const source = draggedColumn.current;
        if (source !== null) {
            setColumnOrder((current) => moveColumn(current, source, columnIndex));
        }
        draggedColumn.current = null;
        setDropTarget(null);
    };

    const isDefaultOrder = columnOrder.every(
        (columnIndex, index) => canonicalOrder[index] === columnIndex,
    );

    return (
        <div className="custom-pivot">
            <div className="pivot-controls">
                {dateControls}
                <details className="running-total-menu">
                    <summary>
                        Running totals
                        {runningTotals.length > 0 ? ` (${runningTotals.length})` : ""}
                    </summary>
                    <div className="running-total-options">
                        {runningTotalColumns.length > 0 ? (
                            runningTotalColumns.map(({ column, columnIndex }) => (
                                <label key={column.id}>
                                    <input
                                        type="checkbox"
                                        checked={runningTotalSet.has(columnIndex)}
                                        onChange={() => toggleRunningTotal(columnIndex)}
                                    />
                                    <span>{column.label}</span>
                                </label>
                            ))
                        ) : (
                            <span className="control-note">No measures available</span>
                        )}
                    </div>
                </details>
                <button
                    className="reset-table"
                    type="button"
                    disabled={isDefaultOrder && runningTotals.length === 0 && sort === null}
                    onClick={() => {
                        setColumnOrder(canonicalOrder);
                        setRunningTotals([]);
                        setSort(null);
                    }}
                >
                    Reset
                </button>
            </div>

            <div className="custom-pivot-scroll">
                <table>
                    <thead>
                        <tr>
                            {columnOrder.map((columnIndex) => {
                                const column = table.columns[columnIndex];
                                const running = runningTotalSet.has(columnIndex);
                                const sorted = sort?.columnIndex === columnIndex;
                                return (
                                    <th
                                        key={column.id}
                                        className={dropTarget === columnIndex ? "drop-target" : undefined}
                                        scope="col"
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "move";
                                            setDropTarget(columnIndex);
                                        }}
                                        onDragLeave={() => setDropTarget(null)}
                                        onDrop={(event) => handleDrop(event, columnIndex)}
                                    >
                                        <div className="pivot-header">
                                            <button
                                                className="column-grip"
                                                type="button"
                                                draggable
                                                title={`Move ${column.label}`}
                                                aria-label={`Move ${column.label}`}
                                                onDragStart={(event) => handleDragStart(event, columnIndex)}
                                                onDragEnd={() => {
                                                    draggedColumn.current = null;
                                                    setDropTarget(null);
                                                }}
                                            >
                                                <span />
                                            </button>
                                            <button
                                                className="column-sort"
                                                type="button"
                                                aria-label={`Sort by ${column.label}`}
                                                aria-pressed={sorted}
                                                onClick={() => changeSort(columnIndex)}
                                            >
                                                <span className="column-title">
                                                    {running ? "Running total / " : ""}
                                                    {column.label}
                                                </span>
                                                <span
                                                    className={`sort-indicator ${
                                                        sorted ? sort.direction : "none"
                                                    }`}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rowOrder.map((rowIndex) => {
                            const row = table.rows[rowIndex];
                            return (
                                <tr key={row.id} className={row.type === "value" ? undefined : "total-row"}>
                                    {columnOrder.map((columnIndex) => {
                                        const column = table.columns[columnIndex];
                                        const cell = row.cells[columnIndex];
                                        const runningValue = runningValues.get(`${rowIndex}:${columnIndex}`);
                                        const content =
                                            runningTotalSet.has(columnIndex) &&
                                            row.type === "value" &&
                                            runningValue !== undefined &&
                                            column.format !== null
                                                ? formatNumber(runningValue, column.format)
                                                : cell.formattedValue;
                                        return (
                                            <td
                                                key={column.id}
                                                className={cell.numericValue !== null ? "numeric-cell" : undefined}
                                            >
                                                {content}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function CustomPivotTable({
    insight,
    afterRender,
    onDataView,
    onError,
    onLoadingChanged,
}: CustomPivotTableProps) {
    const backend = useBackendStrict();
    const workspace = useWorkspaceStrict();
    const dateConfiguration = usePivotDateConfiguration(insight);
    const preparedExecution = useMemo(
        () =>
            dateConfiguration.loading
                ? undefined
                : backend.workspace(workspace).execution().forInsight(dateConfiguration.insight),
        [backend, dateConfiguration.insight, dateConfiguration.loading, workspace],
    );
    const execution = useExecutionDataView({
        execution: preparedExecution,
        enableExecutionCancelling: true,
        onLoading: () => onLoadingChanged?.({ isLoading: true }),
        onSuccess: (dataView) => {
            onLoadingChanged?.({ isLoading: false });
            onDataView?.(dataView);
        },
        onError: (error) => {
            onLoadingChanged?.({ isLoading: false });
            onError?.(error);
        },
    });

    const table = useMemo(() => {
        if (execution.status !== "success") {
            return null;
        }
        try {
            return buildTableModel(execution.result);
        } catch {
            return null;
        }
    }, [execution]);

    if (
        dateConfiguration.loading ||
        execution.status === "loading" ||
        execution.status === "pending"
    ) {
        return <p className="empty-state">Loading pivot table...</p>;
    }
    if (execution.status === "error" || table === null) {
        return <p className="empty-state">Could not prepare the pivot table data.</p>;
    }
    if (table.rows.length === 0) {
        return <p className="empty-state">No data</p>;
    }

    return (
        <PivotTableResult
            table={table}
            afterRender={afterRender}
            dateControls={dateConfiguration.controls}
        />
    );
}
