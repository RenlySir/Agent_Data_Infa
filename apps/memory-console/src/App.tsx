import {
  Activity,
  BrainCircuit,
  Boxes,
  CheckCircle2,
  CircleStop,
  Database,
  Eye,
  FileClock,
  Gauge,
  Trash2,
  MemoryStick,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SquareTerminal,
  StopCircle,
  TrendingUp
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsoleConfig, ControlPlaneStatus, GateDecision, KeywordCount, Sandbox } from "./api";
import { requestJson } from "./api";
import { defaultConfig, fallbackDecisions, fallbackKeywords, fallbackSandboxes, fallbackStatus } from "./sample-data";

type Tab = "overview" | "memory" | "control" | "openclaw" | "keywords" | "audit";

interface InspectorState {
  title: string;
  payload: unknown;
}

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "memory", label: "Memory", icon: BrainCircuit },
  { id: "control", label: "Control Plane", icon: ShieldCheck },
  { id: "openclaw", label: "OpenClaw", icon: Boxes },
  { id: "keywords", label: "Keywords", icon: TrendingUp },
  { id: "audit", label: "Audit", icon: FileClock }
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [config, setConfig] = useState<ConsoleConfig>(defaultConfig);
  const [status, setStatus] = useState<ControlPlaneStatus>(fallbackStatus);
  const [sandboxes, setSandboxes] = useState<Sandbox[]>(fallbackSandboxes);
  const [keywords, setKeywords] = useState<KeywordCount[]>(fallbackKeywords);
  const [decisions, setDecisions] = useState<GateDecision[]>(fallbackDecisions);
  const [inspector, setInspector] = useState<InspectorState>({
    title: "Console boot",
    payload: { config: defaultConfig }
  });
  const [connection, setConnection] = useState<"connected" | "offline" | "checking">("checking");
  const [recallQuery, setRecallQuery] = useState("technical plan preference");
  const [rememberText, setRememberText] = useState("User prefers Chinese technical plans with architecture and execution steps.");
  const [sandboxName, setSandboxName] = useState("research-sandbox");

  const refresh = useCallback(async () => {
    setConnection("checking");
    try {
      const [nextStatus, sandboxResult, keywordResult, decisionResult] = await Promise.all([
        requestJson<ControlPlaneStatus>(config, "/v1/control-plane/status"),
        requestJson<{ sandboxes: Sandbox[] }>(config, "/v1/openclaw/sandboxes"),
        requestJson<{ keywords: KeywordCount[] }>(config, "/v1/analytics/keywords?limit=12"),
        requestJson<{ decisions: GateDecision[] }>(config, "/v1/control-plane/gate-decisions")
      ]);
      setStatus(nextStatus);
      setSandboxes(sandboxResult.sandboxes);
      setKeywords(keywordResult.keywords);
      setDecisions(decisionResult.decisions);
      setInspector({ title: "Refresh result", payload: { nextStatus, sandboxResult, keywordResult, decisionResult } });
      setConnection("connected");
    } catch (error) {
      setConnection("offline");
      setInspector({ title: "Refresh failed", payload: String(error) });
    }
  }, [config]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const maxKeywordCount = useMemo(() => Math.max(1, ...keywords.map((keyword) => keyword.count)), [keywords]);

  async function createSandbox() {
    const sandbox = await requestJson<Sandbox>(config, "/v1/openclaw/sandboxes", {
      method: "POST",
      body: JSON.stringify({ name: sandboxName, image: "openclaw/local:latest" })
    });
    setInspector({ title: "OpenClaw sandbox created", payload: sandbox });
    await refresh();
  }

  async function transitionSandbox(sandbox: Sandbox, action: "start" | "stop") {
    const next = await requestJson<Sandbox>(config, `/v1/openclaw/sandboxes/${sandbox.id}/${action}`, {
      method: "POST"
    });
    setInspector({ title: `OpenClaw sandbox ${action}`, payload: next });
    await refresh();
  }

  async function deleteSandbox(sandbox: Sandbox) {
    const next = await requestJson<Sandbox>(config, `/v1/openclaw/sandboxes/${sandbox.id}`, {
      method: "DELETE"
    });
    setInspector({ title: "OpenClaw sandbox deleted", payload: next });
    await refresh();
  }

  async function remember() {
    const result = await requestJson(config, "/v1/memory/remember", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: config.tenantId,
        user_id: config.userId,
        agent_id: config.agentId,
        project_id: config.projectId,
        owner_type: "user",
        owner_id: config.userId,
        memory_type: "preference",
        scope: "user",
        content: rememberText,
        confirmed_by_user: true,
        confidence: 0.9,
        importance: 0.8
      })
    });
    setInspector({ title: "Remember response", payload: result });
    await refresh();
  }

  async function recall() {
    const result = await requestJson(config, "/v1/memory/recall", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: config.tenantId,
        user_id: config.userId,
        agent_id: config.agentId,
        project_id: config.projectId,
        query: recallQuery,
        limit: 8
      })
    });
    setInspector({ title: "Recall response", payload: result });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <MemoryStick size={20} />
          </div>
          <div>
            <h1>Agent Data</h1>
            <span>Infrastructure Console</span>
          </div>
        </div>
        <nav>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "nav-item active" : "nav-item"}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={17} />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <section className="scope-panel">
          <label>
            Gateway
            <input value={config.gatewayUrl} onChange={(event) => setConfig({ ...config, gatewayUrl: event.target.value })} />
          </label>
          <label>
            API Key
            <input value={config.apiKey} onChange={(event) => setConfig({ ...config, apiKey: event.target.value })} />
          </label>
          <label>
            Project
            <input value={config.projectId} onChange={(event) => setConfig({ ...config, projectId: event.target.value })} />
          </label>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="caption">Runtime memory is mem0 only</p>
            <h2>{headingFor(activeTab)}</h2>
          </div>
          <div className="topbar-actions">
            <span className={`connection ${connection}`}>
              <span />
              {connection}
            </span>
            <button className="icon-button" onClick={refresh} type="button" aria-label="Refresh">
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="main-panel" data-testid="main-panel">{renderTab()}</section>
          <aside className="inspector">
            <div className="inspector-title">
              <Eye size={17} />
              <h3>{inspector.title}</h3>
            </div>
            <pre>{JSON.stringify(inspector.payload, null, 2)}</pre>
          </aside>
        </div>
      </section>
    </main>
  );

  function renderTab() {
    if (activeTab === "overview") {
      return (
        <div className="stack">
          <div className="metrics-grid">
            <Metric icon={BrainCircuit} label="Runtime Memory" value="mem0" sub={status.runtimeMemory.status} />
            <Metric icon={Activity} label="Gateway" value={status.gateway.status} sub={`${status.gateway.recentRequests} recent requests`} />
            <Metric icon={Database} label="Consolidator" value={status.consolidator.status} sub={`${status.consolidator.queueDepth} queued`} />
            <Metric icon={ShieldCheck} label="Memory Gate" value={status.memoryGate.status} sub={`${status.memoryGate.denyCount} denied`} />
          </div>
          <div className="workflow-band">
            {["mem0 runtime", "Memory Gateway", "Consolidator", "Memory Gate", "OpenClaw", "Keywords"].map((item, index) => (
              <div className="workflow-node" key={item}>
                <span>{index + 1}</span>
                {item}
              </div>
            ))}
          </div>
          <SandboxTable
            sandboxes={sandboxes}
            onStart={(sandbox) => transitionSandbox(sandbox, "start")}
            onStop={(sandbox) => transitionSandbox(sandbox, "stop")}
            onDelete={deleteSandbox}
          />
        </div>
      );
    }

    if (activeTab === "memory") {
      return (
        <div className="split">
          <section className="tool-panel">
            <h3>Remember</h3>
            <textarea value={rememberText} onChange={(event) => setRememberText(event.target.value)} />
            <button className="primary" onClick={remember} type="button">
              <CheckCircle2 size={16} />
              Store confirmed memory
            </button>
          </section>
          <section className="tool-panel">
            <h3>Recall</h3>
            <input value={recallQuery} onChange={(event) => setRecallQuery(event.target.value)} />
            <button className="primary" onClick={recall} type="button">
              <Search size={16} />
              Run recall
            </button>
          </section>
        </div>
      );
    }

    if (activeTab === "control") {
      return (
        <div className="three-column">
          <ControlCard icon={Activity} title="Memory Gateway" rows={[["Status", status.gateway.status], ["Recent requests", status.gateway.recentRequests], ["Denied", status.gateway.denyCount]]} />
          <ControlCard icon={Database} title="Consolidator" rows={[["Status", status.consolidator.status], ["Queue depth", status.consolidator.queueDepth], ["Promoted today", status.consolidator.promotedToday]]} />
          <ControlCard icon={ShieldCheck} title="Memory Gate" rows={[["Status", status.memoryGate.status], ["Allowed", status.memoryGate.allowCount], ["Denied", status.memoryGate.denyCount]]} />
        </div>
      );
    }

    if (activeTab === "openclaw") {
      return (
        <div className="stack">
          <section className="create-row">
            <input value={sandboxName} onChange={(event) => setSandboxName(event.target.value)} />
            <button className="primary" onClick={createSandbox} type="button">
              <Plus size={16} />
              Create sandbox
            </button>
          </section>
          <SandboxTable
            sandboxes={sandboxes}
            onStart={(sandbox) => transitionSandbox(sandbox, "start")}
            onStop={(sandbox) => transitionSandbox(sandbox, "stop")}
            onDelete={deleteSandbox}
          />
        </div>
      );
    }

    if (activeTab === "keywords") {
      return (
        <div className="keyword-list">
          {keywords.map((keyword) => (
            <button
              key={keyword.keyword}
              className="keyword-row"
              onClick={() => setInspector({ title: `Keyword: ${keyword.keyword}`, payload: keyword })}
              type="button"
            >
              <span>{keyword.keyword}</span>
              <div>
                <div style={{ width: `${(keyword.count / maxKeywordCount) * 100}%` }} />
              </div>
              <strong>{keyword.count}</strong>
            </button>
          ))}
        </div>
      );
    }

    return <AuditTable decisions={decisions} />;
  }
}

