import React, { useState } from "react";
import axios from "axios";
import { Select, MenuItem, FormControl, InputLabel } from "@mui/material";

const ApiTester = () => {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const authHeader = `Basic ${btoa("admin:admin")}`;

  const handleRequest = () => {
    const config = {
      method,
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      data: body ? JSON.parse(body) : null,
    };

    axios(config)
      .then((res) => {
        setResponse(res.data);
        setError(null);
      })
      .catch((err) => {
        console.error("Error response:", err.response?.data?.errors || err.message);
        setError(err.message);
        setResponse(null);
      });
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 flex flex-col gap-4">
        <FormControl fullWidth>
          <InputLabel id="method-select-label">Method</InputLabel>
          <Select
            labelId="method-select-label"
            id="method-select"
            value={method}
            label="Method"
            onChange={(e) => setMethod(e.target.value)}
          >
            <MenuItem value="GET">GET</MenuItem>
            <MenuItem value="POST">POST</MenuItem>
            <MenuItem value="PUT">PUT</MenuItem>
            <MenuItem value="DELETE">DELETE</MenuItem>
          </Select>
        </FormControl>

        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Enter API URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handleRequest}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Send
          </button>
        </div>

        {(method === "POST" || method === "PUT") && (
          <textarea
            placeholder="Enter JSON Body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows="5"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        )}
      </div>

      <div className="mt-6">
        {response && (
          <div className="bg-green-50 border border-green-300 p-4 rounded">
            <h3 className="text-green-800 font-semibold mb-2">Response:</h3>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-300 p-4 rounded mt-4">
            <h3 className="text-red-800 font-semibold mb-2">Error:</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiTester;
