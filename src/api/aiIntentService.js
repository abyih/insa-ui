/**
 * AI Intent Service for SDN Network Slicing (IBN Layer)
 *
 * Translates natural language network operator intents into structured,
 * actionable OpenFlow network slicing policies grounded against live ONOS topology.
 *
 * Supported AI Backends:
 *   1. Google Gemini API (Free tier from Google AI Studio)
 *   2. Groq Cloud API (Free tier from Groq Console)
 *   3. OpenRouter API (Free models)
 *   4. Offline Smart Heuristic Parser (Built-in rule-based fallback, no API key needed)
 */

import { SLICE_TEMPLATES } from "./slicingService";

const SETTINGS_KEY = "sdn-ai-intent-settings";
const HISTORY_KEY = "sdn-ai-intent-history";

// ─── Default Settings ────────────────────────────────────────────────────────
export const DEFAULT_AI_SETTINGS = {
  provider: "gemini", // "gemini" | "groq" | "openrouter" | "heuristic"
  apiKey: "",
  model: "gemini-3.7-flash",
  temperature: 0.1,
};

export const PROVIDER_MODELS = {
  gemini: [
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash (Latest 2026 • Coding & Agentic • Recommended)" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (High-Efficiency Code & Knowledge)" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (Fast Standard)" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite (Ultra-Low Latency & High Volume)" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Legacy LTS)" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Legacy Pro)" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile (Flagship Open Weights • Free)" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Ultra-Fast 1000+ tok/s)" },
    { id: "gpt-oss-120b", name: "GPT-OSS 120B (High-Speed Reasoning with Tool Use)" },
    { id: "gpt-oss-20b", name: "GPT-OSS 20B (Fast Tool Reasoning)" },
    { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B (Deep Reasoning)" },
    { id: "qwen-2.5-32b", name: "Qwen 2.5 32B (Structured Output)" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
  ],
  openrouter: [
    { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash (via OpenRouter)" },
    { id: "google/gemini-3.6-flash", name: "Gemini 3.6 Flash (via OpenRouter)" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B Instruct (Free)" },
    { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B Instruct (Free)" },
    { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Free)" },
    { id: "deepseek/deepseek-chat:free", name: "DeepSeek V3 (Free)" },
    { id: "qwen/qwen-2.5-72b-instruct:free", name: "Qwen 2.5 72B (Free)" },
  ],
  heuristic: [
    { id: "rule-based-v1", name: "Built-in Smart Heuristic Parser (Offline)" },
  ],
  "local-nlp": [
    { id: "all-MiniLM-L6-v2", name: "Local Pretrained Neural Engine (all-MiniLM-L6-v2 • 100% Offline & Private)" },
  ],
};

// ─── Settings Persistence ───────────────────────────────────────────────────

export function getAiSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    
    // Check environment variables if apiKey is not in localStorage
    const envGeminiKey = import.meta.env?.VITE_GEMINI_API_KEY;
    const envGroqKey = import.meta.env?.VITE_GROQ_API_KEY;

    let defaultProvider = parsed.provider || "gemini";
    let defaultKey = parsed.apiKey || (defaultProvider === "gemini" ? envGeminiKey : envGroqKey) || "";

    if (!defaultKey && envGeminiKey) {
      defaultProvider = "gemini";
      defaultKey = envGeminiKey;
    }

    return {
      provider: defaultProvider,
      apiKey: defaultKey,
      model: parsed.model || (defaultProvider === "gemini" ? "gemini-3.7-flash" : "llama-3.3-70b-versatile"),
      temperature: parsed.temperature ?? 0.1,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save AI settings:", err);
  }
}

// ─── History Management ─────────────────────────────────────────────────────

export function getAiIntentHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addAiIntentHistory(item) {
  try {
    const history = getAiIntentHistory();
    const updated = [
      {
        id: `intent-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...item,
      },
      ...history.slice(0, 19), // keep last 20
    ];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearAiIntentHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ─── AI System Prompt Generator with Live Topology Grounding ─────────────────

function generateSystemPrompt(networkContext) {
  const { onosHosts = [], existingSlices = [], totalCapacity = 100000, remainingCapacity = 100000 } = networkContext;

  const hostSummaries = onosHosts.map((h, i) => {
    const ips = h.ipAddresses || [];
    const ip = ips.find((ip) => !ip.includes(":")) || ips[0] || "Unknown IP";
    const loc = h.locations?.[0] || h.location || {};
    return `Host #${i + 1}: IP=${ip}, MAC=${h.mac}, Switch=${loc.elementId || "unknown"}, Port=${loc.port || "?"}`;
  }).join("\n");

  const existingSliceSummaries = existingSlices.map((s) => {
    return `Slice "${s.name}" (VLAN ${s.vlanId}): Bandwidth=${s.bandwidth} KB/s, Hosts=[${(s.hosts || []).map((h) => h.ipAddresses?.[0] || h.mac).join(", ")}]`;
  }).join("\n");

  return `You are the AI Intent Compiler for an ONOS Software-Defined Network (SDN) Controller with dynamic Network Slicing.
Your job is to parse high-level natural language user intents into structured, feasible, and isolated Network Slicing specifications based on 3GPP 5G slicing definitions (eMBB, URLLC, mMTC, Best-Effort).

### LIVE NETWORK TOPOLOGY CONTEXT:
1. Available Discovered Hosts:
${hostSummaries || "No live hosts discovered yet. You may assign placeholder host IPs if specified by the user."}

2. Existing Configured Slices:
${existingSliceSummaries || "None (fresh network)."}

3. Physical Capacity Pool:
- Total Infrastructure Capacity: ${totalCapacity} KB/s (${(totalCapacity / 1000).toFixed(0)} MB/s)
- Available Remaining Unallocated Capacity: ${remainingCapacity} KB/s (${(remainingCapacity / 1000).toFixed(0)} MB/s)

### SLICE TYPE MAPPINGS & SLA STANDARDS:
- "embb" (Enhanced Mobile Broadband): Video streaming, high throughput, bulk file transfers. Default bandwidth: 20000–50000 KB/s. Color: #6366f1.
- "urllc" (Ultra-Reliable Low Latency): Mission critical, autonomous vehicles, robotic surgery, SCADA, industrial control. Guaranteed priority, moderate bandwidth (5000–20000 KB/s), small burst. Color: #ef4444.
- "mmtc" (Massive Machine-Type / IoT): Sensor telemetry, smart meters, weather sensors, low power devices. Bandwidth: 500–2000 KB/s. Color: #22c55e.
- "best-effort": Standard internet, general office browsing. Bandwidth: 1000–5000 KB/s. Color: #a1a1aa.

### STRICT RULES:
1. Match requested hosts/devices to the Available Discovered Hosts by IP, MAC, or context. If the user mentions "all hosts", assign all available hosts. If the user mentions specific IPs (e.g. 10.0.0.1 and 10.0.0.2), map them to the corresponding live host IPs/MACs.
2. The bandwidth MUST NOT exceed the Available Remaining Capacity (${remainingCapacity} KB/s) unless forced, in which case set admissionStatus to "REJECTED_CAPACITY".
3. Bandwidth must ALWAYS be specified as an integer in KB_PER_SEC (e.g., 10 Mbps = 1250 KB/s or 10000 KB/s, 50 Mbps = 6250 KB/s, 50 MB/s = 50000 KB/s).
4. Provide a clear, technical rationale explaining the QoS decisions, 3GPP slice classification, and OpenFlow policy mapping.

### OUTPUT JSON SCHEMA:
Return ONLY valid raw JSON with NO markdown formatting, no backticks, adhering to this exact schema:
{
  "sliceName": "string (Descriptive slice name, e.g. 'URLLC-AutonomousVehicles')",
  "sliceType": "embb" | "urllc" | "mmtc" | "best-effort",
  "description": "string (Short summary of the slice purpose)",
  "bandwidth": number (Integer in KB/s),
  "burstSize": number (Integer in KB, typically 20% of bandwidth),
  "unit": "KB_PER_SEC",
  "color": "string (Hex color code, e.g. #ef4444 for URLLC, #6366f1 for eMBB, #22c55e for mMTC)",
  "vlanId": number | null (VLAN tag 100-4094, or null for auto-assignment),
  "targetHostIps": ["string"] (Array of host IPs to include in the slice, e.g. ["10.0.0.1", "10.0.0.2"]),
  "confidence": number (Between 0.0 and 1.0, e.g. 0.95),
  "reasoning": "string (Concise technical explanation of parameters and mapping)",
  "admissionStatus": "APPROVED" | "REJECTED_CAPACITY" | "REJECTED_NO_HOSTS",
  "openFlowActions": [
    "string" (List of human-readable OpenFlow rules to be enforced, e.g. "Install Meter on ingress switch with DROP band", "Priority 40000 Unicast peer forwarding", "Priority 40000 ARP broadcast route", "Priority 39000 Isolation drop boundary")
  ]
}`;
}

// ─── Built-in Smart Heuristic Parser (Offline Fallback) ──────────────────────

export function compileIntentHeuristically(prompt, networkContext = {}) {
  const { onosHosts = [], remainingCapacity = 100000 } = networkContext;
  const p = prompt.toLowerCase();

  // 1. Detect Slice Type
  let sliceType = "best-effort";
  let template = SLICE_TEMPLATES.find((t) => t.id === "best-effort");

  if (p.includes("urllc") || p.includes("low latency") || p.includes("surgery") || p.includes("vehicle") || p.includes("critical") || p.includes("scada") || p.includes("urgent") || p.includes("emergency")) {
    sliceType = "urllc";
    template = SLICE_TEMPLATES.find((t) => t.id === "urllc") || template;
  } else if (p.includes("embb") || p.includes("broadband") || p.includes("video") || p.includes("stream") || p.includes("4k") || p.includes("download") || p.includes("high speed") || p.includes("heavy") || p.includes("gaming")) {
    sliceType = "embb";
    template = SLICE_TEMPLATES.find((t) => t.id === "embb") || template;
  } else if (p.includes("mmtc") || p.includes("iot") || p.includes("sensor") || p.includes("telemetry") || p.includes("meter") || p.includes("smart city") || p.includes("low power") || p.includes("monitoring")) {
    sliceType = "mmtc";
    template = SLICE_TEMPLATES.find((t) => t.id === "mmtc") || template;
  }

  // 2. Extract Bandwidth if explicitly specified in text
  let bandwidth = template.bandwidth;
  const gbMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:gbps|gb\/s|gigabit)/);
  const mbMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s|megabit|mb)/);
  const kbMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:kbps|kb\/s|kilobit|kb)/);

  if (gbMatch) {
    bandwidth = Math.round(parseFloat(gbMatch[1]) * 1000000);
  } else if (mbMatch) {
    bandwidth = Math.round(parseFloat(mbMatch[1]) * 1000);
  } else if (kbMatch) {
    bandwidth = Math.round(parseFloat(kbMatch[1]));
  }

  // 3. Extract Hosts / IPs from prompt or match to live hosts
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const foundIps = prompt.match(ipRegex) || [];

  let targetHostIps = [];
  if (p.includes("all host") || p.includes("all devices") || p.includes("entire network") || p.includes("every host")) {
    targetHostIps = onosHosts.map((h) => (h.ipAddresses || [])[0]).filter(Boolean);
  } else if (foundIps.length > 0) {
    targetHostIps = foundIps;
  } else if (onosHosts.length > 0) {
    // Default to first 2 available hosts if unspecified
    targetHostIps = onosHosts.slice(0, 2).map((h) => (h.ipAddresses || [])[0]).filter(Boolean);
  }

  // 4. Generate Slice Name
  let nameWords = prompt
    .replace(/[^\w\s]/gi, "")
    .split(/\s+/)
    .filter((w) => !["create", "a", "an", "the", "for", "with", "slice", "network", "of", "and", "to", "between"].includes(w.toLowerCase()))
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  let sliceName = nameWords.join("-") || `${template.name.split(" ")[0]}-Slice`;

  // 5. Admission Check
  let admissionStatus = "APPROVED";
  if (bandwidth > remainingCapacity) {
    admissionStatus = "REJECTED_CAPACITY";
  } else if (targetHostIps.length === 0 && onosHosts.length === 0) {
    admissionStatus = "REJECTED_NO_HOSTS";
  }

  const burstSize = Math.round(bandwidth * 0.2);

  return {
    sliceName,
    sliceType,
    description: `Auto-compiled intent: ${template.description}`,
    bandwidth,
    burstSize,
    unit: "KB_PER_SEC",
    color: template.color,
    vlanId: null, // auto-allocate
    targetHostIps,
    confidence: 0.92,
    reasoning: `Matched intent to 3GPP ${template.name} profile based on semantic keywords. Configured rate-limiting meter at ${bandwidth} KB/s with burst allowance of ${burstSize} KB.`,
    admissionStatus,
    openFlowActions: [
      `Configure OpenFlow Meter on ingress switches: DROP band at ${bandwidth} KB/s`,
      `Install Priority 40000 End-to-End multi-switch forwarding between ${targetHostIps.join(" <-> ") || "selected hosts"}`,
      `Install Priority 40000 Slice-aware ARP broadcast routing`,
      `Install Priority 39000 Ingress isolation drop boundary to enforce slice separation`,
    ],
  };
}

