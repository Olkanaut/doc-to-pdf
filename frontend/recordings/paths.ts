import path from "node:path";

export const OUT_DIR = path.join(import.meta.dirname, "out");
export const AUTH_STATE = path.join(OUT_DIR, ".auth", "state.json");
