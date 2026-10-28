// Prototype fonts, bundled by Vite: Schibsted Grotesk for the UI, Newsreader for display titles.
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/newsreader";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./router";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
