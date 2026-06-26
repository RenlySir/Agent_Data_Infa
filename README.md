# Agent Data Infrastructure

This repository contains the initial design and MVP implementation skeleton for an agent persistent memory foundation.

The architecture separates:

- mem0/mem9 as the agent runtime memory layer.
- Supabase/Postgres as the canonical long-term memory and governance layer.
- Object storage as the evidence and archive layer.
- Memory Gateway, Consolidator, and Memory Gate as the control plane.

Start with:

- Design: `docs/superpowers/specs/2026-06-26-agent-memory-foundation-design.md`
- MVP plan: `docs/superpowers/plans/2026-06-26-agent-memory-foundation-mvp.md`
- Gateway: `apps/memory-gateway`

## Development

```bash
cd apps/memory-gateway
npm install
npm test
npm run build
```

## Local Gateway

```bash
cd apps/memory-gateway
PORT=8787 MEMORY_PROVIDER=noop MEMORY_GATEWAY_API_KEY=dev-memory-key npm run dev
```

The local MVP uses an in-memory canonical store unless Supabase configuration is provided.

Memory API requests must include a gateway API key and server-trusted scope headers:

```bash
curl -X POST http://localhost:8787/v1/memory/recall \
  -H 'authorization: Bearer dev-memory-key' \
  -H 'x-memory-tenant-id: 00000000-0000-0000-0000-000000000001' \
  -H 'x-memory-user-id: 00000000-0000-0000-0000-000000000002' \
  -H 'x-memory-agent-id: research-agent' \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000099",
    "agent_id": "ignored-by-gateway",
    "query": "technical plan preference"
  }'
```
