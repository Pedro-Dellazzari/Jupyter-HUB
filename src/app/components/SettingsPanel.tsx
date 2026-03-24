import { useState, useEffect, type ReactNode } from "react";
import { Save, Eye, EyeOff, Key, CheckCircle2, AlertCircle, RefreshCw, Calendar, Link2, ChevronRight, Unlink } from "lucide-react";
import { db, type APISettings } from "../lib/db";

const SETTINGS_KEY          = "api-settings";
const INTEGRATIONS_KEY      = "calendar-integrations";

// ─── AI Settings ─────────────────────────────────────────────────────────────

const DEFAULT_MODELS = {
  openai:    ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  google:    ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"],
  custom:    [] as string[],
};

const PROVIDER_INFO = {
  openai:    { name: "OpenAI",     url: "https://platform.openai.com/api-keys",    docs: "https://platform.openai.com/docs" },
  anthropic: { name: "Anthropic",  url: "https://console.anthropic.com/",          docs: "https://docs.anthropic.com/" },
  google:    { name: "Google AI",  url: "https://makersuite.google.com/app/apikey", docs: "https://ai.google.dev/docs" },
  custom:    { name: "Custom API", url: "",                                          docs: "" },
} as const;

// ─── Integration Settings ─────────────────────────────────────────────────────

interface CalendarConfig {
  url: string;
  enabled: boolean;
  lastSync: string | null;
  syncedCount: number;
}

interface CalendarIntegrations {
  google:  CalendarConfig;
  outlook: CalendarConfig;
}

const DEFAULT_INTEGRATIONS: CalendarIntegrations = {
  google:  { url: "", enabled: false, lastSync: null, syncedCount: 0 },
  outlook: { url: "", enabled: false, lastSync: null, syncedCount: 0 },
};

// ─── How-to instructions ──────────────────────────────────────────────────────

const GOOGLE_STEPS = [
  "Acesse calendar.google.com no navegador",
  "Passe o mouse sobre o calendário desejado na barra lateral esquerda",
  'Clique nos três pontos ⋮ ao lado do nome → "Configurações e compartilhamento"',
  'Role a página até encontrar a seção "Integrar calendário"',
  '⚠️ Copie o link "Endereço SECRETO no formato iCal" (NÃO o "público") — ele contém um token único',
  "Cole o link no campo abaixo e clique em Sincronizar",
];

