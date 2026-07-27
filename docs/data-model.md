# Modelo de datos

Esta plataforma persiste sobre **Postgres** usando **Drizzle ORM**. El
esquema TypeScript vive en `db/schema/*.ts` (un archivo por dominio,
re-exportado desde `db/schema/index.ts`), y las migraciones SQL generadas a
partir de ese esquema viven en `db/migrations/`. El flujo de trabajo es:

1. Editar el esquema TypeScript en `db/schema/`.
2. `npm run db:generate` — Drizzle Kit compara el esquema con el último
   snapshot (`db/migrations/meta/*_snapshot.json`) y genera un nuevo archivo
   `NNNN_<nombre>.sql` con el diff.
3. `npm run db:migrate` — aplica las migraciones pendientes contra
   `DATABASE_URL`. Es el mismo comando que corre `vercel-build` en cada
   despliegue (ver `docs/deployment-vercel.md`).

Al momento de escribir este documento hay **11 migraciones** aplicadas
(`0000_init.sql` hasta `0010_omniscient_madripoor.sql`), todas coherentes con el
esquema TypeScript actual (ver nota de verificación al final del
documento).

Todas las tablas usan `uuid` (con `defaultRandom()`, es decir
`gen_random_uuid()`) como clave primaria, salvo las tablas de
llave-valor (`feature_flags`, `system_settings`, con `varchar` como PK) y
las tablas puramente asociativas con clave primaria compuesta
(`role_permissions`, `user_roles`, `group_members`). Casi todas las
tablas de negocio llevan `created_at timestamptz default now()`; las que
además se actualizan llevan `updated_at`.

---

## 1. Autenticación y sesiones

Definidas en `db/schema/auth.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `users` | Cuenta local de la plataforma, creada o vinculada desde Google. | `email` (varchar 320, índice único `users_email_unique_idx` sobre `lower(email)`), `password_hash` (compatibilidad heredada), `status` (`user_status`), `is_demo` boolean, `failed_login_attempts` int default 0, `locked_until`, `last_login_at`, `deleted_at` (soft delete) | Raíz de casi todas las FKs del sistema |
| `oauth_accounts` | Identidad externa vinculada a una cuenta local. | `provider`, `provider_account_id`, `email_at_link`; índices únicos por `(provider, provider_account_id)` y `(user_id, provider)` | `users` (cascade) |
| `user_profiles` | Perfil/preferencias de UI de un usuario (1:1). | `user_id` (PK, FK a `users.id` ON DELETE CASCADE), `display_name`, `avatar_url`, `locale` default `"es"`, `timezone` default `"UTC"`, `accessibility_preferences` jsonb tipado (`theme`, `reducedMotion`, `highContrast`, `lowStimulus`, `textScale`), `ui_state` jsonb libre (`Record<string, unknown>`) | `users` (1:1, PK compartida) |
| `sessions` | Sesión de navegador/API autenticada. | `token_hash`, `status` (`session_status`: `ACTIVE`/`REVOKED`/`EXPIRED`), `user_agent`, `ip_truncated`, `expires_at` (notNull), `revoked_at`, **`mfa_verified_at`** (nullable) | `users` (cascade) |
| `email_verification_tokens` | Token de verificación de correo. | `token_hash`, `email`, `expires_at` (notNull), `consumed_at` | `users` (cascade) |
| `password_reset_tokens` | Token de restablecimiento de contraseña. | `token_hash`, `expires_at` (notNull), `consumed_at`, `request_ip` | `users` (cascade) |
| `mfa_credentials` | Credencial TOTP + códigos de recuperación de un usuario. | `secret_encrypted` text, `recovery_codes_hash` jsonb `string[]` default `[]`, `enabled_at` (nullable: null = configurado pero no activado) | `users` (cascade) |

**Patrón `mfa_verified_at` (gating de sesión):** en `sessions`, esta
columna queda `null` mientras un login con MFA habilitado está pendiente
de la entrada del código TOTP — se fija únicamente en el momento de
creación de la sesión cuando el usuario tiene MFA activo. La lógica de
`getCurrentSession()` trata un valor nulo aquí como "todavía no
autenticado" para cualquier usuario con MFA habilitado, de forma que la
sola cookie de sesión nunca es suficiente para obtener acceso sin haber
superado el segundo factor.

## 2. RBAC (roles, permisos y grupos)

Definidas en `db/schema/rbac.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `roles` | Rol del sistema (p. ej. `SUPER_ADMIN`, `TOOL_ADMIN`, etc.). | `key` varchar(64) unique, `name`, `description`, `is_system` (declarado como `text`, no boolean, default `"true"`) | — |
| `permissions` | Permiso atómico. | `key` varchar(96) unique, `description` | — |
| `role_permissions` | Asociación rol↔permiso. | PK compuesta `(role_id, permission_id)` | `roles`, `permissions` (ambas cascade) |
| `user_roles` | Asociación usuario↔rol. | PK compuesta `(user_id, role_id)`, `assigned_by` (FK a `users`, `set null`), `assigned_at` | `users`, `roles` (cascade); índice `user_roles_role_idx` |
| `groups` | Grupo de usuarios (para asignación de herramientas o límites). | `name`, `description`, `created_by` (FK `users`, `set null`), `deleted_at` (soft delete) | — |
| `group_members` | Asociación grupo↔usuario. | PK compuesta `(group_id, user_id)`, `added_at` | `groups`, `users` (cascade); índice `group_members_user_idx` |

