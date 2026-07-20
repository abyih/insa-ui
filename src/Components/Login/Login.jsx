import { useNavigate } from "react-router-dom";
import { useState } from "react";
import Input from "../common/Input";

// Simple credentials — no hashing, no async
const CREDENTIALS = { username: "insa", password: "insa123" };

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
      localStorage.setItem("isAuthenticated", "true");
      navigate("/dashboard");
    } else {
      setError("Wrong username or password");
      setPassword("");
    }
  };

  return (
    <div className="absolute inset-0 flex justify-center items-center bg-gray-100">
      <div className="bg-gray-50 p-8 rounded-xl border w-80">
        <h2 className="text-xl font-bold mb-6 text-center text-blue-900">PNTC Login</h2>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <Input
            label="Username"
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
          />
          <Input
            label="Password"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="mt-2 py-2 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded font-medium"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
