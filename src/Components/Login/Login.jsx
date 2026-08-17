import { useNavigate } from "react-router-dom";
import { useState } from "react";
import Input from "../common/Input";
import logo from "../../assets/images/insa_logo.png";
import { ShieldAlert, KeyRound, User } from "lucide-react";

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
      window.dispatchEvent(new Event("auth-changed"));
      navigate("/dashboard");
    } else {
      setError("Incorrect username or password. Please try again.");
      setPassword("");
    }
  };

  return (
    <div className="absolute inset-0 flex justify-center items-center bg-zinc-950 overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[100px] -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan-500/10 blur-[100px] -z-10 animate-pulse duration-5000"></div>

      <div className="w-full max-w-sm px-4">
        {/* Glassmorphic Card */}
        <div className="bg-zinc-900/50 border border-zinc-800 backdrop-blur-xl p-8 rounded-2xl shadow-2xl relative overflow-hidden">
          
          {/* Header block with Logo */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full blur opacity-45"></div>
              <img
                className="relative w-16 h-16 p-0.5 bg-zinc-900 rounded-full border border-zinc-800"
                src={logo}
                alt="insa-logo"
              />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-50">PNTC Platform</h2>
              <p className="text-xs text-zinc-400 mt-1 font-medium">Software Defined Network Control</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="relative">
              <Input
                label="Username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                className="pl-9"
              />
              <User className="absolute left-3 bottom-3 w-4 h-4 text-zinc-500" />
            </div>

            <div className="relative">
              <Input
                label="Password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="pl-9"
              />
              <KeyRound className="absolute left-3 bottom-3 w-4 h-4 text-zinc-500" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-3 rounded-lg">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-2 py-2.5 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-semibold rounded-lg text-sm transition-all duration-200 shadow-md shadow-zinc-950/20 active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default Login;