## 3. Proveedores de IA

Definidas en `db/schema/providers.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `providers` | Proveedor externo de IA (LLM, embeddings, STT, TTS, moderación). | `kind` varchar(24) libre (`llm`\|`embedding`\|`stt`\|`tts`\|`moderation`, no es un pgEnum), `key` unique, `enabled` boolean, `configured_via_env` boolean default `true`, `last_healthcheck_at`, `last_healthcheck_status` | — |
| `provider_models` | Modelo concreto ofrecido por un proveedor, con costos y ventana de contexto. | `provider_id` (FK cascade), `model_key`, `display_name`, `context_window` default 8000, `input_cost_per_mille_cents` / `output_cost_per_mille_cents` (`numeric(10,4)`), `available` boolean, `is_fallback_candidate` boolean, `metadata` jsonb libre | `providers` (cascade); índice único `provider_models_provider_key_idx` sobre `(provider_id, model_key)` |

## 4. Herramientas y versiones

Definidas en `db/schema/tools.ts`. Este es el dominio más grande del
esquema: modela el ciclo de vida completo de una "herramienta" (chatbot
configurable) con versionado independiente de su configuración.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `tools` | Entidad raíz de una herramienta (identidad estable a través de versiones). | `slug` unique, `category`, `responsible_user_id` (FK `users`, `set null`), `team`, `status` (`tool_status`, default `DRAFT`), `published_version_id` / `draft_version_id` (uuid sueltos, **sin FK declarada** — apuntan a `tool_versions.id` por convención de aplicación), `archived_at` | índice único `tools_slug_idx`, índice `tools_status_idx` |
| `tool_versions` | Versión inmutable de la configuración de una herramienta. | `tool_id` (cascade), `version_number`, `status` (`tool_version_status`), `configuration_snapshot` jsonb libre, `prompt_hash`, `knowledge_revision` int, `evaluation_status` (`evaluation_status_on_version`), `scheduled_for`, `published_at`, `superseded_at` | índice único `(tool_id, version_number)`, índice por `status`; es el "hub" del que cuelgan branding/behavior/models/capabilities/etc. (todas 1:1 por `tool_version_id` único) |
| `tool_branding` | Identidad visual y textos de marketing de una versión. | `tool_version_id` (unique, cascade), `name`, `short_name`, `description` varchar(280), `full_description`, `tags` jsonb `string[]`, `target_audience`, `icon_url`/`logo_url`/`cover_image_url`, `primary_color`/`secondary_color` (default `#1d4ed8`/`#0f172a`), `theme` default `"system"` | `tool_versions` (1:1) |
| `tool_behavior` | Prompt de sistema y personalidad conversacional. | `system_prompt` notNull, `additional_instructions`, `tone`, `personality`, `language` default `"es"`, `welcome_message` notNull, `suggested_questions` jsonb `string[]`, `error_message` (con default en español), `closing_message`, `scope_notice` notNull, `limitations`, `rules` jsonb `string[]`, `allowed_profile_fields` jsonb `string[]`, `example_exchanges` jsonb `Array<{user, assistant}>`, `memory_mode` (`memory_mode`, default `DISABLED`) | `tool_versions` (1:1) |
| `tool_models` | Configuración de modelo/generación de una versión. | `provider_id` (FK `providers`, `set null`), `primary_model_id`/`fallback_model_id` (FK `provider_models`, `set null`), `temperature`/`top_p` (`numeric(3,2)`), `max_output_tokens`, `timeout_ms`, `max_retries`, `streaming_enabled`, `context_token_limit`, `fallback_policy`, `budget_monthly_cents`, `per_user_daily_message_limit`, `per_user_monthly_token_limit`, `conversation_limit`, `file_limit`, `storage_limit_bytes` | `tool_versions` (1:1) |
| `tool_capabilities` | Matriz de capacidades habilitadas/deshabilitadas de una versión (feature gating). | Booleanos: `text`, `streaming`, `voice_input`, `voice_output`, `files`, `images`, `forms`, `quick_replies`, `menus`, `memory`, `history`, `rag`, `export_enabled`, `document_generation`, `internal_tools`, `external_apis`, `notifications`, `evaluations`, `escalation`, `feedback`, `pwa`, `deep_links`; `external_api_endpoints` jsonb `Array<{name, url, method, description?}>` | `tool_versions` (1:1) |
| `tool_access_rules` | Reglas de quién puede acceder a la herramienta y cuándo. | `mode` (`access_mode`), `starts_at`/`ends_at`, `quota`, `waitlist_enabled`, `grace_period_days`, `allowed_hours` jsonb `{start,end}\|null`, `allowed_countries` jsonb `string[]`, `feature_flag_key` | `tool_versions` (1:1) |
| `tool_safety_policies` | Políticas de seguridad/moderación/confirmaciones de una versión. | `risk_level` varchar(16) (valores de `risk_level` pero declarada como varchar libre, no FK de enum), `disclaimers`/`restricted_topics`/`rejection_rules`/`risk_signals`/`confirmations_required`/`allowed_internal_tools`/`prohibited_actions` (todos jsonb `string[]`), `input_moderation`/`output_moderation` booleanos, `contingency_message`, `escalation_policy`, `age_restriction` int | `tool_versions` (1:1) |
| `tool_pwa_configs` | Configuración de manifest PWA por herramienta. | `name`/`short_name`/`description`, `theme_color`/`background_color`, `start_url`, `scope`, `display` default `"standalone"`, `orientation`, `shortcuts` jsonb `Array<{name,url}>`, `screenshots` jsonb `string[]`, `offline_page_url`, `update_policy`, `subdomain`, `base_path`, `deep_links` jsonb `string[]` | `tool_versions` (1:1) |
| `tool_quick_actions` | Botones de respuesta rápida configurados para una versión. | `label`, `payload` jsonb libre, `icon_key`, `sort_order` | `tool_versions` (cascade, 1:N); índice `tool_quick_actions_version_idx` |
| `tool_flows` | Definición de flujo/formulario (menús, forms) de una versión. | `kind` varchar(16), `name`, `schema_json` jsonb notNull, `sort_order` | `tool_versions` (cascade, 1:N); índice `tool_flows_version_idx` |
| `tool_publications` | Historial de acciones de publicación/despublicación/programación de una versión. | `tool_id`, `tool_version_id` (ambos cascade), `published_by` (FK `users`, `set null`), `action` varchar(24), `scheduled_for`, `executed_at`, `notes` | índice `tool_publications_tool_idx` |
| `tool_assignments` | Asignación admin de acceso (allow/deny) a un sujeto (usuario, grupo o rol). | `subject_type` varchar(16), `user_id`/`group_id`/`role_id` (nullable según el tipo de sujeto, todos cascade), `decision` varchar(8) default `"ALLOW"`, `assigned_by` (FK `users`, `set null`) | índices por tool/user/group/role |
| `access_requests` | Solicitud de un usuario para acceder a una herramienta en modo `REQUEST_APPROVAL`. | `status` varchar(16) default `"PENDING"`, `reason`, `reviewed_by` (FK `users`, `set null`), `reviewed_at` | `tools`/`users` (cascade); índice único `(tool_id, user_id)` |
| `tool_activations` | Activación self-service de un usuario ("agregué esta herramienta a mi lista"). Distinta de `tool_assignments` (gestión admin) y `access_requests` (flujo de aprobación); alimenta la distinción `AVAILABLE` vs `ACTIVE` del catálogo. | `activated_at`, `deactivated_at` (nullable = sigue activa) | `tools`/`users` (cascade); índice único `(tool_id, user_id)` |

