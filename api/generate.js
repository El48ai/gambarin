// EL48 AI Image (Gambarin) — Serverless Function (Vercel)
// - Buat gambar (Flux) & Edit gambar (Flux Kontext) via Replicate
// - Sistem kode + kuota + batas harian via Upstash Redis
// Semua kredensial disimpan di Environment Variables (tidak bocor ke browser).

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

// Upstash / Vercel KV — dukung dua penamaan env var yang umum
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const FREE_MODEL = "black-forest-labs/flux-schnell";
const DAILY_FREE_CAP = 100; // batas TOTAL gambar gratis per hari (rem darurat biaya)

// ---------- Upstash helpers (REST) ----------
function kvReady() {
  return Boolean(KV_URL && KV_TOKEN);
}
async function kvCmd(path) {
  const res = await fetch(`${KV_URL}/${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result;
}
const kvGet = (k) => kvCmd(`get/${encodeURIComponent(k)}`);
const kvIncr = (k) => kvCmd(`incr/${encodeURIComponent(k)}`);
const kvDecr = (k) => kvCmd(`decr/${encodeURIComponent(k)}`);
const kvExpire = (k, s) => kvCmd(`expire/${encodeURIComponent(k)}/${s}`);

function todayKey() {
  return `daily:${new Date().toISOString().slice(0, 10)}`; // daily:YYYY-MM-DD
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: "REPLICATE_API_TOKEN belum diset di server." });

  try {
    const body = req.body || {};

    // ===== Cek kode (untuk tombol "Aktifkan") =====
    if (body.action === "check") {
      const code = (body.code || "").trim().toUpperCase();
      if (!code) return res.status(400).json({ error: "Kode kosong." });
      if (!kvReady()) return res.status(500).json({ error: "Sistem kode belum diaktifkan di server." });
      const raw = await kvGet(`code:${code}`);
      if (raw === null || raw === undefined) return res.status(404).json({ error: "Kode tidak ditemukan." });
      const n = parseInt(raw, 10);
      if (Number.isNaN(n) || n <= 0) return res.status(403).json({ error: "Kuota kode sudah habis." });
      return res.status(200).json({ valid: true, quotaRemaining: n });
    }

    // ===== Generate / Edit =====
    const mode = body.mode === "edit" ? "edit" : "generate";
    const prompt = (body.prompt || "").trim();
    const code = (body.code || "").trim().toUpperCase();
    const aspectRatio = body.aspect_ratio || "1:1";
    const seed = body.seed;
    const inputImage = body.input_image;

    if (!prompt) return res.status(400).json({ error: "Perintah tidak boleh kosong." });

    // Tentukan model
    let modelPath;
    const input = { prompt, output_format: "png" };
    if (mode === "edit") {
      modelPath = body.model || "black-forest-labs/flux-kontext-pro";
    } else {
      modelPath = body.model || FREE_MODEL;
      input.aspect_ratio = aspectRatio;
      if (seed !== undefined && seed !== null && String(seed).trim() !== "") {
        const ns = Number(seed);
        if (!Number.isNaN(ns)) input.seed = ns;
      }
    }

    // Apakah butuh PRO? (edit, atau model selain Schnell)
    const isProRequest = mode === "edit" || modelPath !== FREE_MODEL;
    let usingCode = false;

    if (isProRequest) {
      // Wajib kode valid
      if (!code) return res.status(402).json({ error: "Fitur Pro butuh kode. Masukkan kode atau beli dulu." });
      if (!kvReady()) return res.status(500).json({ error: "Sistem kode belum diaktifkan di server." });
      const raw = await kvGet(`code:${code}`);
      if (raw === null || raw === undefined) return res.status(404).json({ error: "Kode tidak ditemukan." });
      const n = parseInt(raw, 10);
      if (Number.isNaN(n) || n <= 0) return res.status(403).json({ error: "Kuota kode sudah habis. Silakan beli lagi." });
      usingCode = true;
    } else {
      // Gratis (Schnell). Kalau ada kode valid, pakai kuota kode; kalau tidak, cek batas harian.
      if (code && kvReady()) {
        const raw = await kvGet(`code:${code}`);
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n > 0) usingCode = true;
      }
      if (!usingCode && kvReady()) {
        const used = parseInt(await kvGet(todayKey()), 10) || 0;
        if (used >= DAILY_FREE_CAP) {
          return res.status(429).json({ error: "Kuota gratis hari ini sudah penuh. Coba lagi besok atau pakai kode Pro." });
        }
      }
    }

    // ---------- Panggil Replicate ----------
    if (mode === "edit") {
      if (!inputImage) return res.status(400).json({ error: "Gambar belum diunggah." });
      input.input_image = inputImage;
    }

    const createRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input }),
    });
    let prediction = await createRes.json();
    if (createRes.status !== 200 && createRes.status !== 201) {
      const msg = prediction?.detail || prediction?.title || "Gagal memanggil Replicate. Cek API token & saldo.";
      return res.status(createRes.status).json({ error: msg });
    }

    const done = new Set(["succeeded", "failed", "canceled"]);
    let tries = 0;
    while (!done.has(prediction.status) && tries < 45) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } });
      prediction = await poll.json();
      tries++;
    }
    if (prediction.status !== "succeeded") {
      return res.status(500).json({ error: prediction?.error || "Gambar gagal dibuat. Coba lagi." });
    }
    const out = prediction.output;
    const imageUrl = Array.isArray(out) ? out[0] : out;
    if (!imageUrl) return res.status(500).json({ error: "Hasil kosong. Coba lagi." });

    // ---------- Sukses → update kuota ----------
    let quotaRemaining = null;
    if (usingCode) {
      try { quotaRemaining = await kvDecr(`code:${code}`); } catch {}
    } else if (kvReady()) {
      try {
        const after = await kvIncr(todayKey());
        if (Number(after) === 1) await kvExpire(todayKey(), 60 * 60 * 48);
      } catch {}
    }

    return res.status(200).json({ imageUrl, quotaRemaining });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Terjadi kesalahan di server." });
  }
}
