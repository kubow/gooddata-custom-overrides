interface ImportMetaEnv {
    readonly VITE_GOODDATA_WORKSPACE_ID: string;
    readonly VITE_GOODDATA_DASHBOARD_ID: string;
    readonly VITE_GOODDATA_PIVOT_TABLE_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