## 5. Conversaciones y mensajes

Definidas en `db/schema/conversations.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `conversations` | Hilo de conversación de un usuario con una herramienta (ligado a una versión concreta). | `user_id` (cascade), `tool_id` (cascade), `tool_version_id` (**ON DELETE RESTRICT** — no se puede borrar una versión con conversaciones activas), `title` default `"Nueva conversación"`, `status` (`conversation_status`), `last_message_at`, `archived_at`, `deleted_at` (soft delete), `metadata` jsonb libre | índices por user, tool, status y compuesto `(user_id, status)` |
| `messages` | Mensaje individual dentro de una conversación. | `conversation_id` (cascade), `role` (`message_role`: `system`\|`user`\|`assistant`\|`tool`), `content` text default `""`, `content_type` default `"text"`, `status` (`message_status`), `provider`/`model`, `input_tokens`/`output_tokens` int, `estimated_cost_cents` numeric(10,4), `latency_ms`, `finish_reason`, **`moderation_result`** jsonb (`Record<string,unknown>\|null` — resultado crudo del proveedor de moderación), **`citations`** jsonb `Array<{documentId, chunkId, title}>` (fuentes de RAG citadas en la respuesta), **`attached_file_ids`** jsonb `string[]` (IDs de `uploaded_files` adjuntos por el usuario a este mensaje), **`generated_file_ids`** jsonb `string[]` (IDs de `generated_files` producidos por el asistente en este mensaje) | índice por conversación y compuesto `(conversation_id, created_at)` |
| `message_feedback` | Calificación de un usuario sobre una respuesta del asistente. | `message_id`/`user_id` (cascade), `rating` varchar(8) (`up`\|`down`), `comment` | índice `message_feedback_message_idx` |
| `conversation_memories` | Entradas de memoria (recuerdos) que el asistente guarda sobre un usuario/herramienta, según el modo de memoria configurado. | `user_id`/`tool_id` (cascade), `conversation_id` (opcional, cascade), `mode` (`memory_mode`), `key`, `value` text, `source` default `"assistant"`, `expires_at` (nullable = sin vencimiento) | índice `(user_id, tool_id)` |
| `tool_call_confirmations` | Pausa de una llamada a herramienta interna que requiere confirmación humana antes de ejecutarse (human-in-the-loop, §15 de la especificación). | `conversation_id`/`user_id`/`tool_id` (cascade), `reservation_id` (FK `usage_reservations`, cascade), `tool_call_id`, `tool_name`, `arguments_json` text, `status` (`tool_call_confirmation_status`), **`generation_state_snapshot`** jsonb nullable (ver patrón abajo), `resolved_at`, `expires_at` notNull | índices por conversación, status y `expires_at` |

**Patrón pausa/reanudación de `tool_call_confirmations`:** cuando el
modelo solicita una herramienta marcada como `requiresConfirmation` (o
listada en `tool_safety_policies.confirmations_required`), el bucle de
generación se pausa en vez de ejecutar automáticamente. La columna
`generation_state_snapshot` guarda todo lo necesario para reanudar
exactamente donde se pausó: los mensajes de la ronda de generación en
curso, el número de ronda, el uso de tokens y la latencia acumulados, el
contenido del mensaje del usuario, las llamadas a herramientas restantes
de la misma ronda aún no procesadas, y los documentos ya generados en el
mismo turno (por `generate_text_document`) que deben persistirse cuando
el turno finalmente termine. Este estado nunca se puede re-derivar desde
`messages`, porque los mensajes intermedios de llamada/resultado de
herramienta de una ronda en curso no se persisten ahí (solo la respuesta
final visible se guarda en `messages`). Una vez que la confirmación llega
a un estado terminal (`APPROVED`/`REJECTED`/`EXPIRED`) el snapshot se
limpia (se pone a `null`) en vez de dejar contenido conversacional
sensible persistido indefinidamente. El estado intermedio `EXECUTING`
existe para que exactamente una solicitud de aprobación pueda "reclamar"
la confirmación de forma atómica mientras la herramienta se ejecuta,
evitando condiciones de carrera entre intentos concurrentes de
aprobar/rechazar/expirar la misma confirmación.

## 6. Archivos

Definidas en `db/schema/files.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `uploaded_files` | Archivo subido por un usuario (adjunto a un mensaje/conversación/herramienta). | `user_id` (cascade), `tool_id` (nullable, cascade), `conversation_id` (nullable, cascade), `message_id` (nullable, `set null`), `original_name`, `blob_key`, `mime_type`, `size_bytes`, `checksum`, `status` (`file_status`), `expires_at` (nullable), `deleted_at` (soft delete) | índices por usuario y por conversación |
| `generated_files` | Archivo/documento generado por el asistente (p. ej. `generate_text_document`). | Misma forma que `uploaded_files` más `kind` varchar(40) y `title` varchar(255) notNull; sin columna `checksum`/`status` | índice `generated_files_user_idx` |

