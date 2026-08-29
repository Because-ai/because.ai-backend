import { sql } from "./db/client";
import { LlmClient } from "./lib/llm";
import { EmbeddingClient } from "./lib/embeddings";
import { OrdersRepository } from "./repositories/orders.repository";
import { CalendarRepository } from "./repositories/calendar.repository";
import { NotesRepository } from "./repositories/notes.repository";
import { CachedFindingsRepository } from "./repositories/cached-findings.repository";
import { FeedbackRepository } from "./repositories/feedback.repository";
import { MarketingRepository } from "./repositories/marketing.repository";
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
import { MetricsService } from "./features/metrics/metrics.service";
import { MetricsController } from "./features/metrics/metrics.controller";
import { SourcesService } from "./features/sources/sources.service";
import { SourcesController } from "./features/sources/sources.controller";
import { SourcesRepository } from "./repositories/sources.repository";
import { ContractService } from "./features/contract/contract.service";
import { ContractController } from "./features/contract/contract.controller";
import { FeedbackService } from "./features/feedback/feedback.service";
import { FeedbackController } from "./features/feedback/feedback.controller";

const ordersRepository = new OrdersRepository(sql);
const calendarRepository = new CalendarRepository(sql);
const notesRepository = new NotesRepository(sql);
const cachedFindingsRepository = new CachedFindingsRepository(sql);
const sourcesRepository = new SourcesRepository(sql);
const feedbackRepository = new FeedbackRepository(sql);
const marketingRepository = new MarketingRepository(sql);

const llmClient = new LlmClient();
const embeddingClient = new EmbeddingClient();

export const detectionService = new DetectionService(ordersRepository);
const suppressionService = new SuppressionService(calendarRepository);
export const attributionService = new AttributionService(ordersRepository, marketingRepository);
const retrievalService = new RetrievalService(notesRepository, embeddingClient);
const narrativeService = new NarrativeService(llmClient);
const verifierService = new VerifierService(llmClient);
export const feedbackService = new FeedbackService(feedbackRepository);

export const findingsService = new FindingsService(
  detectionService,
  suppressionService,
  attributionService,
  retrievalService,
  narrativeService,
  verifierService,
  cachedFindingsRepository,
  feedbackService
);

const metricsService = new MetricsService();
const sourcesService = new SourcesService(sourcesRepository);
const contractService = new ContractService();

export const metricsController = new MetricsController(metricsService);
export const sourcesController = new SourcesController(sourcesService);
export const detectionController = new DetectionController(detectionService);
export const suppressionController = new SuppressionController(suppressionService);
export const attributionController = new AttributionController(attributionService);
export const retrievalController = new RetrievalController(retrievalService);
export const narrativeController = new NarrativeController(narrativeService);
export const verifierController = new VerifierController(verifierService);
export const findingsController = new FindingsController(findingsService);
export const contractController = new ContractController(contractService);
export const feedbackController = new FeedbackController(feedbackService);
