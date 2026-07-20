import React, { useState } from "react";
import axios from "axios";
import { Send, Wrench, AlertCircle, CheckCircle } from "lucide-react";

const ApiTester = () => {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const authHeader = `Basic ${btoa("admin:admin")}`;

  const handleRequest = () => {
    let parsedBody = null;
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        setError(`Invalid request body JSON: ${e.message}`);
        setResponse(null);
        return;
      }
    }

    const config = {
      method,
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      data: parsedBody,
    };

    axios(config)
      .then((res) => {
        setResponse(res.data);
        setError(null);
      })
      .catch((err) => {
        console.error("Error response:", err.response?.data?.errors || err.message);
        setError(err.response?.data ? JSON.stringify(err.response.data, null, 2) : err.message);
        setResponse(null);
      });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Title */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-50 flex items-center gap-2">
          <Wrench className="w-6 h-6 text-indigo-400" />
          API Request Tester
        </h2>
        <p className="text-sm text-zinc-400">Perform direct RESTCONF calls to OpenDaylight controller datastores with admin authentication.</p>
      </div>

      {/* Main Request Form Card */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-lg space-y-5">
        
        {/* Method & URL selector row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">HTTP Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-700 transition"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Request URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter API Endpoint (e.g., /api/rests/data/...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-lg text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition"
              />
              <button
                onClick={handleRequest}
                className="bg-zinc-50 hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition duration-150 shadow-md shadow-zinc-950/20 active:scale-[0.98]"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Body input (POST/PUT) */}
        {(method === "POST" || method === "PUT") && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Request Body (JSON)</label>
            <textarea
              placeholder='Enter JSON Body (e.g., { "input": { ... } })'
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows="6"
              className="w-full p-4 bg-zinc-950 border border-zinc-800 text-emerald-400 font-mono text-xs rounded-lg placeholder-zinc-650 focus:outline-none focus:border-zinc-700 transition"
            />
          </div>
        )}
      </div>

      {/* Response blocks */}
      {(response || error) && (
        <div className="space-y-4">
          {response && (
            <div className="bg-zinc-900 border border-emerald-500/20 rounded-2xl p-6 space-y-3 shadow-lg">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider text-xs">
                <CheckCircle className="w-4 h-4" />
                Response Data
              </h3>
              <pre className="whitespace-pre-wrap break-words text-xs font-mono text-zinc-200 bg-zinc-950 border border-zinc-850 p-4 rounded-xl max-h-[450px] overflow-y-auto">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="bg-zinc-900 border border-red-500/20 rounded-2xl p-6 space-y-3 shadow-lg">
              <h3 className="text-sm font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wider text-xs">
                <AlertCircle className="w-4 h-4" />
                Error Diagnostics
              </h3>
              <pre className="whitespace-pre-wrap break-words text-xs font-mono text-red-400 bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ApiTester;
