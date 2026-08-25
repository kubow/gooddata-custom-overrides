import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), [
        "GOODDATA_HOSTNAME",
        "TIGER_API_TOKEN",
        "PORT",
        "VITE_GOODDATA_",
    ]);
    const {
        GOODDATA_HOSTNAME: hostname,
        VITE_GOODDATA_WORKSPACE_ID: workspaceId,
    } = env;
    const port = Number(env.PORT || 3000);

    if (!hostname) {
        throw new Error("GOODDATA_HOSTNAME must not be empty.");
    }

    const backendUrl = new URL(hostname);

    if (backendUrl.protocol !== "https:") {
        throw new Error("GOODDATA_HOSTNAME must use HTTPS.");
    }

    if (!workspaceId) {
        throw new Error("GOODDATA_WORKSPACE_ID must not be empty.");
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT must be an integer between 1 and 65535.");
    }

    return {
        plugins: [react()],
        build: {
            outDir: "dist",
            chunkSizeWarningLimit: 15000,
        },
        server: {
            host: "127.0.0.1",
            port,
            strictPort: true,
            cors: false,
            fs: {
                strict: true,
            },
            proxy: {
                "/api": {
                    target: backendUrl.origin,
                    changeOrigin: true,
                    cookieDomainRewrite: "127.0.0.1",
                    configure: (proxy) => {
                        proxy.on("proxyReq", (proxyRequest) => {
                            proxyRequest.removeHeader("origin");
                            proxyRequest.setHeader("accept-encoding", "identity");

                            if (env.TIGER_API_TOKEN) {
                                proxyRequest.setHeader("authorization", `Bearer ${env.TIGER_API_TOKEN}`);
                            }
                        });
                    },
                },
            },
        },
        preview: {
            host: "127.0.0.1",
            port,
            strictPort: true,
        },
    };
});
