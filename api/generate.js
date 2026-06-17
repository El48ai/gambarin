// EL48 AI Image — Serverless Function (Vercel)
// Memanggil Replicate untuk: (1) buat gambar dari teks, (2) edit gambar dari upload + perintah.
// API key DISIMPAN AMAN di server lewat Environment Variable: REPLICATE_API_TOKEN

export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: "REPLICATE_API_TOKEN belum diset di Environment Variable Vercel.",
    });
  }

  try {
    const body = req.body || {};
    const mode = body.mode === "edit" ? "edit" : "generate";
    const prompt = (body.prompt || "").trim();
    const aspectRatio = body.aspect_ratio || "1:1";
    const seed = body.seed;
    const inputImage = body.input_image;

    if (!prompt) {
      return res.status(400).json({ error: "Perintah tidak boleh kosong." });
    }

    // Tentukan model + input sesuai mode
    let modelPath;
    const input = { prompt, output_format: "png" };

    if (mode === "edit") {
      // Model editing instruksi (upload + perintah ubah)
      modelPath = body.model || "black-forest-labs/flux-kontext-pro";
      if (!inputImage) {
        return res.status(400).json({ error: "Gambar belum diunggah." });
      }
      input.input_image = inputImage; // data URI base64 dari browser
    } else {
      // Model teks -> gambar
      modelPath = body.model || "black-forest-labs/flux-1.1-pro";
      input.aspect_ratio = aspectRatio;
      if (seed !== undefined && seed !== null && String(seed).trim() !== "") {
        const n = Number(seed);
        if (!Number.isNaN(n)) input.seed = n;
      }
    }

    // 1) Minta Replicate membuat prediksi (sinkron via header Prefer: wait)
    const createRes = await fetch(
      `https://api.replicate.com/v1/models/${modelPath}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input }),
      }
    );

    let prediction = await createRes.json();

    if (createRes.status !== 200 && createRes.status !== 201) {
      const msg =
        prediction?.detail ||
        prediction?.title ||
        "Gagal memanggil Replicate. Cek API token & saldo akun.";
      return res.status(createRes.status).json({ error: msg });
    }

    // 2) Kalau belum selesai, pantau (polling) sampai beres
    const done = new Set(["succeeded", "failed", "canceled"]);
    let tries = 0;
    while (!done.has(prediction.status) && tries < 45) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${token}` },
      });
      prediction = await pollRes.json();
      tries++;
    }

    if (prediction.status !== "succeeded") {
      return res.status(500).json({
        error:
          prediction?.error ||
          "Gambar gagal dibuat. Coba ubah perintah atau coba lagi.",
      });
    }

    // 3) Ambil URL gambar (bisa berupa string atau array)
    const output = prediction.output;
    const imageUrl = Array.isArray(output) ? output[0] : output;

    if (!imageUrl) {
      return res.status(500).json({ error: "Hasil kosong. Coba lagi." });
    }

    return res.status(200).json({ imageUrl });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err?.message || "Terjadi kesalahan di server." });
  }
}
