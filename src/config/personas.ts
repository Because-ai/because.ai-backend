export type PersonaKey = "executive" | "regional_manager" | "analyst";

export interface Persona {
  key: PersonaKey;
  label: string;
  audience: string;
  deliveryChannel: string;
  maxSentences: number;
  includeGaps: boolean;
  maxActions: number;
}

export const personas: Persona[] = [
  {
    key: "executive",
    label: "Executive",
    audience: "CFO and leadership team",
    deliveryChannel: "Monday morning leadership digest",
    maxSentences: 3,
    includeGaps: false,
    maxActions: 1,
  },
  {
    key: "regional_manager",
    label: "Regional manager",
    audience: "Regional sales and operations lead",
    deliveryChannel: "Slack alert to the regional channel",
    maxSentences: 5,
    includeGaps: false,
    maxActions: 3,
  },
  {
    key: "analyst",
    label: "Analyst",
    audience: "BI analyst validating the finding",
    deliveryChannel: "BI workspace with full evidence trail",
    maxSentences: 12,
    includeGaps: true,
    maxActions: 3,
  },
];

export const personaKeys = personas.map((persona) => persona.key);