const OUTLOOK_STEPS = [
  "Acesse outlook.live.com ou outlook.office.com",
  'Clique no ícone de engrenagem ⚙ → "Ver todas as configurações do Outlook"',
  'Vá em "Calendário" → "Calendários compartilhados"',
  'Em "Publicar um calendário", selecione o calendário e a permissão "Todos os detalhes"',
  'Clique em "Publicar" e copie o link ICS',
  "Cole o link no campo abaixo",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<"ia" | "integrations">("ia");

  // ── AI state ──
  const [settings, setSettings] = useState<APISettings>({
    provider: "anthropic",
    apiKey: "",
    model: "claude-sonnet-4-6",
    temperature: 0.7,
    maxTokens: 2000,
    endpoint: "",
  });
  const [showApiKey, setShowApiKey]   = useState(false);
  const [saved, setSaved]             = useState(false);
  const [testStatus, setTestStatus]   = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  // ── Integration state ──
  const [integrations, setIntegrations]               = useState<CalendarIntegrations>(DEFAULT_INTEGRATIONS);
  const [syncStatus, setSyncStatus]                   = useState<Record<string, "idle" | "syncing" | "success" | "error">>({ google: "idle", outlook: "idle" });
  const [syncMessage, setSyncMessage]                 = useState<Record<string, string>>({ google: "", outlook: "" });
  const [integSaved, setIntegSaved]                   = useState(false);
  const [expandedGuide, setExpandedGuide]             = useState<"google" | "outlook" | null>(null);

  // ── Load from DB ──
  useEffect(() => {
    db.settings.get(SETTINGS_KEY).then(v => { if (v) setSettings(v as APISettings); });
    db.settings.get(INTEGRATIONS_KEY).then(v => { if (v) setIntegrations(v as CalendarIntegrations); });
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // AI tab handlers
  // ──────────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    await db.settings.save(SETTINGS_KEY, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleProviderChange = (provider: APISettings["provider"]) => {
    setSettings({ ...settings, provider, model: DEFAULT_MODELS[provider][0] || "", endpoint: provider === "custom" ? settings.endpoint : "" });
  };

  const testConnection = async () => {
    if (!settings.apiKey.trim()) {
      setTestStatus("error"); setTestMessage("Insira uma chave de API primeiro.");
      setTimeout(() => setTestStatus("idle"), 4000); return;
    }
    setTestStatus("testing"); setTestMessage("Testando conexão...");
    const result = await db.ai.chat([{ role: "user", content: "Responda apenas: ok" }], { ...settings, maxTokens: 10 });
    if (result.error) {
      setTestStatus("error"); setTestMessage(`Erro: ${result.error}`);
    } else {
      setTestStatus("success"); setTestMessage(`Conexão bem-sucedida! Modelo: ${result.model}`);
    }
    setTimeout(() => setTestStatus("idle"), 6000);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Integration tab handlers
  // ──────────────────────────────────────────────────────────────────────────

  const updateCalendar = (provider: "google" | "outlook", patch: Partial<CalendarConfig>) => {
    setIntegrations(prev => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
  };

  const saveIntegrations = async () => {
    await db.settings.save(INTEGRATIONS_KEY, integrations);
    setIntegSaved(true);
    setTimeout(() => setIntegSaved(false), 3000);
  };

  const syncCalendar = async (provider: "google" | "outlook") => {
    const cfg = integrations[provider];
    if (!cfg.url.trim()) {
      setSyncStatus(p => ({ ...p, [provider]: "error" }));
      setSyncMessage(p => ({ ...p, [provider]: "Insira a URL do calendário primeiro." }));
      setTimeout(() => setSyncStatus(p => ({ ...p, [provider]: "idle" })), 4000);
      return;
    }

    setSyncStatus(p => ({ ...p, [provider]: "syncing" }));
    setSyncMessage(p => ({ ...p, [provider]: "Buscando e importando eventos..." }));

    try {
      const source = provider === "google" ? "ical:google" : "ical:outlook";
      const color  = provider === "google" ? "#4285f4"    : "#0078d4";
      const result = await db.ical.sync(cfg.url, source, color);

      if (result.error) throw new Error(result.error);

      const found    = result.found    ?? 0;
      const imported = result.imported ?? 0;
      const now = new Date().toLocaleString("pt-BR");

      updateCalendar(provider, { enabled: true, lastSync: now, syncedCount: imported });
      await db.settings.save(INTEGRATIONS_KEY, {
        ...integrations,
        [provider]: { ...cfg, enabled: true, lastSync: now, syncedCount: imported },
      });

      setSyncStatus(p => ({ ...p, [provider]: "success" }));
      setSyncMessage(p => ({ ...p, [provider]: `${found} evento${found !== 1 ? "s" : ""} encontrado${found !== 1 ? "s" : ""}, ${imported} importado${imported !== 1 ? "s" : ""}.` }));

      window.dispatchEvent(new CustomEvent("db-mutated"));
    } catch (err: any) {
      setSyncStatus(p => ({ ...p, [provider]: "error" }));
      setSyncMessage(p => ({ ...p, [provider]: `Erro: ${err.message}. Verifique se a URL está correta e acessível.` }));
    }
    setTimeout(() => setSyncStatus(p => ({ ...p, [provider]: "idle" })), 6000);
  };

  const disconnectCalendar = async (provider: "google" | "outlook") => {
    const updated = { ...integrations, [provider]: DEFAULT_INTEGRATIONS[provider] };
    setIntegrations(updated);
    await db.settings.save(INTEGRATIONS_KEY, updated);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────────────────────

  const renderSyncFeedback = (provider: "google" | "outlook") => {
    const status = syncStatus[provider];
    const msg    = syncMessage[provider];
    if (status === "idle" || !msg) return null;
    const colors = { syncing: "bg-blue-50 border-blue-300", success: "bg-green-50 border-green-300", error: "bg-red-50 border-red-300" } as const;
    return (
      <div className={`mt-3 p-3 rounded-xl border flex items-center gap-3 animate-in fade-in duration-200 ${colors[status as keyof typeof colors]}`}>
        {status === "syncing" && <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />}
        {status === "success" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
        {status === "error"   && <AlertCircle  className="w-4 h-4 text-red-600 shrink-0" />}
        <p className="text-xs text-slate-800">{msg}</p>
      </div>
    );
  };

  const renderCalendarCard = (
    provider: "google" | "outlook",
    label: string,
    accentColor: string,
    logo: ReactNode,
    steps: string[],
  ) => {
    const cfg      = integrations[provider];
    const status   = syncStatus[provider];
    const isGuideOpen = expandedGuide === provider;

    return (
      <div className={`bg-white border-2 rounded-2xl overflow-hidden transition-all duration-300 ${cfg.enabled ? `border-[${accentColor}]/40` : "border-slate-200"}`}>
        {/* Card header */}
        <div className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logo}
            <div>
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              {cfg.enabled && cfg.lastSync ? (
                <p className="text-xs text-slate-500">Última sincronização: {cfg.lastSync} · {cfg.syncedCount} eventos</p>
              ) : (
                <p className="text-xs text-slate-500">Não conectado</p>
              )}
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
            cfg.enabled
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-slate-100 text-slate-500 border border-slate-200"
          }`}>
            {cfg.enabled ? "Conectado" : "Desconectado"}
          </span>
        </div>

        {/* URL field + sync */}
        <div className="px-5 pb-4 space-y-3">
          <div>
            <label className="text-xs text-slate-600 font-medium block mb-1.5">URL do Calendário (iCal)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="url"
                  value={cfg.url}
                  onChange={e => updateCalendar(provider, { url: e.target.value })}
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  className={`w-full bg-slate-50 border rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:shadow-lg font-mono transition-all ${
                    cfg.url.includes('/public/') ? 'border-amber-400 focus:border-amber-400 focus:shadow-amber-500/10' : 'border-slate-200 focus:border-green-400 focus:shadow-green-500/10'
                  }`}
                />
              </div>
              <button
                onClick={() => syncCalendar(provider)}
                disabled={status === "syncing"}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-xl font-medium transition-all hover:shadow-lg hover:shadow-green-500/30 hover:scale-105 active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${status === "syncing" ? "animate-spin" : ""}`} />
                {status === "syncing" ? "Sincronizando..." : "Sincronizar"}
              </button>
            </div>
          </div>

          {cfg.url.includes('/public/') && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Você está usando a URL <strong>pública</strong> — ela só funciona se o calendário estiver marcado como público.
                Para calendários pessoais, use o <strong>"Endereço secreto no formato iCal"</strong> (veja o guia abaixo).
              </p>
            </div>
          )}
          {renderSyncFeedback(provider)}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {cfg.enabled && (
              <button
                onClick={() => disconnectCalendar(provider)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                <Unlink className="w-3.5 h-3.5" />
                Desconectar
              </button>
            )}
            <button
              onClick={() => setExpandedGuide(isGuideOpen ? null : provider)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-green-600 transition-colors ml-auto"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isGuideOpen ? "rotate-90" : ""}`} />
              Como obter o link iCal
            </button>
          </div>
        </div>

        {/* Expandable guide */}
        {isGuideOpen && (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold text-slate-700 mb-3">Passo a passo:</p>
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-slate-600 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-800">
                <strong>Dica:</strong> Use o link "secreto" ou "privado" do iCal para que eventos privados também sejam importados.
                Esse link dá acesso de leitura ao seu calendário — não o compartilhe publicamente.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-600 mb-2">$ settings</h2>
          <p className="text-sm text-slate-500">Configure sua IA e conecte serviços externos</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-2xl w-fit">
          {(["ia", "integrations"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab
                  ? "bg-white text-green-700 shadow-md shadow-green-500/10"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "ia" ? "IA" : "Integrações"}
            </button>
          ))}
        </div>

        {/* ── IA Tab ────────────────────────────────────────────────────── */}
        {activeTab === "ia" && (
          <>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-xl space-y-6">
              {/* Provider */}
              <div>
                <label className="text-sm text-slate-600 font-medium block mb-3">Provedor de IA</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(["openai", "anthropic", "google", "custom"] as const).map(provider => (
                    <button
                      key={provider}
                      onClick={() => handleProviderChange(provider)}
                      className={`p-4 rounded-xl text-sm transition-all duration-300 transform hover:scale-105 ${
                        settings.provider === provider
                          ? "bg-green-100 border-2 border-green-400 text-green-700 font-medium shadow-lg shadow-green-500/20"
                          : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-green-300"
                      }`}
                    >
                      {PROVIDER_INFO[provider].name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider links */}
              {settings.provider !== "custom" && (
                <div className="bg-green-50 border border-green-300 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Key className="w-5 h-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-900 mb-2">
                        Obtenha sua chave de API em {PROVIDER_INFO[settings.provider].name}
                      </p>
                      <div className="flex gap-3">
                        <a href={PROVIDER_INFO[settings.provider].url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:text-green-700 underline">Obter API Key →</a>
                        <a href={PROVIDER_INFO[settings.provider].docs} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:text-green-700 underline">Documentação →</a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="text-sm text-slate-600 font-medium block mb-2">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={settings.apiKey}
                    onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 pr-12 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all duration-300"
                    placeholder={settings.provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                  />
                  <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition-colors">
                    {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Sua API key é armazenada no banco de dados local (SQLite) e nunca é enviada para nossos servidores.</p>
              </div>

              {/* Custom endpoint */}
              {settings.provider === "custom" && (
                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Endpoint da API</label>
                  <input
                    type="text"
                    value={settings.endpoint || ""}
                    onChange={e => setSettings({ ...settings, endpoint: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    placeholder="https://api.example.com/v1/chat/completions"
                  />
                </div>
              )}

              {/* Model */}
              <div>
                <label className="text-sm text-slate-600 font-medium block mb-2">Modelo</label>
                {settings.provider !== "custom" ? (
                  <select
                    value={settings.model}
                    onChange={e => setSettings({ ...settings, model: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                  >
                    {DEFAULT_MODELS[settings.provider].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.model}
                    onChange={e => setSettings({ ...settings, model: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    placeholder="nome-do-modelo"
                  />
                )}
              </div>

              {/* Temperature + Max Tokens */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Temperature ({settings.temperature})</label>
                  <input type="range" min="0" max="2" step="0.1" value={settings.temperature}
                    onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-green-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1"><span>Preciso</span><span>Criativo</span></div>
                </div>
                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Max Tokens</label>
                  <input type="number" min="100" max="8000" step="100" value={settings.maxTokens}
                    onChange={e => setSettings({ ...settings, maxTokens: parseInt(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                  />
                </div>
              </div>

              {/* Test Connection */}
              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={testConnection}
                  disabled={testStatus === "testing"}
                  className="w-full md:w-auto px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 hover:text-slate-900 hover:border-green-500 transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {testStatus === "testing" ? "Testando..." : "Testar Conexão"}
                </button>
                {testStatus !== "idle" && (
                  <div className={`mt-4 p-4 rounded-xl border flex items-center gap-3 animate-in fade-in duration-200 ${
                    testStatus === "success" ? "bg-green-50 border-green-300" : testStatus === "error" ? "bg-red-50 border-red-300" : "bg-blue-50 border-blue-300"
                  }`}>
                    {testStatus === "success" && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                    {testStatus === "error"   && <AlertCircle  className="w-5 h-5 text-red-600" />}
                    {testStatus === "testing" && <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
                    <p className="text-sm text-slate-900">{testMessage}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={handleSave}
                className="px-6 py-3 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Salvar Configurações
              </button>
              {saved && (
                <div className="flex items-center gap-2 text-green-600 animate-in slide-in-from-left-2 duration-300">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm">Configurações salvas!</span>
                </div>
              )}
            </div>

            <div className="mt-6 bg-blue-50 border border-blue-300 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-900 mb-1 font-medium">Armazenamento Seguro</p>
                  <p className="text-xs text-slate-700">
                    Suas chaves de API são armazenadas no banco de dados SQLite local da aplicação.
                    As chamadas à IA são feitas diretamente do processo principal do Electron, sem passar por servidores intermediários.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Integrations Tab ───────────────────────────────────────────── */}
        {activeTab === "integrations" && (
          <>
            <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
              <Calendar className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-800 mb-0.5">Sincronização via iCal (leitura)</p>
                <p className="text-xs text-slate-600">
                  Importe eventos do Google Calendar e Outlook diretamente para o Jupyter HUB.
                  A sincronização é feita via link iCal público/secreto — não é necessário login OAuth.
                  Os eventos importados ficam na aba <strong>Calendário</strong>.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Google Calendar */}
              {renderCalendarCard(
                "google",
                "Google Calendar",
                "#4285f4",
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 shadow-sm">
                  <svg viewBox="0 0 48 48" className="w-6 h-6">
                    <path fill="#4285F4" d="M33 12H15v4h18v-4z" />
                    <rect fill="#34A853" x="34" y="6" width="8" height="8" rx="1" />
                    <rect fill="#EA4335" x="6" y="6" width="8" height="8" rx="1" />
                    <rect fill="#FBBC05" x="6" y="34" width="8" height="8" rx="1" />
                    <rect fill="#4285F4" x="34" y="34" width="8" height="8" rx="1" />
                    <rect fill="#F1F3F4" x="6" y="14" width="36" height="28" rx="1" />
                    <text x="24" y="34" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#4285F4">31</text>
                  </svg>
                </div>,
                GOOGLE_STEPS,
              )}

              {/* Outlook Calendar */}
              {renderCalendarCard(
                "outlook",
                "Outlook Calendar",
                "#0078d4",
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-200 shadow-sm">
                  <svg viewBox="0 0 48 48" className="w-6 h-6">
                    <rect fill="#0078D4" x="4" y="4" width="24" height="24" rx="2" />
                    <rect fill="#50D9FF" x="20" y="20" width="24" height="24" rx="2" />
                    <text x="16" y="22" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white">OL</text>
                  </svg>
                </div>,
                OUTLOOK_STEPS,
              )}
            </div>

            {/* Save integrations */}
            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={saveIntegrations}
                className="px-6 py-3 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Salvar Integrações
              </button>
              {integSaved && (
                <div className="flex items-center gap-2 text-green-600 animate-in slide-in-from-left-2 duration-300">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm">Integrações salvas!</span>
                </div>
              )}
            </div>

            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800 mb-1">Sobre os links iCal</p>
                  <p className="text-xs text-slate-700">
                    Links iCal dão acesso de <strong>leitura</strong> ao seu calendário. Trate-os como senhas —
                    não os compartilhe. Para revogar o acesso, você pode regenerar o link nas configurações do Google/Outlook a qualquer momento.
                    Eventos criados no Jupyter HUB <strong>não</strong> são enviados de volta ao Google ou Outlook.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