**Patrón de retención de archivos:** tanto `uploaded_files` como
`generated_files` llevan `expires_at` (nullable — `null` significa sin
vencimiento) y `deleted_at` (soft delete). El cron diario de limpieza
(consolidado en `/api/v1/cron/daily`, ver `docs/deployment-vercel.md`)
recorre archivos con `expires_at` vencido y los marca/borra, liberando
también el objeto correspondiente en Vercel Blob (`blob_key`). El mismo
mecanismo de `expires_at` se usa en `tool_call_confirmations` para
expirar confirmaciones pendientes no resueltas a tiempo.

## 7. Base de conocimiento (RAG)

Definidas en `db/schema/knowledge.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `knowledge_bases` | Colección de documentos de conocimiento asociada a una herramienta. | `tool_id` (nullable, cascade), `name`, `description`, `language` default `"es"`, `created_by` (FK `users`, `set null`), `disabled_at`, `deleted_at` (soft delete) | — |
| `knowledge_documents` | Documento fuente subido a una base de conocimiento. | `knowledge_base_id` (cascade), `name`, `mime_type`, `size_bytes` default 0, `blob_key`/`checksum` (nullable mientras se sube), `status` (`knowledge_document_status`), `version` int default 1, `language`, `created_by` (`set null`), `processed_at`, `error_code`/`error_message` | índice `knowledge_documents_kb_idx` |
| `knowledge_document_versions` | Historial de versiones de un documento (re-subidas). | `document_id` (cascade), `version`, `blob_key`/`checksum` notNull | índice `knowledge_document_versions_doc_idx` |
| `knowledge_chunks` | Fragmento indexado de un documento, con su embedding. | `document_id`/`knowledge_base_id` (cascade), `chunk_index`, `content` text, **`embedding`** jsonb `number[]` (no es columna `vector` de pgvector), `metadata` jsonb libre | índices por documento y por base de conocimiento |

**Nota de diseño (embeddings sin pgvector):** `knowledge_chunks.embedding`
se almacena como un arreglo de floats en una columna `jsonb` simple, no
como un tipo `vector` de la extensión `pgvector`. Esto evita cualquier
dependencia de extensión de base de datos; la búsqueda por similitud se
hace en código de aplicación (similitud coseno, en
`lib/knowledge/retrieval.ts`), lo cual es adecuado a la escala de una
base de conocimiento por herramienta y queda abierto a migrar después a
`pgvector` o un vector store externo sin cambiar el contrato del
pipeline de ingesta.

## 8. Uso y costos

Definidas en `db/schema/usage.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `usage_events` | Registro de un evento de consumo (mensaje, embedding, job, audio) para métricas/analítica. | `user_id`/`tool_id`/`conversation_id`/`message_id` (todos nullable; `conversation_id`/`message_id` en `set null`, resto `cascade`), `kind` varchar(32) (`message`\|`embedding`\|`job`\|`audio`), `provider`/`model`, `input_tokens`/`output_tokens`, `cost_cents` numeric(10,4) | índices por usuario, herramienta y `created_at` |
| `usage_reservations` | Reserva de costo estimado creada **antes** de iniciar una generación, y conciliada (o liberada) justo después. | `user_id`/`tool_id` (cascade), `conversation_id` (nullable, `set null`), `idempotency_key` varchar(128), `estimated_cost_cents` notNull, `reconciled_cost_cents` (nullable hasta reconciliar), `status` varchar(16) default `"HELD"` (`HELD`\|`RECONCILED`\|`RELEASED`) | índice por `idempotency_key` y por usuario |
| `usage_limits` | Límite configurado a nivel de usuario, herramienta, grupo, proveedor o modelo. | `scope` varchar(16) (`user`\|`tool`\|`group`\|`provider`\|`model`), `user_id`/`tool_id`/`group_id` (todos nullable, cascade), `daily_message_limit`, `monthly_token_limit`, `monthly_cost_limit_cents`, `conversation_limit`, `file_limit`, `storage_limit_bytes` | índice `usage_limits_scope_idx` |
| `budgets` | Presupuesto mensual configurado para una herramienta. | `tool_id` (nullable, cascade), `period_monthly_cents` notNull, `alert_threshold_percent` default 80, `hard_stop` integer default 1 (usado como booleano) | — |
| `cost_events` | Evento de costo bruto (fuente de auditoría de gasto). | `tool_id`/`user_id` (nullable; `tool_id` cascade, `user_id` `set null`), `source` varchar(32), `amount_cents` numeric(10,4), `metadata` jsonb libre | índices por herramienta y `created_at` |

