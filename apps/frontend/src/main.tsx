import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { startDevSession } from "./services/api/devSession";
import "./styles/globals.css";
import "./i18n";

startDevSession();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
