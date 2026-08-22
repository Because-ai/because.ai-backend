import { sql } from "./db/client";
import { OpenRouterClient } from "./lib/openrouter";
import { VoyageClient } from "./lib/voyage";
import { OrdersRepository } from "./repositories/orders.repository";
import { CalendarRepository } from "./repositories/calendar.repository";
import { NotesRepository } from "./repositories/notes.repository";
import { CachedFindingsRepository } from "./repositories/cached-findings.repository";
import { DetectionService } from "./features/detection/detection.service";
import { DetectionController } from "./features/detection/detection.controller";
import { SuppressionService } from "./features/suppression/suppression.service";
import { SuppressionController } from "./features/suppression/suppression.controller";
import { AttributionService } from "./features/attribution/attribution.service";
import { AttributionController } from "./features/attribution/attribution.controller";
import { RetrievalService } from "./features/retrieval/retrieval.service";
import { RetrievalController } from "./features/retrieval/retrieval.controller";
import { NarrativeService } from "./features/narrative/narrative.service";
import { NarrativeController } from "./features/narrative/narrative.controller";
import { VerifierService } from "./features/verifier/verifier.service";
import { VerifierController } from "./features/verifier/verifier.controller";
import { FindingsService } from "./features/findings/findings.service";
import { FindingsController } from "./features/findings/findings.controller";

const ordersRepository = new OrdersRepository(sql);
const calendarRepository = new CalendarRepository(sql);
const notesRepository = new NotesRepository(sql);
const cachedFindingsRepository = new CachedFindingsRepository(sql);

const openRouterClient = new OpenRouterClient();
const voyageClient = new VoyageClient();

export const detectionService = new DetectionService(ordersRepository);
const suppressionService = new SuppressionService(calendarRepository);
const attributionService = new AttributionService(ordersRepository);
const retrievalService = new RetrievalService(notesRepository, voyageClient);
const narrativeService = new NarrativeService(openRouterClient);
const verifierService = new VerifierService(openRouterClient);

export const findingsService = new FindingsService(
  detectionService,
  suppressionService,
  attributionService,
  retrievalService,
  narrativeService,
  verifierService,
  cachedFindingsRepository
);

export const detectionController = new DetectionController(detectionService);
export const suppressionController = new SuppressionController(suppressionService);
export const attributionController = new AttributionController(attributionService);
export const retrievalController = new RetrievalController(retrievalService);
export const narrativeController = new NarrativeController(narrativeService);
export const verifierController = new VerifierController(verifierService);
export const findingsController = new FindingsController(findingsService);