**Patrón reserva→conciliación:** `usage_reservations` se crea con un
costo estimado antes de que empiece la generación de una respuesta, y se
reconcilia (o libera) inmediatamente después con el costo real. Esto es
lo que evita doble cobro en reintentos y mantiene un techo de
presupuesto (`budgets`/`usage_limits`) significativo bajo solicitudes
concurrentes. `tool_call_confirmations.reservation_id` referencia
directamente una fila de `usage_reservations`, de forma que una
confirmación pendiente mantiene "reservado" el costo de la llamada a
herramienta que está en pausa.

## 9. Evaluaciones

Definidas en `db/schema/evaluations.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `evaluation_suites` | Conjunto de criterios de evaluación de una herramienta (independiente de versión). | `tool_id` (cascade), `name`, `description`, `criteria` jsonb `string[]`, `thresholds` jsonb `Record<string, number>`, `is_mandatory_for_publish` integer default 1 (usado como booleano), `created_by` (`set null`) | — |
| `evaluation_cases` | Caso de prueba individual dentro de una suite. | `suite_id` (cascade), `input` text, `context` jsonb libre, `expected_behavior` text, `rules` jsonb `string[]`, `risk_level` varchar(16), `tags` jsonb `string[]` | índice `evaluation_cases_suite_idx` |
| `evaluation_runs` | Ejecución de una suite contra una versión concreta de herramienta. | `suite_id`/`tool_version_id` (cascade), `status` (`evaluation_run_status`), `triggered_by` (`set null`), `started_at`/`completed_at`, `summary` jsonb libre, `passed` integer nullable | índice `evaluation_runs_version_idx` |
| `evaluation_results` | Resultado de un caso concreto dentro de una ejecución. | `run_id`/`case_id` (cascade), `actual_output` text, `scores` jsonb `Record<string, number>`, `passed` integer default 0 (booleano), `latency_ms`, `tokens`, `notes` | índice `evaluation_results_run_idx` |

## 10. Trabajos en segundo plano

Definidas en `db/schema/jobs.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `background_jobs` | Trabajo asíncrono encolado (procesamiento de conocimiento, publicaciones programadas, limpieza, evaluaciones, etc.), consumido por el `JobProvider` (cron polling en producción). | `type` varchar(64), `status` (`job_status`), `payload`/`result` jsonb, `progress` int default 0, `attempt`/`max_attempts` (default 5), `idempotency_key` varchar(160) unique, `scheduled_at`, `started_at`/`completed_at`, `error_code`/`error_message`, `created_by` (`set null`) | índice único por `idempotency_key`, índices por `status` y `type` |

