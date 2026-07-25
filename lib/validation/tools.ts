import { z } from "zod";

export const slugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug solo puede contener minúsculas, números y guiones.");

export const createToolSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(40),
  description: z.string().min(1).max(280),
  category: z.string().max(64).optional(),
  team: z.string().max(120).optional(),
});
export type CreateToolInput = z.infer<typeof createToolSchema>;

export const brandingSchema = z.object({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(40),
  description: z.string().min(1).max(280),
  fullDescription: z.string().max(5000).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  targetAudience: z.string().max(200).optional(),
  iconUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  theme: z.enum(["light", "dark", "system"]),
});
export type BrandingInput = z.infer<typeof brandingSchema>;

export const behaviorSchema = z.object({
  systemPrompt: z.string().min(1).max(20000),
  additionalInstructions: z.string().max(20000).optional(),
  tone: z.string().max(64).optional(),
  personality: z.string().max(2000).optional(),
  language: z.string().max(10),
  welcomeMessage: z.string().min(1).max(2000),
  suggestedQuestions: z.array(z.string().max(200)).max(10).default([]),
  errorMessage: z.string().min(1).max(500),
  closingMessage: z.string().max(500).optional(),
  scopeNotice: z.string().min(1).max(2000),
  limitations: z.string().max(2000).optional(),
  rules: z.array(z.string().max(300)).max(30).default([]),
  additionalContext: z.string().max(5000).optional(),
  allowedProfileFields: z.array(z.string().max(60)).max(20).default([]),
  exampleExchanges: z.array(z.object({ user: z.string().max(1000), assistant: z.string().max(2000) })).max(10).default([]),
  memoryMode: z.enum(["DISABLED", "CONVERSATION_ONLY", "SESSION_ONLY", "USER_APPROVED", "STRUCTURED", "LONG_TERM"]).default("DISABLED"),
});
export type BehaviorInput = z.infer<typeof behaviorSchema>;

export const modelsSchema = z.object({
  providerId: z.string().uuid().optional(),
  primaryModelId: z.string().uuid().optional(),
  fallbackModelId: z.string().uuid().optional(),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  maxOutputTokens: z.number().int().min(1).max(32000),
  timeoutMs: z.number().int().min(1000).max(120000),
  maxRetries: z.number().int().min(0).max(5),
  streamingEnabled: z.boolean(),
  contextTokenLimit: z.number().int().min(500).max(2000000),
  fallbackPolicy: z.enum(["on_error", "never", "on_timeout"]),
  budgetMonthlyCents: z.number().int().min(0),
  perUserDailyMessageLimit: z.number().int().min(1),
  perUserMonthlyTokenLimit: z.number().int().min(1),
  conversationLimit: z.number().int().min(1),
  fileLimit: z.number().int().min(0),
  storageLimitBytes: z.number().int().min(0),
});
export type ModelsInput = z.infer<typeof modelsSchema>;

export const capabilitiesSchema = z.object({
  text: z.boolean(),
  streaming: z.boolean(),
  voiceInput: z.boolean(),
  voiceOutput: z.boolean(),
  files: z.boolean(),
  images: z.boolean(),
  forms: z.boolean(),
  quickReplies: z.boolean(),
  menus: z.boolean(),
  memory: z.boolean(),
  history: z.boolean(),
  rag: z.boolean(),
  exportEnabled: z.boolean(),
  documentGeneration: z.boolean(),
  internalTools: z.boolean(),
  externalApis: z.boolean(),
  notifications: z.boolean(),
  evaluations: z.boolean(),
  escalation: z.boolean(),
  feedback: z.boolean(),
  pwa: z.boolean(),
  deepLinks: z.boolean(),
});
export type CapabilitiesInput = z.infer<typeof capabilitiesSchema>;

export const accessRulesSchema = z.object({
  mode: z.enum(["ALL_USERS", "SELECTED_USERS", "GROUPS", "ROLES", "INVITATION", "REQUEST_APPROVAL"]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  quota: z.number().int().min(0).optional(),
  waitlistEnabled: z.boolean(),
  gracePeriodDays: z.number().int().min(0),
  allowedHours: z.object({ start: z.string(), end: z.string() }).nullable(),
  allowedCountries: z.array(z.string().length(2)).default([]),
  featureFlagKey: z.string().max(80).optional(),
});
export type AccessRulesInput = z.infer<typeof accessRulesSchema>;

export const safetyPoliciesSchema = z.object({
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  disclaimers: z.array(z.string().max(500)).default([]),
  restrictedTopics: z.array(z.string().max(200)).default([]),
  rejectionRules: z.array(z.string().max(300)).default([]),
  inputModeration: z.boolean(),
  outputModeration: z.boolean(),
  riskSignals: z.array(z.string().max(200)).default([]),
  contingencyMessage: z.string().max(1000).optional(),
  escalationPolicy: z.string().max(2000).optional(),
  ageRestriction: z.number().int().min(0).max(21).optional(),
  confirmationsRequired: z.array(z.string().max(200)).default([]),
  allowedInternalTools: z.array(z.string().max(80)).default([]),
  prohibitedActions: z.array(z.string().max(300)).default([]),
});
export type SafetyPoliciesInput = z.infer<typeof safetyPoliciesSchema>;

export const pwaConfigSchema = z.object({
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(40),
  description: z.string().min(1).max(280),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  startUrl: z.string().min(1).max(200),
  scope: z.string().min(1).max(200),
  display: z.enum(["standalone", "fullscreen", "minimal-ui", "browser"]),
  orientation: z.enum(["any", "portrait", "landscape"]),
  shortcuts: z.array(z.object({ name: z.string().max(60), url: z.string().max(200) })).max(4).default([]),
  screenshots: z.array(z.string().url()).max(8).default([]),
  offlinePageUrl: z.string().max(200),
  updatePolicy: z.enum(["prompt", "auto"]),
  subdomain: z.string().max(80).optional(),
  basePath: z.string().max(120).optional(),
  deepLinks: z.array(z.string().max(200)).default([]),
});
export type PwaConfigInput = z.infer<typeof pwaConfigSchema>;
