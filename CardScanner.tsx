import React, { useMemo, useState } from "react";

type AnalyzeCardResponse = {
  name: string;
  set: string;
  number: string;
  detected_condition: string;
  condition_notes: string[];
  official_card_data: {
    id?: string;
    name?: string;
    set?: string;
    number?: string;
    rarity?: string;
    image?: string;
  };
  prices: {
    low: number | null;
    average: number | null;
    high: number | null;
    currency: string;
  };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export default function CardScanner() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<AnalyzeCardResponse | null>(null);

  const hasResult = useMemo(() => Boolean(result), [result]);

  const onSelectFile = (selectedFile: File | null) => {
    setFile(selectedFile);
    setResult(null);
    setError("");

    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextUrl);
  };

  const onAnalyze = async () => {
    if (!file) {
      setError("Please upload a card image first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/analyze-card`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload?.detail;
        if (typeof detail === "string") {
          throw new Error(detail);
        }
        if (detail?.error) {
          throw new Error(`${detail.error}: ${(detail.condition_notes || []).join(" ")}`);
        }
        throw new Error("Failed to analyze card.");
      }

      const payload = (await response.json()) as AnalyzeCardResponse;
      setResult(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files?.[0] ?? null;
    onSelectFile(dropped);
  };

  return (
    <div className="mx-auto max-w-6xl p-6 text-slate-100">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Pokémon Card Valuation</h1>
        <p className="text-slate-300">Upload a card to identify it, assess condition, and get live market pricing.</p>
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="rounded-xl border-2 border-dashed border-cyan-400/70 bg-slate-900/70 p-8 text-center"
      >
        <input
          id="card-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
        />
        <label htmlFor="card-upload" className="cursor-pointer text-cyan-300 hover:text-cyan-200">
          Drag & Drop card image here, or click to upload
        </label>
        {file && <p className="mt-3 text-sm text-slate-300">Selected: {file.name}</p>}
        <button
          onClick={onAnalyze}
          disabled={loading || !file}
          className="mt-6 rounded-lg bg-cyan-500 px-5 py-2 font-semibold text-slate-950 disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze Card"}
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-600/20 p-3 text-red-200">{error}</div>}

      {hasResult && result && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-slate-900/70 p-4">
            <h2 className="mb-3 text-xl font-semibold">Card Comparison</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-2 text-sm text-slate-300">Uploaded Image</p>
                {previewUrl ? <img src={previewUrl} alt="Uploaded card" className="rounded-lg" /> : null}
              </div>
              <div>
                <p className="mb-2 text-sm text-slate-300">Official Card</p>
                {result.official_card_data.image ? (
                  <img src={result.official_card_data.image} alt={result.name} className="rounded-lg" />
                ) : (
                  <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-300">No official image found</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl bg-slate-900/70 p-4">
              <h2 className="mb-2 text-xl font-semibold">Identified Card</h2>
              <p>{result.name}</p>
              <p className="text-slate-300">{result.set} • #{result.number}</p>
              <span className="mt-3 inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-200">
                Condition Report: {result.detected_condition}
              </span>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {result.condition_notes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl bg-slate-900/70 p-4">
              <h2 className="mb-3 text-xl font-semibold">Market Pricing ({result.prices.currency})</h2>
              <table className="w-full table-auto text-left">
                <thead>
                  <tr className="text-slate-300">
                    <th className="pb-2">Low</th>
                    <th className="pb-2">Average</th>
                    <th className="pb-2">High</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${result.prices.low ?? "N/A"}</td>
                    <td>${result.prices.average ?? "N/A"}</td>
                    <td>${result.prices.high ?? "N/A"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
