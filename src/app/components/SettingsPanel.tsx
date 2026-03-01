import { useState, useEffect } from "react";
import { Save, Eye, EyeOff, Key, CheckCircle2, AlertCircle } from "lucide-react";
import { db, type APISettings } from "../lib/db";

const SETTINGS_KEY = "api-settings";

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

export function SettingsPanel() {
  const [settings, setSettings] = useState<APISettings>({
    provider: "anthropic",
    apiKey: "",
    model: "claude-sonnet-4-6",
    temperature: 0.7,
    maxTokens: 2000,
    endpoint: "",
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  // Load from SQLite on mount
  useEffect(() => {
    db.settings.get(SETTINGS_KEY).then(value => {
      if (value) setSettings(value as APISettings);
    });
  }, []);

  const handleSave = async () => {
    await db.settings.save(SETTINGS_KEY, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleProviderChange = (provider: APISettings["provider"]) => {
    setSettings({
      ...settings,
      provider,
      model: DEFAULT_MODELS[provider][0] || "",
      endpoint: provider === "custom" ? settings.endpoint : "",
    });
  };

  const testConnection = async () => {
    if (!settings.apiKey.trim()) {
      setTestStatus("error");
      setTestMessage("Por favor, insira uma chave de API primeiro.");
      setTimeout(() => setTestStatus("idle"), 4000);
      return;
    }

    setTestStatus("testing");
    setTestMessage("Testando conexão...");

    // Send a minimal ping to the AI
    const result = await db.ai.chat(
      [{ role: "user", content: "Responda apenas: ok" }],
      { ...settings, maxTokens: 10 },
    );

    if (result.error) {
      setTestStatus("error");
      setTestMessage(`Erro: ${result.error}`);
    } else {
      setTestStatus("success");
      setTestMessage(`Conexão bem-sucedida! Modelo: ${result.model}`);
    }
    setTimeout(() => setTestStatus("idle"), 6000);
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-600 mb-2">$ settings</h2>
          <p className="text-sm text-slate-500">
            Configure suas credenciais de IA para habilitar o assistente
          </p>
        </div>

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
                    <a
                      href={PROVIDER_INFO[settings.provider].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 hover:text-green-700 underline"
                    >
                      Obter API Key →
                    </a>
                    <a
                      href={PROVIDER_INFO[settings.provider].docs}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 hover:text-green-700 underline"
                    >
                      Documentação →
                    </a>
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
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition-colors"
              >
                {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Sua API key é armazenada no banco de dados local (SQLite) e nunca é enviada para nossos servidores.
            </p>
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
                {DEFAULT_MODELS[settings.provider].map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
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
              <label className="text-sm text-slate-600 font-medium block mb-2">
                Temperature ({settings.temperature})
              </label>
              <input
                type="range"
                min="0" max="2" step="0.1"
                value={settings.temperature}
                onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                className="w-full accent-green-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Preciso</span>
                <span>Criativo</span>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-600 font-medium block mb-2">Max Tokens</label>
              <input
                type="number"
                min="100" max="8000" step="100"
                value={settings.maxTokens}
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
              <div className={`mt-4 p-4 rounded-xl border flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${
                testStatus === "success" ? "bg-green-50 border-green-300"
                : testStatus === "error"   ? "bg-red-50 border-red-300"
                                           : "bg-blue-50 border-blue-300"
              }`}>
                {testStatus === "success" && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {testStatus === "error"   && <AlertCircle  className="w-5 h-5 text-red-600" />}
                {testStatus === "testing" && (
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                )}
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
                As chamadas à IA são feitas diretamente do processo principal do Electron,
                sem passar por servidores intermediários.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
