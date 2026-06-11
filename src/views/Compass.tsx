import { useEffect, useMemo, useState } from "react";
import type {
  CompassActionTarget,
  CompassAffectedAccount,
  CompassAiAdvisor,
  CompassAiRecommendation,
  CompassAiRuntimeMode,
  CompassAiRuntimeStatus,
  CompassAnalyzeResult,
  CompassInsight,
  CompassInternalSignal,
  CompassOverview,
  CompassRecommendation,
  CompassSeverity,
} from "../api/types";
import "./compass.css";

type CompassProps = {
  overview: CompassOverview;
  onNavigate: (target: CompassActionTarget) => void;
  onAnalyze: (period: "24h" | "7d" | "30d") => Promise<CompassAnalyzeResult>;
};

const filters: Array<{ id: "all" | CompassSeverity; label: string }> = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warning" },
  { id: "info", label: "Info" },
  { id: "positive", label: "Positive" },
];

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function severityTone(severity: CompassSeverity) {
  return severity;
}

function accountLabel(account: CompassAffectedAccount) {
  return `@${account.username}`;
}

function recommendationAccounts(recommendation: CompassRecommendation) {
  return recommendation.affectedAccounts.slice(0, 6);
}

function aiStatusLabel(status: CompassAiAdvisor["status"], runtimeMode: CompassAiRuntimeMode) {
  if (status === "ai_enabled") return "AI enabled";
  if (status === "ai_unavailable") return "AI unavailable";
  if (status === "invalid_ai_output") return "Invalid AI output";
  if (runtimeMode === "relay") return "Relay ready";
  return "Rules only";
}

function healthTone(assessment: CompassAiAdvisor["healthAssessment"]): CompassSeverity {
  if (assessment === "critical") return "critical";
  if (assessment === "risk") return "warning";
  if (assessment === "good") return "positive";
  return "info";
}