## 11. Notificaciones y cumplimiento legal

Definidas en `db/schema/notifications.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `notifications` | Notificación in-app dirigida a un usuario. | `user_id` (cascade), `kind` varchar(40), `title`, `body`, `link`, `read_at` (nullable = no leída) | índice por usuario y compuesto `(user_id, read_at)` para no-leídas |
| `legal_documents` | Versión publicada de un documento legal (política de privacidad, términos, aviso de alcance de una herramienta). | `kind` varchar(40) (`privacy_policy`\|`terms`\|`tool_scope_notice`), `tool_id` (uuid suelto, **sin FK declarada**), `version` int default 1, `content` text, `published_at` | — |
| `consents` | Consentimiento otorgado/revocado por un usuario sobre un documento legal. | `user_id`/`legal_document_id` (cascade), `kind` varchar(40), `granted` boolean default `true`, `version` int, `revoked_at` | índice `consents_user_idx` |
| `legal_acceptances` | Aceptación registrada de un documento legal (p. ej. términos al primer login). | `user_id`/`legal_document_id` (cascade), `accepted_at` | índice `legal_acceptances_user_idx` |
| `data_requests` | Solicitud de exportación o borrado de datos personales (derecho ARCO/GDPR-like). | `user_id` (cascade), `kind` varchar(24) (`export`\|`deletion`), `status` varchar(24) default `"PENDING"`, `requested_at`/`completed_at`, `result_blob_key`, `metadata` jsonb libre | índice `data_requests_user_idx` |

## 12. Auditoría y seguridad

Definidas en `db/schema/audit.ts`.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `audit_events` | Registro de auditoría de una acción administrativa/de negocio (quién hizo qué, sobre qué recurso, con qué resultado). | `actor_id` (FK `users`, `set null`), `action` varchar(80), `resource_type` varchar(60), `resource_id` varchar(80), `result` varchar(16) default `"SUCCESS"`, `reason`, `ip_truncated`, `user_agent`, `correlation_id` varchar(80), `metadata` jsonb libre | índices por actor, por `(resource_type, resource_id)` y por `created_at` |
| `security_events` | Evento de seguridad (intentos de login fallidos, bloqueos, anomalías) para monitoreo. | `kind` varchar(60), `severity` varchar(16) default `"INFO"`, `user_id` (`set null`), `ip_truncated`, `details` jsonb libre | índices por `kind` y por `created_at` |

## 13. Configuración

Definidas en `db/schema/settings.ts`. Ambas son tablas llave-valor sin
`id` propio: la clave de negocio es la propia clave primaria.

| Tabla | Descripción | Columnas clave | Relaciones |
|---|---|---|---|
| `feature_flags` | Interruptor de característica activable en runtime. | `key` varchar(80) **PK**, `description`, `enabled` boolean default `false`, `updated_at` | — |
| `system_settings` | Valor de configuración global de la plataforma. | `key` varchar(80) **PK**, `value` jsonb libre (`unknown`) notNull, `updated_at` | — |

---

## 14. Enums (`db/schema/enums.ts`)

Todos los enums son `pgEnum` de Postgres (tipos nativos, no `varchar`
con `check`). Varios lugares del esquema usan un `varchar` libre en vez
de referenciar uno de estos enums para el mismo concepto (anotado en las
tablas correspondientes más arriba, p. ej. `providers.kind`,
`tool_safety_policies.risk_level`, `usage_reservations.status`).

| Enum | Valores permitidos |
|---|---|
| `user_status` | `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `BLOCKED`, `DELETED` |
| `session_status` | `ACTIVE`, `REVOKED`, `EXPIRED` |
| `tool_status` | `DRAFT`, `CONFIGURATION_INCOMPLETE`, `INTERNAL_TESTING`, `UNDER_REVIEW`, `APPROVED`, `SCHEDULED`, `PUBLISHED`, `PAUSED`, `SUSPENDED`, `ARCHIVED` |
| `tool_version_status` | `DRAFT`, `TESTING`, `UNDER_REVIEW`, `APPROVED`, `SCHEDULED`, `PUBLISHED`, `SUPERSEDED`, `ROLLED_BACK` |
| `evaluation_status_on_version` | `NOT_RUN`, `PASSED`, `FAILED`, `SKIPPED` |
| `access_mode` | `ALL_USERS`, `SELECTED_USERS`, `GROUPS`, `ROLES`, `INVITATION`, `REQUEST_APPROVAL` |
| `catalog_state` | `AVAILABLE`, `ACTIVE`, `ACCESS_REQUESTED`, `APPROVAL_REQUIRED`, `INVITATION_ONLY`, `COMING_SOON`, `PAUSED`, `SUSPENDED`, `EXPIRED` |
| `conversation_status` | `ACTIVE`, `ARCHIVED`, `DELETED`, `BLOCKED`, `INTERRUPTED`, `EXPORTING` |
| `message_role` | `system`, `user`, `assistant`, `tool` |
| `message_status` | `PENDING`, `STREAMING`, `COMPLETED`, `CANCELLED`, `FAILED`, `BLOCKED` |
| `memory_mode` | `DISABLED`, `CONVERSATION_ONLY`, `SESSION_ONLY`, `USER_APPROVED`, `STRUCTURED`, `LONG_TERM` |
| `knowledge_document_status` | `UPLOADING`, `UPLOADED`, `VALIDATING`, `PROCESSING`, `INDEXING`, `READY`, `FAILED`, `DISABLED`, `DELETED` |
| `job_status` | `CREATED`, `QUEUED`, `RUNNING`, `RETRYING`, `COMPLETED`, `FAILED`, `CANCELLING`, `CANCELLED`, `DEAD_LETTER` |
| `evaluation_run_status` | `CREATED`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `file_status` | `PENDING`, `UPLOADED`, `VALIDATED`, `REJECTED`, `DELETED` |
| `risk_level` | `LOW`, `MEDIUM`, `HIGH` |
| `tool_call_confirmation_status` | `PENDING`, `EXECUTING`, `APPROVED`, `REJECTED`, `EXPIRED` (`EXECUTING` se agregó en la migración `0004`, ver nota abajo) |

