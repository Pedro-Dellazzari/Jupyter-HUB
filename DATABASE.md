# Database Schema — AI Assistant

> **Stack:** SQLite · **Schema file:** `schema.sql`  
> Este documento é a fonte de verdade do banco de dados do projeto. Sempre consulte aqui antes de criar queries, migrations ou novas features.

---

## Índice

- [Convenções Globais](#convenções-globais)
- [Diagrama de Relacionamentos](#diagrama-de-relacionamentos)
- [Tabelas](#tabelas)
  - [tags](#tags)
  - [tasks](#tasks) · [task\_tags](#task_tags) · [task\_checklist](#task_checklist)
  - [habits](#habits) · [habit\_logs](#habit_logs) · [habit\_tags](#habit_tags)
  - [meetings](#meetings) · [meeting\_participants](#meeting_participants) · [meeting\_tags](#meeting_tags)
  - [events](#events) · [event\_tags](#event_tags)
  - [conversations](#conversations) · [messages](#messages)
- [Indexes](#indexes)
- [Triggers](#triggers)
- [Enums e Valores Permitidos](#enums-e-valores-permitidos)
- [Regras de Negócio](#regras-de-negócio)
- [Queries Comuns](#queries-comuns)

---

## Convenções Globais

| Convenção | Detalhe |
|---|---|
| **IDs** | `TEXT` UUID gerado via `lower(hex(randomblob(16)))` |
| **Datas** | `TEXT` no formato ISO 8601: `YYYY-MM-DD HH:MM:SS` |
| **Booleanos** | `INTEGER`: `0 = false`, `1 = true` |
| **Soft delete** | Campo `deleted_at TEXT` — nunca deletar fisicamente |
| **Auditoria** | Toda tabela principal tem `created_at` e `updated_at` (atualizados por trigger) |
| **Recorrência** | Formato RRULE (RFC 5545): ex. `RRULE:FREQ=WEEKLY;BYDAY=MO,WE` |
| **Timezone padrão** | `America/Sao_Paulo` |
| **PRAGMAs ativos** | `journal_mode = WAL` e `foreign_keys = ON` |

---

## Diagrama de Relacionamentos

```
tags ──────────────────────────────────────────────────────────────┐
  │                                                                 │
  ├── task_tags ──── tasks ──── task_checklist                     │
  │                    │                                           │
  │                    └── tasks (parent_task_id, self-ref)        │
  │                                                                │
  ├── habit_tags ── habits ──── habit_logs                        │
  │                                                                │
  ├── meeting_tags ─ meetings ── meeting_participants              │
  │                    │                                           │
  │                    └── meetings (parent_meeting_id, self-ref) │
  │                                                                │
  └── event_tags ─── events ─── tasks (linked_task_id)           │
                        │    └── meetings (linked_meeting_id)     │
                        │    └── habits (linked_habit_id)         │
                        └── events (parent_event_id, self-ref)    │
                                                                   │
conversations ─── messages ─── tasks / meetings / habits / events ┘
```

---

## Tabelas

---

### `tags`

Tags globais compartilhadas entre todas as entidades.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | Identificador único |
| `name` | TEXT | ✅ | — | Nome da tag (único) |
| `color` | TEXT | ❌ | — | Cor em hex: `#FF5733` |
| `created_at` | TEXT | ✅ | `datetime('now')` | Data de criação |
| `deleted_at` | TEXT | ❌ | `NULL` | Soft delete |

---

### `tasks`

Tarefas principais do assistente.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | Identificador único |
| `title` | TEXT | ✅ | — | Título da tarefa |
| `description` | TEXT | ❌ | — | Descrição detalhada |
| `status` | TEXT | ✅ | `pending` | Ver [Enums](#tasks-1) |
| `priority` | TEXT | ✅ | `medium` | Ver [Enums](#tasks-1) |
| `due_date` | TEXT | ❌ | — | Data limite (`YYYY-MM-DD HH:MM:SS`) |
| `reminder_at` | TEXT | ❌ | — | Horário exato do lembrete |
| `reminder_sent` | INTEGER | ✅ | `0` | Flag: lembrete já enviado |
| `completed_at` | TEXT | ❌ | — | Quando foi concluída |
| `recurrence_rule` | TEXT | ❌ | — | RRULE para recorrência |
| `parent_task_id` | TEXT | ❌ | — | FK para subtarefas (self-ref) |
| `estimated_mins` | INTEGER | ❌ | — | Tempo estimado em minutos |
| `actual_mins` | INTEGER | ❌ | — | Tempo real gasto |
| `source` | TEXT | ❌ | `manual` | Ver [Enums](#tasks-1) |
| `notes` | TEXT | ❌ | — | Notas livres |
| `created_at` | TEXT | ✅ | `datetime('now')` | |
| `updated_at` | TEXT | ✅ | `datetime('now')` | Atualizado por trigger |
| `deleted_at` | TEXT | ❌ | `NULL` | Soft delete |

### `task_tags`

Tabela de junção many-to-many entre `tasks` e `tags`.

| Coluna | Tipo | Descrição |
|---|---|---|
| `task_id` | TEXT | FK → `tasks.id` CASCADE |
| `tag_id` | TEXT | FK → `tags.id` CASCADE |

### `task_checklist`

Itens de checklist vinculados a uma tarefa.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `task_id` | TEXT | ✅ | — | FK → `tasks.id` CASCADE |
| `item` | TEXT | ✅ | — | Texto do item |
| `is_done` | INTEGER | ✅ | `0` | Concluído? |
| `position` | INTEGER | ✅ | `0` | Ordem de exibição |
| `created_at` | TEXT | ✅ | `datetime('now')` | |

---

### `habits`

Hábitos recorrentes com tracking de streak.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `title` | TEXT | ✅ | — | Nome do hábito |
| `description` | TEXT | ❌ | — | |
| `frequency` | TEXT | ✅ | `daily` | Ver [Enums](#habits-1) |
| `frequency_days` | TEXT | ❌ | — | JSON array: `[1,3,5]` = seg, qua, sex (0=dom) |
| `target_count` | INTEGER | ✅ | `1` | Quantidade alvo por período |
| `target_unit` | TEXT | ❌ | `times` | Ver [Enums](#habits-1) |
| `custom_unit` | TEXT | ❌ | — | Unidade personalizada quando `target_unit = custom` |
| `reminder_time` | TEXT | ❌ | — | Horário do lembrete: `HH:MM` |
| `reminder_enabled` | INTEGER | ✅ | `1` | Lembrete ativo? |
| `color` | TEXT | ❌ | — | Cor hex |
| `icon` | TEXT | ❌ | — | Ícone (emoji ou nome) |
| `streak_current` | INTEGER | ✅ | `0` | Sequência atual de dias |
| `streak_best` | INTEGER | ✅ | `0` | Melhor sequência histórica |
| `start_date` | TEXT | ✅ | `date('now')` | Início do hábito |
| `end_date` | TEXT | ❌ | `NULL` | Fim (null = sem limite) |
| `is_active` | INTEGER | ✅ | `1` | Hábito ativo? |
| `notes` | TEXT | ❌ | — | |
| `created_at` | TEXT | ✅ | `datetime('now')` | |
| `updated_at` | TEXT | ✅ | `datetime('now')` | Atualizado por trigger |
| `deleted_at` | TEXT | ❌ | `NULL` | Soft delete |

### `habit_logs`

Registro diário de execução de um hábito.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `habit_id` | TEXT | ✅ | — | FK → `habits.id` CASCADE |
| `logged_date` | TEXT | ✅ | `date('now')` | Data do registro: `YYYY-MM-DD` |
| `value` | REAL | ✅ | `1` | Quantidade realizada no dia |
| `note` | TEXT | ❌ | — | Observação do dia |
| `mood` | INTEGER | ❌ | — | Humor de 1 a 5 |
| `created_at` | TEXT | ✅ | `datetime('now')` | |

> **Constraint:** `UNIQUE(habit_id, logged_date)` — apenas um log por hábito por dia.

### `habit_tags`

Tabela de junção many-to-many entre `habits` e `tags`.

---

### `meetings`

Reuniões, calls e compromissos com duração definida.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `title` | TEXT | ✅ | — | |
| `description` | TEXT | ❌ | — | |
| `status` | TEXT | ✅ | `scheduled` | Ver [Enums](#meetings-1) |
| `start_at` | TEXT | ✅ | — | Início: `YYYY-MM-DD HH:MM:SS` |
| `end_at` | TEXT | ✅ | — | Fim: `YYYY-MM-DD HH:MM:SS` |
| `timezone` | TEXT | ✅ | `America/Sao_Paulo` | |
| `location` | TEXT | ❌ | — | Sala, link ou endereço |
| `location_type` | TEXT | ❌ | `other` | Ver [Enums](#meetings-1) |
| `meeting_url` | TEXT | ❌ | — | Link do Meet/Zoom/Teams |
| `organizer_name` | TEXT | ❌ | — | |
| `organizer_email` | TEXT | ❌ | — | |
| `reminder_at` | TEXT | ❌ | — | Horário do lembrete |
| `reminder_sent` | INTEGER | ✅ | `0` | |
| `recurrence_rule` | TEXT | ❌ | — | RRULE |
| `is_recurring` | INTEGER | ✅ | `0` | |
| `parent_meeting_id` | TEXT | ❌ | — | FK self-ref para recorrências |
| `agenda` | TEXT | ❌ | — | Pauta da reunião |
| `notes` | TEXT | ❌ | — | Anotações durante/após |
| `action_items` | TEXT | ❌ | — | JSON: `[{"item":"...", "owner":"..."}]` |
| `recording_url` | TEXT | ❌ | — | Link da gravação |
| `source` | TEXT | ❌ | `manual` | Ver [Enums](#meetings-1) |
| `external_id` | TEXT | ❌ | — | ID no Google Calendar, Outlook, etc |
| `created_at` | TEXT | ✅ | `datetime('now')` | |
| `updated_at` | TEXT | ✅ | `datetime('now')` | Atualizado por trigger |
| `deleted_at` | TEXT | ❌ | `NULL` | Soft delete |

### `meeting_participants`

Participantes de uma reunião.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `meeting_id` | TEXT | ✅ | — | FK → `meetings.id` CASCADE |
| `name` | TEXT | ✅ | — | |
| `email` | TEXT | ❌ | — | |
| `role` | TEXT | ❌ | `attendee` | Ver [Enums](#meetings-1) |
| `status` | TEXT | ❌ | `pending` | Ver [Enums](#meetings-1) |
| `created_at` | TEXT | ✅ | `datetime('now')` | |

### `meeting_tags`

Tabela de junção many-to-many entre `meetings` e `tags`.

---

### `events`

Scheduler central — agendamentos, lembretes, deadlines e qualquer coisa com horário.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `title` | TEXT | ✅ | — | |
| `description` | TEXT | ❌ | — | |
| `type` | TEXT | ✅ | `reminder` | Ver [Enums](#events-1) |
| `status` | TEXT | ✅ | `pending` | Ver [Enums](#events-1) |
| `scheduled_at` | TEXT | ✅ | — | Quando o evento ocorre |
| `timezone` | TEXT | ✅ | `America/Sao_Paulo` | |
| `all_day` | INTEGER | ✅ | `0` | Evento de dia inteiro? |
| `end_at` | TEXT | ❌ | — | Fim (para eventos com duração) |
| `recurrence_rule` | TEXT | ❌ | — | RRULE |
| `is_recurring` | INTEGER | ✅ | `0` | |
| `parent_event_id` | TEXT | ❌ | — | FK self-ref |
| `next_occurrence_at` | TEXT | ❌ | — | Calculado pela app ao processar RRULE |
| `notify_before_mins` | INTEGER | ❌ | `15` | Minutos de antecedência para notificar |
| `reminder_at` | TEXT | ❌ | — | Calculado: `scheduled_at - notify_before_mins` |
| `reminder_sent` | INTEGER | ✅ | `0` | |
| `reminder_sent_at` | TEXT | ❌ | — | Timestamp do envio |
| `snoozed_until` | TEXT | ❌ | — | Snooze até quando |
| `dispatcher` | TEXT | ❌ | `local` | Ver [Enums](#events-1) |
| `dispatcher_job_id` | TEXT | ❌ | — | ID do job no EventBridge/Supabase |
| `dispatcher_payload` | TEXT | ❌ | — | JSON com config específica do dispatcher |
| `dispatch_status` | TEXT | ❌ | `pending` | Ver [Enums](#events-1) |
| `dispatch_error` | TEXT | ❌ | — | Mensagem de erro do último envio |
| `dispatch_attempts` | INTEGER | ✅ | `0` | Tentativas de dispatch |
| `linked_task_id` | TEXT | ❌ | — | FK → `tasks.id` (opcional) |
| `linked_meeting_id` | TEXT | ❌ | — | FK → `meetings.id` (opcional) |
| `linked_habit_id` | TEXT | ❌ | — | FK → `habits.id` (opcional) |
| `priority` | TEXT | ✅ | `medium` | Ver [Enums](#events-1) |
| `color` | TEXT | ❌ | — | |
| `icon` | TEXT | ❌ | — | |
| `notes` | TEXT | ❌ | — | |
| `source` | TEXT | ❌ | `manual` | |
| `created_at` | TEXT | ✅ | `datetime('now')` | |
| `updated_at` | TEXT | ✅ | `datetime('now')` | Atualizado por trigger |
| `deleted_at` | TEXT | ❌ | `NULL` | Soft delete |

### `event_tags`

Tabela de junção many-to-many entre `events` e `tags`.

---

### `conversations`

Sessões de conversa com o assistente de IA.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `title` | TEXT | ❌ | — | Gerado automaticamente pela IA |
| `created_at` | TEXT | ✅ | `datetime('now')` | |
| `updated_at` | TEXT | ✅ | `datetime('now')` | Atualizado por trigger |
| `deleted_at` | TEXT | ❌ | `NULL` | Soft delete |

### `messages`

Mensagens individuais de uma conversa.

| Coluna | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `id` | TEXT | ✅ | UUID auto | |
| `conversation_id` | TEXT | ✅ | — | FK → `conversations.id` CASCADE |
| `role` | TEXT | ✅ | — | `user`, `assistant` ou `system` |
| `content` | TEXT | ✅ | — | Conteúdo da mensagem |
| `linked_task_id` | TEXT | ❌ | — | Tarefa criada/referenciada nessa mensagem |
| `linked_meeting_id` | TEXT | ❌ | — | |
| `linked_habit_id` | TEXT | ❌ | — | |
| `linked_event_id` | TEXT | ❌ | — | |
| `tokens_used` | INTEGER | ❌ | — | Tokens consumidos na chamada da API |
| `model` | TEXT | ❌ | — | Modelo usado: ex. `claude-sonnet-4-6` |
| `created_at` | TEXT | ✅ | `datetime('now')` | |

---

## Indexes

| Index | Tabela | Coluna(s) | Filtro parcial |
|---|---|---|---|
| `idx_tasks_status` | tasks | status | — |
| `idx_tasks_due_date` | tasks | due_date | — |
| `idx_tasks_reminder_at` | tasks | reminder_at | `WHERE reminder_sent = 0` |
| `idx_tasks_parent` | tasks | parent_task_id | — |
| `idx_habit_logs_date` | habit_logs | logged_date | — |
| `idx_habit_logs_habit` | habit_logs | habit_id | — |
| `idx_habits_active` | habits | is_active | — |
| `idx_meetings_start` | meetings | start_at | — |
| `idx_meetings_status` | meetings | status | — |
| `idx_meetings_reminder` | meetings | reminder_at | `WHERE reminder_sent = 0` |
| `idx_events_scheduled` | events | scheduled_at | — |
| `idx_events_reminder` | events | reminder_at | `WHERE reminder_sent = 0` |
| `idx_events_status` | events | status | — |
| `idx_events_dispatcher` | events | dispatch_status | `WHERE dispatcher != 'local'` |
| `idx_events_next_occur` | events | next_occurrence_at | `WHERE is_recurring = 1` |
| `idx_messages_conv` | messages | conversation_id | — |
| `idx_messages_created` | messages | created_at | — |

---

## Triggers

Todos os triggers atualizam `updated_at = datetime('now')` automaticamente após qualquer `UPDATE`.

| Trigger | Tabela |
|---|---|
| `trg_tasks_updated` | tasks |
| `trg_habits_updated` | habits |
| `trg_meetings_updated` | meetings |
| `trg_events_updated` | events |
| `trg_conversations_updated` | conversations |

---

## Enums e Valores Permitidos

### tasks

| Campo | Valores |
|---|---|
| `status` | `pending`, `in_progress`, `done`, `cancelled`, `archived` |
| `priority` | `low`, `medium`, `high`, `urgent` |
| `source` | `manual`, `ai`, `imported` |

### habits

| Campo | Valores |
|---|---|
| `frequency` | `daily`, `weekly`, `monthly`, `custom` |
| `target_unit` | `times`, `minutes`, `pages`, `km`, `glasses`, `custom` |

### meetings

| Campo | Valores |
|---|---|
| `status` | `scheduled`, `in_progress`, `done`, `cancelled`, `rescheduled` |
| `location_type` | `physical`, `online`, `phone`, `other` |
| `source` | `manual`, `ai`, `calendar_sync` |
| `participants.role` | `organizer`, `attendee`, `optional`, `presenter` |
| `participants.status` | `pending`, `accepted`, `declined`, `tentative` |

### events

| Campo | Valores |
|---|---|
| `type` | `reminder`, `deadline`, `anniversary`, `appointment`, `goal`, `other` |
| `status` | `pending`, `triggered`, `dismissed`, `snoozed`, `cancelled` |
| `dispatcher` | `local`, `pushover`, `eventbridge`, `supabase` |
| `dispatch_status` | `pending`, `scheduled`, `sent`, `failed` |
| `priority` | `low`, `medium`, `high`, `urgent` |

### messages

| Campo | Valores |
|---|---|
| `role` | `user`, `assistant`, `system` |

---

## Regras de Negócio

**Soft Delete**
Nunca use `DELETE` direto. Sempre faça `UPDATE tabela SET deleted_at = datetime('now') WHERE id = ?`. Todas as queries de listagem devem incluir `WHERE deleted_at IS NULL`.

**reminder_at em events**
O campo `reminder_at` é calculado pela aplicação: `reminder_at = scheduled_at - notify_before_mins`. Sempre recalcule ao alterar `scheduled_at` ou `notify_before_mins`.

**Recorrência**
Ao processar um evento/tarefa/reunião recorrente, crie um novo registro filho com `parent_*_id` apontando para o pai. Não modifique o registro pai. Atualize `next_occurrence_at` no pai após cada disparo.

**Dispatcher de events**
- `local`: a app gerencia o agendamento (APScheduler/node-schedule). Funciona só com o app aberto.
- `pushover`: integração direta com Pushover API no horário do evento.
- `eventbridge`: job agendado no AWS EventBridge. Persiste com o app fechado.
- `supabase`: pg_cron + Edge Function no Supabase.

**habit_logs**
Só pode existir um log por `(habit_id, logged_date)`. Use `INSERT OR REPLACE` ou `INSERT OR IGNORE` conforme o comportamento desejado.

**streak_current em habits**
O streak deve ser recalculado pela aplicação ao registrar ou remover um `habit_log`. Não é calculado automaticamente por trigger no banco.

---

## Queries Comuns

**Tarefas pendentes ordenadas por prioridade e data limite:**
```sql
SELECT * FROM tasks
WHERE status IN ('pending', 'in_progress')
  AND deleted_at IS NULL
ORDER BY
  CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
  due_date ASC NULLS LAST;
```

**Lembretes pendentes de envio (todas as tabelas):**
```sql
SELECT 'task'    AS entity, id, title, reminder_at FROM tasks    WHERE reminder_sent = 0 AND reminder_at <= datetime('now') AND deleted_at IS NULL
UNION ALL
SELECT 'meeting' AS entity, id, title, reminder_at FROM meetings WHERE reminder_sent = 0 AND reminder_at <= datetime('now') AND deleted_at IS NULL
UNION ALL
SELECT 'event'   AS entity, id, title, reminder_at FROM events   WHERE reminder_sent = 0 AND reminder_at <= datetime('now') AND deleted_at IS NULL
ORDER BY reminder_at ASC;
```

**Hábitos do dia com status de conclusão:**
```sql
SELECT h.id, h.title, h.target_count, h.target_unit,
       hl.value AS done_value,
       CASE WHEN hl.id IS NOT NULL THEN 1 ELSE 0 END AS completed_today
FROM habits h
LEFT JOIN habit_logs hl
  ON hl.habit_id = h.id AND hl.logged_date = date('now')
WHERE h.is_active = 1 AND h.deleted_at IS NULL;
```

**Próximas reuniões (próximas 24h):**
```sql
SELECT * FROM meetings
WHERE start_at BETWEEN datetime('now') AND datetime('now', '+1 day')
  AND status = 'scheduled'
  AND deleted_at IS NULL
ORDER BY start_at ASC;
```

**Events com dispatcher cloud que ainda não foram agendados:**
```sql
SELECT * FROM events
WHERE dispatcher IN ('eventbridge', 'supabase', 'pushover')
  AND dispatch_status = 'pending'
  AND scheduled_at > datetime('now')
  AND deleted_at IS NULL
ORDER BY scheduled_at ASC;
```

**Histórico de conversa completo:**
```sql
SELECT m.role, m.content, m.created_at, m.tokens_used
FROM messages m
WHERE m.conversation_id = ?
ORDER BY m.created_at ASC;
```
