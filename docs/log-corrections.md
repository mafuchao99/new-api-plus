# Historical Consumption Corrections

## Scope

Administrators can correct historical cache read/write pricing mistakes from the
wrench action in the default theme's consumption logs. Select one user ID, an
exact model name, a start time (inclusive), an end time (exclusive), and the
correct cache multipliers. Times entered in the browser use its local timezone.
TTL-specific write prices are required when the selected logs contain those
cache token counts.

The tool only supports ordinary per-token billing. Historical model, group,
completion, and request-count multipliers remain unchanged. Production token
normalization, decimal arithmetic, rounding, and minimum charges are reused.
Historical settlement must match the original quota before a correction can be
approved. Per-call, expression, multimodal, tool-surcharge, saturated, and
unreproducible logs are excluded. ClickHouse corrections are disabled.

## Accounting Invariants

This tool does not refund money. Wallet balances, token remaining quotas,
subscription allowances, funding/compensation transactions, request counts, and
token counts are never adjusted.

Only an overcharge is changed. Its delta reduces the original log quota,
existing historical dashboard consumption, existing monthly wallet or
subscription consumption and net consumption, and the user/token/channel
consumption counters. Deleted tokens and channels are not recreated. Missing
dashboard or monthly aggregates are reported as warnings and are not created.

Dashboard rows must match the log's user, username, model, hour, group, token,
channel, and recorded node. Missing node information is acceptable only when the
bucket is unambiguous. Dashboard quota, request count, and token count must match
persisted logs. Monthly consumption classifications, request count, and the
gross/refund/net identity must also be verifiable. Deleted or incomplete logs,
partial historical aggregates, pending dashboard caches, mismatches, and
insufficient counters can prevent correction. The current unfinished hour
cannot be selected.

## Workflow And Recovery

Preview runs through the existing system task runner, scanning logs in pages of
250. No original log snapshots are created by preview. Approval stores hashes
of eligible logs, not copies of every matched log. Review the paginated details,
warnings, and adjustment totals; CSV exports are available for details and
summary. Provide a reason and confirm execution.

Only actual modifications create a log-database snapshot. Each snapshot contains
the complete original log, corrected quota, changed pricing/display fields,
target statistics, batch, operator, time, reason, and synchronization status.
Ordinary log cleanup does not delete snapshots.

With a shared database handle, log updates, snapshots, statistics, and receipts
commit together. With separate databases, the log transaction saves a pending
snapshot; the main-database transaction applies statistics and creates a unique
batch/log receipt. A crash between commit and acknowledgement can be retried
without subtracting statistics twice. A batch is not complete until all approved
deltas are synchronized and consumption-display caches are refreshed.

Failed apply tasks can be resumed from the same batch. Changed approvals require
a fresh preview; unapplied or unverifiable records are not silently discarded.
There is no snapshot rollback, automatic compensation, or site-wide recalculation.

## Administrator API

All routes require administrator authentication under `/api/log/corrections`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/capabilities` | Database support |
| POST | `/` | Queue preview |
| GET | `/` | Paginated batches; optional `user_id` |
| GET | `/:batch_id` | Batch and system-task progress |
| GET | `/:batch_id/details` | Paginated recalculation details |
| POST | `/:batch_id/apply` | Confirm or resume with `reason` |
| GET | `/:batch_id/export` | CSV; `summary=true` exports totals |
| GET | `/snapshots` | Paginated modification history |

Preview JSON fields: `user_id`, `model_name`, `start_time`, `end_time`,
`cache_read_ratio`, `cache_write_ratio`, and optional `cache_write_5m_ratio` /
`cache_write_1h_ratio`. API timestamps are Unix seconds. Pagination uses `p` and
`page_size`. Snapshots can be filtered by `user_id`, `model_name`, `log_id`,
`batch_id`, `start_time`, and `end_time`.

Deploy the updated backend on the master node to run migrations and register the
task handler. Back up both databases before making historical corrections.