`catalog_state` está definido en `enums.ts` pero no se usa como tipo de
ninguna columna del esquema actual — es un enum "conceptual" que combina
estado de la herramienta y de la relación usuario↔herramienta
(`tool_status`, `tool_access_rules`, `tool_activations`) para efectos de
presentación en el catálogo, calculado en código de aplicación en vez de
almacenado.

---

## Nota de verificación (esquema vs. migraciones)

Se revisaron las 9 migraciones (`0000_init.sql` a `0008_stormy_prism.sql`)
contra el esquema TypeScript actual. No se encontró deriva: cada cambio
posterior a `0000_init.sql` corresponde exactamente a una columna o
constraint presente hoy en `db/schema/`:

- `0001_tool_activations.sql` — creación de `tool_activations`.
- `0002_memory_mode.sql` — agrega `tool_behavior.memory_mode`.
- `0003_silky_dust.sql` — creación de `tool_call_confirmations` (con
  `generation_state_snapshot` originalmente `NOT NULL`).
- `0004_overjoyed_frog_thor.sql` — agrega el valor `EXECUTING` al enum
  `tool_call_confirmation_status`.
- `0005_dapper_cyclops.sql` — quita el `NOT NULL` de
  `generation_state_snapshot` (habilita el patrón de limpiar el snapshot
  al resolver, descrito en la sección 5).
- `0006_ordinary_manta.sql` — agrega `tool_capabilities.external_api_endpoints`.
- `0007_cooing_red_wolf.sql` — agrega `sessions.mfa_verified_at`.
- `0008_stormy_prism.sql` — agrega `messages.generated_file_ids` y
  `generated_files.title`.

No hay columnas, tablas o constraints en el esquema TypeScript que
carezcan de migración correspondiente, ni migraciones que hayan quedado
"huérfanas" de su definición TS.
