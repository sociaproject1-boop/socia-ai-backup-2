import { useLocation } from "wouter";
import { motion } from "framer-motion";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-6xl font-bold text-gradient">404</h1>
        <p className="mt-3 text-sm text-white/60">This corner of Socia doesn't exist yet.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Back home
        </button>
      </motion.div>
    </div>
  );
}