// ─── Google Gemini API Connector ─────────────────────────────────────────────

async function callGeminiApi(apiKey, model, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const isGemini3 = model.includes("gemini-3") || model.includes("gemini-2.5");
  const generationConfig = {
    responseMimeType: "application/json",
  };
  if (!isGemini3) {
    generationConfig.temperature = 0.1;
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\nUSER INTENT PROMPT: "${userPrompt}"\n\nGenerate the JSON specification now:` }],
      },
    ],
    generationConfig,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const errObj = JSON.parse(errorText);
      parsedErr = errObj.error?.message || errorText;
    } catch { /* silent */ }
    throw new Error(`Gemini API Error (${response.status}): ${parsedErr}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("No response generated by Gemini model.");

  try {
    return JSON.parse(rawText.trim());
  } catch (err) {
    // Strip possible markdown ticks if any
    const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

// ─── Groq API Connector ──────────────────────────────────────────────────────

async function callGroqApi(apiKey, model, systemPrompt, userPrompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const requestBody = {
    model: model || "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `USER INTENT PROMPT: "${userPrompt}"\nReturn ONLY the raw JSON adhering to the schema.` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const errObj = JSON.parse(errorText);
      parsedErr = errObj.error?.message || errorText;
    } catch { /* silent */ }
    throw new Error(`Groq API Error (${response.status}): ${parsedErr}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("No response generated by Groq model.");

  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── OpenRouter API Connector ────────────────────────────────────────────────

async function callOpenRouterApi(apiKey, model, systemPrompt, userPrompt) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const requestBody = {
    model: model || "google/gemini-2.0-flash-exp:free",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `USER INTENT PROMPT: "${userPrompt}"\nReturn ONLY the raw JSON adhering to the schema.` },
    ],
    temperature: 0.1,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "SDN Network Slicing IBN",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("No response generated by OpenRouter model.");

  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── Local Neural NLP API Connector (100% Offline & Private) ─────────────

export async function callLocalNlpApi(prompt, networkContext = {}) {
  const endpoints = ["/api/onos/intent/compile", "http://127.0.0.1:5005/compile"];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, networkContext }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        return await res.json();
      }
      const errText = await res.text();
      lastError = new Error(`Local Intent Service error (${res.status}): ${errText}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Failed to connect to local neural intent service on port 5005.");
}

// ─── Public Main Method: Compile Natural Language Intent ─────────────────────

/**
 * Main intent compilation entry point.
 *
 * @param {string} prompt - Operator intent prompt
 * @param {Object} networkContext - { onosHosts, existingSlices, totalCapacity, remainingCapacity }
 * @param {Object} overrideSettings - Optional settings override
 * @returns {Promise<Object>} Compiled Intent Object
 */
export async function compileIntent(prompt, networkContext = {}, overrideSettings = null) {
  if (!prompt || !prompt.trim()) {
    throw new Error("Intent prompt cannot be empty.");
  }

  const settings = overrideSettings || getAiSettings();
  const systemPrompt = generateSystemPrompt(networkContext);
  let result = null;
  let providerUsed = settings.provider;

  // If provider is local-nlp, call local neural microservice without requiring apiKey
  if (settings.provider === "local-nlp") {
    try {
      result = await callLocalNlpApi(prompt, networkContext);
      providerUsed = "local-nlp (all-MiniLM-L6-v2)";
    } catch (err) {
      console.warn(`[AI Intent] Local NLP call failed (${err.message}). Falling back to Heuristic Parser.`, err);
      result = compileIntentHeuristically(prompt, networkContext);
      result.reasoning = `[Local Service Fallback: ${err.message}] ` + (result.reasoning || "");
      providerUsed = "heuristic (fallback)";
    }
  } else if (settings.provider === "heuristic" || !settings.apiKey) {
    result = compileIntentHeuristically(prompt, networkContext);
    providerUsed = "heuristic";
  } else {
    try {
      if (settings.provider === "gemini") {
        result = await callGeminiApi(settings.apiKey, settings.model, systemPrompt, prompt);
      } else if (settings.provider === "groq") {
        result = await callGroqApi(settings.apiKey, settings.model, systemPrompt, prompt);
      } else if (settings.provider === "openrouter") {
        result = await callOpenRouterApi(settings.apiKey, settings.model, systemPrompt, prompt);
      } else {
        result = compileIntentHeuristically(prompt, networkContext);
        providerUsed = "heuristic";
      }
    } catch (err) {
      console.warn(`[AI Intent] ${settings.provider} call failed (${err.message}). Falling back to Heuristic Parser.`, err);
      result = compileIntentHeuristically(prompt, networkContext);
      result.reasoning = `[Fallback Mode: ${err.message}] ` + (result.reasoning || "");
      providerUsed = "heuristic (fallback)";
    }
  }

  // ── Post-processing & Grounding validation ──
  const { onosHosts = [], remainingCapacity = 100000 } = networkContext;

  // Resolve target host objects from live topology
  const matchedHosts = [];
  const targetIps = result.targetHostIps || [];

  for (const host of onosHosts) {
    const hostIps = host.ipAddresses || [];
    const hasIpMatch = targetIps.some((tip) => hostIps.includes(tip) || host.mac === tip);
    if (hasIpMatch) {
      matchedHosts.push(host);
    }
  }

  // If no host matched by IP, but hosts exist and user didn't specify IPs, select first available hosts
  if (matchedHosts.length === 0 && onosHosts.length > 0 && targetIps.length === 0) {
    matchedHosts.push(...onosHosts.slice(0, 2));
  }

  // Capacity check
  const requestedBandwidth = Number(result.bandwidth) || 5000;
  let finalAdmissionStatus = result.admissionStatus || "APPROVED";
  if (requestedBandwidth > remainingCapacity) {
    finalAdmissionStatus = "REJECTED_CAPACITY";
  }

  const finalOutput = {
    ...result,
    provider: providerUsed,
    bandwidth: requestedBandwidth,
    burstSize: Number(result.burstSize) || Math.round(requestedBandwidth * 0.2),
    matchedHosts,
    admissionStatus: finalAdmissionStatus,
    rawPrompt: prompt,
    compiledAt: new Date().toISOString(),
  };

  // Add to history
  addAiIntentHistory({
    prompt,
    sliceName: finalOutput.sliceName,
    sliceType: finalOutput.sliceType,
    bandwidth: finalOutput.bandwidth,
    hostCount: matchedHosts.length,
    status: finalAdmissionStatus,
    provider: providerUsed,
  });

  return finalOutput;
}

// ─── Connection Tester ───────────────────────────────────────────────────────

export async function testAiConnection(provider, apiKey, model) {
  if (provider === "heuristic") {
    return { success: true, latency: 5, message: "Offline Heuristic Parser ready." };
  }

  if (provider === "local-nlp") {
    const startTime = Date.now();
    try {
      const endpoints = ["/api/onos/intent/health", "http://127.0.0.1:5005/health"];
      let data = null;
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            data = await res.json();
            break;
          }
        } catch {
          // try next
        }
      }
      if (!data) throw new Error("Local service unreachable on port 5005. Run: bun run intent:service");
      const latency = Date.now() - startTime;
      return {
        success: true,
        latency,
        message: `Local Neural Engine connected (${data.model || "all-MiniLM-L6-v2"} • ${latency}ms • 100% Offline)`,
      };
    } catch (err) {
      return {
        success: false,
        latency: 0,
        message: err.message || "Local Neural Engine is offline.",
      };
    }
  }

  if (!apiKey) {
    throw new Error("Please provide an API key to test the connection.");
  }

  const startTime = Date.now();
  const testPrompt = "Ping: Return minimal test JSON";
  const dummyContext = { onosHosts: [], existingSlices: [], totalCapacity: 100000, remainingCapacity: 100000 };
  const systemPrompt = generateSystemPrompt(dummyContext);

  try {
    if (provider === "gemini") {
      await callGeminiApi(apiKey, model || "gemini-1.5-flash", systemPrompt, testPrompt);
    } else if (provider === "groq") {
      await callGroqApi(apiKey, model || "llama-3.3-70b-versatile", systemPrompt, testPrompt);
    } else if (provider === "openrouter") {
      await callOpenRouterApi(apiKey, model || "google/gemini-2.0-flash-exp:free", systemPrompt, testPrompt);
    }
    const latency = Date.now() - startTime;
    return { success: true, latency, message: `Connected successfully (${latency}ms)` };
  } catch (err) {
    return { success: false, latency: 0, message: err.message };
  }
}