function Metric({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return (
    <article className="metric">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{sub}</p>
    </article>
  );
}

function ControlCard({ icon: Icon, title, rows }: { icon: LucideIcon; title: string; rows: [string, string | number][] }) {
  return (
    <article className="control-card">
      <div>
        <Icon size={19} />
        <h3>{title}</h3>
      </div>
      {rows.map(([label, value]) => (
        <p key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </p>
      ))}
    </article>
  );
}

function SandboxTable({
  sandboxes,
  onStart,
  onStop,
  onDelete
}: {
  sandboxes: Sandbox[];
  onStart: (sandbox: Sandbox) => void;
  onStop: (sandbox: Sandbox) => void;
  onDelete: (sandbox: Sandbox) => void;
}) {
  return (
    <section className="table-panel">
      <div className="panel-heading">
        <SquareTerminal size={18} />
        <h3>OpenClaw sandboxes</h3>
      </div>
      <div className="table">
        {sandboxes.map((sandbox) => (
          <div className="table-row" key={sandbox.id}>
            <span className={`status-dot ${sandbox.status}`} />
            <strong>{sandbox.name}</strong>
            <span>{sandbox.image}</span>
            <span>{sandbox.status}</span>
            <div className="row-actions">
              <button onClick={() => onStart(sandbox)} type="button" aria-label={`Start ${sandbox.name}`}>
                <Play size={14} />
              </button>
              <button onClick={() => onStop(sandbox)} type="button" aria-label={`Stop ${sandbox.name}`}>
                {sandbox.status === "running" ? <StopCircle size={14} /> : <CircleStop size={14} />}
              </button>
              <button onClick={() => onDelete(sandbox)} type="button" aria-label={`Delete ${sandbox.name}`}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditTable({ decisions }: { decisions: GateDecision[] }) {
  return (
    <section className="table-panel">
      <div className="panel-heading">
        <FileClock size={18} />
        <h3>Memory Gate decisions</h3>
      </div>
      <div className="audit-table">
        {decisions.map((decision) => (
          <div className="audit-row" key={decision.id}>
            <span className={`decision-pill ${decision.decision}`}>{decision.decision}</span>
            <strong>{decision.operation}</strong>
            <span>{decision.actorId}</span>
            <time>{new Date(decision.createdAt).toLocaleString()}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function headingFor(tab: Tab) {
  const map: Record<Tab, string> = {
    overview: "Operational Overview",
    memory: "Memory Workbench",
    control: "Control Plane",
    openclaw: "OpenClaw Sandbox Runtime",
    keywords: "Keyword Intelligence",
    audit: "Audit Trail"
  };
  return map[tab];
}