export function Compass({ overview, onNavigate, onAnalyze }: CompassProps) {
  const [filter, setFilter] = useState<"all" | CompassSeverity>("all");
  const [selectedInsightId, setSelectedInsightId] = useState(overview.insights[0]?.id ?? "");
  const [advisor, setAdvisor] = useState<CompassAiAdvisor>(overview.aiAdvisor);
  const [runtime, setRuntime] = useState<CompassAiRuntimeStatus | null>(null);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">(overview.aiAdvisor.period);
  const [analyzing, setAnalyzing] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadRuntimeStatus() {
      const status = await window.botappDesktop?.compass?.status?.();
      if (!cancelled && status) {
        setRuntime(status);
        setAdvisor((current) => ({
          ...current,
          model: status.model,
          summary: status.message,
          status: status.mode === "rules_only" ? "rules_only" : current.status,
        }));
      }
    }
    void loadRuntimeStatus();
    return () => { cancelled = true; };
  }, []);

  const visibleInsights = useMemo(() => {
    if (filter === "all") return overview.insights;
    return overview.insights.filter((insight) => insight.severity === filter);
  }, [filter, overview.insights]);

  const selectedInsight = overview.insights.find((insight) => insight.id === selectedInsightId) ?? visibleInsights[0] ?? overview.insights[0] ?? null;
  const topRecommendations = overview.recommendations.slice(0, 6);
  const aiRecommendations = advisor.analysis?.recommendations ?? [];

  function navigate(target: CompassActionTarget) {
    onNavigate(target);
    setMessage(`${target.label} prepared with ${target.context.username ? `@${target.context.username}` : target.context.filter ?? "Compass"} context.`);
  }

  async function analyzeNow() {
    setAnalyzing(true);
    setMessage("");
    try {
      const result = await onAnalyze(period);
      setAdvisor(result.advisor);
      setRuntime(result.runtime);
      setMessage(result.advisor.status === "ai_enabled"
        ? "AI Advisor analysis received from secure runtime."
        : result.runtime.lastSafeError ?? result.runtime.message ?? result.advisor.summary);
    } catch {
      setAdvisor({ ...overview.aiAdvisor, status: "ai_unavailable", summary: "AI advisor unavailable. Rules-only Compass facts remain available." });
      setMessage("AI advisor unavailable. Rules-only Compass facts remain available.");
    } finally {
      setAnalyzing(false);
    }
  }

  function refreshFacts() {
    setAdvisor(overview.aiAdvisor);
    setMessage("Compass facts refreshed locally. Secure relay analysis can be requested again.");
  }

  return (
    <div className="compass-screen">
      <header className="compass-hero">
        <div>
          <span>Decision control</span>
          <h2>Compass</h2>
          <p>Proactive control tower for blockers, growth impact, recommendations, and where to act next.</p>
        </div>
        <div className="compass-score" aria-label="Compass health score">
          <span>Health score</span>
          <strong>{overview.healthScore}</strong>
          <small>Rules engine · AI advisor prepared</small>
        </div>
      </header>

      <section className={`compass-card compass-advisor ${advisor.status}`}>
        <div className="compass-advisor-main">
          <div>
            <span>Compass AI Advisor</span>
            <h3>{aiStatusLabel(advisor.status, runtime?.mode ?? "rules_only")}</h3>
            <p>{advisor.summary}</p>
          </div>
          <div className={`compass-health ${healthTone(advisor.healthAssessment)}`}>
            <span>Health assessment</span>
            <strong>{advisor.healthAssessment}</strong>
          </div>
        </div>
        <div className="compass-advisor-meta">
          <Field label="Mode" value={runtime?.mode === "relay" ? "Relay" : "Rules only"} />
          <Field label="Provider" value={advisor.provider === "openai" ? "OpenAI" : advisor.provider} />
          <Field label="Model" value={advisor.model ?? runtime?.model ?? "Configured server-side"} />
          <Field label="Last analyzed" value={advisor.lastAnalyzedAt ?? "Not analyzed"} />
          <Field label="Relay reason" value={runtime?.lastSafeError ?? advisor.summary} />
          <Field label="Provider error" value={runtime?.lastProviderErrorCode ?? advisor.providerErrorCode ?? "None"} />
          <label className="compass-period">
            <span>Period</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value as "24h" | "7d" | "30d")}>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
            </select>
          </label>
        </div>
        <div className="compass-advisor-actions">
          <button type="button" onClick={analyzeNow} disabled={analyzing}>{analyzing ? "Analyzing..." : "Analyze now"}</button>
          <button type="button" onClick={refreshFacts}>Refresh facts</button>
          <small>AI can recommend only. Actions stay human-controlled and route to existing tabs.</small>
        </div>
      </section>

      <section className="compass-kpis" aria-label="Compass overview health">
        <Kpi label="Accounts" value={overview.summary.totalAccounts} detail={`${overview.summary.workingAccounts} working or start-ready`} tone="info" />
        <Kpi label="Blocked" value={overview.summary.blockedAccounts} detail="Attached to critical or warning insights" tone={overview.summary.blockedAccounts ? "warning" : "positive"} />
        <Kpi label="Under quota" value={overview.summary.underQuotaAccounts} detail="Eligible but below expected pace" tone={overview.summary.underQuotaAccounts ? "warning" : "positive"} />
        <Kpi label="Client-safe" value={overview.summary.clientVisibleRecommendations} detail="Recommendations prepared for future client dashboard" tone="info" />
      </section>

      <section className="compass-trends" aria-label="Monthly and global trends">
        {overview.trends.map((trend) => (
          <article key={trend.label} className={`compass-trend ${trend.tone}`}>
            <span>{trend.label}</span>
            <strong>{trend.value}</strong>
            <p>{trend.detail}</p>
          </article>
        ))}
      </section>

      <section className="compass-card">
        <div className="compass-card-heading">
          <span>AI Recommendations</span>
          <h3>Decision recommendations</h3>
          <p>Shown from secure runtime output when available. If no relay or local runtime is configured, Compass keeps rules-only recommendations.</p>
          {advisor.analysis?.filteredRecommendationsCount ? (
            <small>{advisor.analysis.filteredRecommendationsCount} ungrounded recommendation{advisor.analysis.filteredRecommendationsCount === 1 ? "" : "s"} filtered: {advisor.analysis.filteredReasons?.join(", ") || "grounding validation"}</small>
          ) : null}
        </div>
        <div className="compass-ai-recommendations">
          {aiRecommendations.length ? aiRecommendations.map((recommendation) => (
            <AiRecommendationCard key={recommendation.id} recommendation={recommendation} onNavigate={navigate} />
          )) : (
            <div className="compass-empty compact">
              <span>Rules-only fallback</span>
              <strong>No AI recommendations loaded.</strong>
              <p>Use Analyze now to request the server-side Advisor contract.</p>
            </div>
          )}
        </div>
      </section>

      <section className="compass-grid">
        <div className="compass-card compass-problems">
          <div className="compass-card-heading">
            <span>Problem groups</span>
            <h3>What is not working?</h3>
          </div>
          <nav className="compass-filters" aria-label="Compass severity filters">
            {filters.map((item) => (
              <button key={item.id} type="button" className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="compass-problem-list">
            {visibleInsights.map((insight) => (
              <button
                key={insight.id}
                type="button"
                className={`compass-problem ${selectedInsight?.id === insight.id ? "selected" : ""} ${severityTone(insight.severity)}`}
                onClick={() => setSelectedInsightId(insight.id)}
              >
                <span>{labelize(insight.category)}</span>
                <strong>{insight.title}</strong>
                <small>{insight.affectedAccounts.length} account{insight.affectedAccounts.length === 1 ? "" : "s"} · {insight.sinceLabel}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="compass-card compass-detail">
          {selectedInsight ? (
            <InsightDetail insight={selectedInsight} onNavigate={navigate} />
          ) : (
            <div className="compass-empty">
              <span>No insight</span>
              <strong>No Compass insight selected.</strong>
            </div>
          )}
        </div>
      </section>

      <section className="compass-card">
        <div className="compass-card-heading">
          <span>Rules engine recommendations</span>
          <h3>What should we do next?</h3>
        </div>
        <div className="compass-recommendations">
          {topRecommendations.map((recommendation) => (
            <article key={recommendation.id} className={`compass-recommendation ${recommendation.severity}`}>
              <div>
                <span>{recommendation.confidence} confidence</span>
                <h4>{recommendation.title}</h4>
                <p>{recommendation.impactEstimate}</p>
              </div>
              <div className="compass-account-chips">
                {recommendationAccounts(recommendation).map((account) => (
                  <button key={account.accountId} type="button" onClick={() => navigate(account.target)}>
                    {accountLabel(account)}
                  </button>
                ))}
              </div>
              <div className="compass-recommendation-footer">
                <small>{recommendation.cause}</small>
                <button type="button" onClick={() => navigate(recommendation.target)}>{recommendation.target.label}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="compass-card">
        <div className="compass-card-heading">
          <span>Client-safe preview</span>
          <h3>Future client dashboard recommendation candidates</h3>
          <p>Only client-safe recommendations remain here. Internal pacing and performance diagnostics moved to internal signals.</p>
        </div>
        <div className="compass-client-preview">
          {overview.clientSafePreview.map((item) => (
            <article key={item.id} className={`compass-client-item ${item.severity}`}>
              <span>{item.confidence} confidence</span>
              <strong>{item.title}</strong>
              <p>{item.clientSummary}</p>
              <small>{item.affectedAccounts.map((account) => `@${account.username}`).join(", ")}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="compass-card compass-internal">
        <div className="compass-internal-header">
          <div>
            <span>Internal signals</span>
            <h3>Internal signals for future client recommendations</h3>
            <p>Admin-visible facts that can inform future AI wording, but are not raw client-facing recommendations.</p>
          </div>
          <button type="button" onClick={() => setInternalOpen((value) => !value)}>{internalOpen ? "Hide signals" : "Show signals"}</button>
        </div>
        {internalOpen ? <InternalSignals signals={overview.internalSignals} onNavigate={navigate} /> : null}
      </section>

      {message ? <div className="compass-message" role="status">{message}</div> : null}
    </div>
  );
}

function AiRecommendationCard({ recommendation, onNavigate }: { recommendation: CompassAiRecommendation; onNavigate: (target: CompassActionTarget) => void }) {
  const isInternal = !recommendation.clientVisible || recommendation.recommendationType.endsWith("_internal");
  return (
    <article className={`compass-ai-rec ${recommendation.severity}`}>
      <div className="compass-ai-rec-main">
        <div>
          <span>{recommendation.confidence} confidence · {recommendation.recommendationType.replaceAll("_", " ")}</span>
          <h4>{recommendation.title}</h4>
          <p>{recommendation.summary || recommendation.adminSummary}</p>
        </div>
        <div className="compass-ai-rec-badges">
          {isInternal ? <strong>Internal signal</strong> : null}
          <strong>{recommendation.severity}</strong>
        </div>
      </div>
      <div className="compass-ai-rec-facts">
        {recommendation.sourceFacts.map((fact) => (
          <span key={`${recommendation.id}-${fact}`}>{fact.replaceAll("_", " ")}</span>
        ))}
      </div>
      <div className="compass-ai-rec-accounts">
        {recommendation.affectedAccounts.map((account) => (
          <button key={`${recommendation.id}-${account.accountId}`} type="button" onClick={() => onNavigate(account.target)}>
            @{account.username}
          </button>
        ))}
      </div>
      <div className="compass-ai-rec-evidence">
        <span>Evidence</span>
        {recommendation.evidence.map((item) => (
          <small key={`${recommendation.id}-${item.source}`}>{item.source}: {item.summary} ({item.confidence})</small>
        ))}
      </div>
      <div className="compass-ai-rec-grounding">
        <small><strong>Recommended action:</strong> {recommendation.recommendedAction}</small>
        <small><strong>Why this matters:</strong> {recommendation.whyThisMatters}</small>
        <small><strong>What not to assume:</strong> {recommendation.whatNotToAssume}</small>
      </div>
      <div className="compass-recommendation-footer">
        <small>{recommendation.clientVisible ? recommendation.clientSafeReason : recommendation.technicalReason}</small>
        <div className="compass-ai-rec-actions">
          <button type="button" onClick={() => onNavigate(recommendation.target)}>
            Open {recommendation.target.targetTab}
          </button>
          {recommendation.recommendedActions.map((action) => (
            <button key={`${recommendation.id}-${action.label}`} type="button" onClick={() => onNavigate(action.target)}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function InsightDetail({ insight, onNavigate }: { insight: CompassInsight; onNavigate: (target: CompassActionTarget) => void }) {
  return (
    <article className={`compass-insight-detail ${insight.severity}`}>
      <div className="compass-detail-header">
        <div>
          <span>{labelize(insight.category)} · {insight.confidence} confidence</span>
          <h3>{insight.title}</h3>
          <p>{insight.summary}</p>
        </div>
        <button type="button" onClick={() => onNavigate({ targetTab: insight.targetTab, label: `Open ${insight.targetTab}`, context: { problemId: insight.id, filter: insight.category } })}>
          Open {insight.targetTab}
        </button>
      </div>

      <div className="compass-detail-facts">
        <Field label="Since" value={insight.sinceLabel} />
        <Field label="Impact" value={insight.impact} />
        <Field label="Cause" value={insight.cause} />
        <Field label="Action" value={insight.recommendedAction} />
      </div>

      <div className="compass-accounts">
        <span>Affected accounts</span>
        {insight.affectedAccounts.length ? insight.affectedAccounts.map((account) => (
          <button key={account.accountId} type="button" onClick={() => onNavigate(account.target)}>
            <strong>{accountLabel(account)}</strong>
            <small>{account.reason} · {account.deviceName ?? "no device"} · {account.packageLabel}</small>
          </button>
        )) : <p>No account-specific impact.</p>}
      </div>

      <div className="compass-evidence">
        <span>Evidence</span>
        {insight.evidence.map((item) => (
          <small key={`${item.source}-${item.label}`}>{item.source}: {item.label} = {String(item.value)} ({item.confidence})</small>
        ))}
      </div>
    </article>
  );
}

function InternalSignals({ signals, onNavigate }: { signals: CompassInternalSignal[]; onNavigate: (target: CompassActionTarget) => void }) {
  return (
    <div className="compass-internal-list">
      {signals.map((signal) => (
        <article key={signal.id} className={`compass-internal-signal ${signal.severity}`}>
          <div>
            <span>{labelize(signal.signal)} · client raw hidden</span>
            <strong>{signal.title}</strong>
            <p>{signal.summary}</p>
          </div>
          <button type="button" onClick={() => onNavigate(signal.target)}>Open context</button>
        </article>
      ))}
    </div>
  );
}

function Kpi({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: CompassSeverity }) {
  return (
    <article className={`compass-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="compass-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
