import express from "express";
import { detectionRoutes } from "./features/detection/detection.routes";
import { suppressionRoutes } from "./features/suppression/suppression.routes";
import { attributionRoutes } from "./features/attribution/attribution.routes";
import { retrievalRoutes } from "./features/retrieval/retrieval.routes";
import { narrativeRoutes } from "./features/narrative/narrative.routes";
import { verifierRoutes } from "./features/verifier/verifier.routes";
import { findingsRoutes } from "./features/findings/findings.routes";
import { metricsRoutes } from "./features/metrics/metrics.routes";
import { sourcesRoutes } from "./features/sources/sources.routes";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/detection", detectionRoutes());
app.use("/api/suppression", suppressionRoutes());
app.use("/api/attribution", attributionRoutes());
app.use("/api/retrieval", retrievalRoutes());
app.use("/api/narrative", narrativeRoutes());
app.use("/api/verifier", verifierRoutes());
app.use("/api/findings", findingsRoutes());
app.use("/api/metrics", metricsRoutes());
app.use("/api/sources", sourcesRoutes());
