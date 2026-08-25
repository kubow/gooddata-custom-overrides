import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { installCustomEnglishMessages } from "./localization/en-US.js";
import "@gooddata/sdk-ui-kit/styles/css/main.css";
import "@gooddata/sdk-ui-filters/styles/css/main.css";
import "@gooddata/sdk-ui-charts/styles/css/main.css";
import "@gooddata/sdk-ui-pivot/styles/css/main.css";
import "@gooddata/sdk-ui-geo/styles/css/main.css";
import "@gooddata/sdk-ui-ext/styles/css/main.css";
import "@gooddata/sdk-ui-dashboard/styles/css/main.css";
import "./index.css";

installCustomEnglishMessages();

const rootElement = document.getElementById("root");

if (!rootElement) {
    throw new Error('Missing required root element: <div id="root">.');
}

createRoot(rootElement).render(<App />);
