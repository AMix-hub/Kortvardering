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
const PAGE_TITLES: Record<"landing" | "valuation" | "sales", string> = {
  landing: "Pokémonkort",
  valuation: "Värdering av kort",
  sales: "Försäljning",
};

function safeImageUrl(url: string, allowedProtocols: string[]): string | null {
  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

export default function CardScanner() {
  const [activeSection, setActiveSection] = useState<"landing" | "valuation" | "sales">("landing");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<AnalyzeCardResponse | null>(null);
  const pageTitle = PAGE_TITLES[activeSection];

  const hasResult = useMemo(() => Boolean(result), [result]);
  const safePreviewUrl = useMemo(() => {
    if (!previewUrl) return null;
    return /^data:image\/(jpeg|png|webp);base64,/i.test(previewUrl) ? previewUrl : null;
  }, [previewUrl]);
  const safeOfficialImageUrl = useMemo(
    () => (result?.official_card_data.image ? safeImageUrl(result.official_card_data.image, ["https:", "http:"]) : null),
    [result],
  );
  const formatPrice = (value: number | null, currency: string) => {
    if (value === null) return "N/A";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
  };

  const onSelectFile = (selectedFile: File | null) => {
    setFile(selectedFile);
    setResult(null);
    setError("");

    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type)) {
      setFile(null);
      setPreviewUrl("");
      setError("Only JPEG, PNG, and WEBP images are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(selectedFile);
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
    <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-fuchsia-300/20 bg-gradient-to-br from-[#14081f] via-[#1d0a2a] to-[#09040f] p-4 text-fuchsia-50 shadow-[0_0_80px_rgba(236,72,153,0.18)] sm:p-6">
      <div className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-24 h-64 w-64 rounded-full bg-pink-400/20 blur-3xl motion-safe:animate-pulse" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-44 w-72 -translate-x-1/2 rounded-full bg-rose-500/20 blur-3xl" />

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-3 text-3xl font-bold text-fuchsia-50 drop-shadow-[0_0_18px_rgba(244,114,182,0.2)] md:text-4xl">{pageTitle}</h1>
          {activeSection === "landing" && <p className="mt-2 text-fuchsia-100/80">Välj vad du vill göra nedan.</p>}
          {activeSection === "valuation" && <p className="mt-2 text-fuchsia-100/80">Ladda upp ett kort för att identifiera och värdera det.</p>}
          {activeSection === "sales" && <p className="mt-2 text-fuchsia-100/80">Sätt ut dina kort till försäljning.</p>}
        </div>
        {activeSection !== "landing" && (
          <button
            onClick={() => setActiveSection("landing")}
            aria-label="Till landningssidan"
            className="rounded-xl border border-pink-300/40 bg-white/[0.06] px-4 py-2 text-sm font-medium text-pink-100 transition-colors hover:bg-white/[0.12]"
          >
            Till landningssidan
          </button>
        )}
      </div>

      {activeSection === "landing" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setActiveSection("valuation")}
            aria-label="Gå till värdering av kort"
            className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-6 text-left shadow-[0_0_35px_rgba(236,72,153,0.16)] transition-all duration-300 hover:shadow-[0_0_55px_rgba(236,72,153,0.3)]"
          >
            <h2 className="text-xl font-semibold">Värdering av kort</h2>
            <p className="mt-2 text-sm text-fuchsia-100/80">Ladda upp ett kort och få värdering direkt.</p>
          </button>
          <button
            onClick={() => setActiveSection("sales")}
            aria-label="Gå till försäljning"
            className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-6 text-left shadow-[0_0_35px_rgba(236,72,153,0.16)] transition-all duration-300 hover:shadow-[0_0_55px_rgba(236,72,153,0.3)]"
          >
            <h2 className="text-xl font-semibold">Försäljning</h2>
            <p className="mt-2 text-sm text-fuchsia-100/80">Sätt ut dina kort till försäljning.</p>
          </button>
        </div>
      )}

      {activeSection === "valuation" && (
        <>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="relative rounded-2xl border-2 border-dashed border-pink-300/70 bg-white/[0.04] p-5 text-center shadow-[inset_0_0_40px_rgba(236,72,153,0.08),0_0_35px_rgba(217,70,239,0.15)] backdrop-blur-md transition-all duration-300 hover:border-pink-200 hover:shadow-[inset_0_0_50px_rgba(236,72,153,0.14),0_0_45px_rgba(217,70,239,0.3)] sm:p-8"
          >
            <input
              id="card-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
            />
            <label htmlFor="card-upload" className="cursor-pointer font-medium text-pink-100 transition-colors hover:text-pink-50">
              Klicka för att välja fil eller dra och släpp kortbild här
            </label>
            {file && <p className="mt-3 text-sm text-fuchsia-100/70">Vald: {file.name}</p>}
            <button
              onClick={onAnalyze}
              disabled={loading || !file}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 px-6 py-2 font-semibold text-slate-950 shadow-[0_0_30px_rgba(236,72,153,0.4)] transition-all duration-300 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_45px_rgba(236,72,153,0.65)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? "Analyserar..." : "Analysera kort"}
            </button>
          </div>

          {error && <div className="mt-4 rounded-xl border border-rose-300/30 bg-rose-500/20 p-3 text-rose-100">{error}</div>}

          {hasResult && result && (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-4 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md transition-all duration-300 hover:shadow-[0_0_55px_rgba(236,72,153,0.3)]">
                <h2 className="mb-3 text-xl font-semibold">Kortjämförelse</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm text-fuchsia-100/70">Uppladdad bild</p>
                    {safePreviewUrl ? (
                      <img
                        src={safePreviewUrl}
                        alt="Uploaded card"
                        className="h-auto w-full rounded-xl border border-pink-300/20 shadow-[0_0_25px_rgba(236,72,153,0.2)] transition-transform duration-300 motion-safe:hover:scale-[1.01]"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-fuchsia-100/70">Officiellt kort</p>
                    {safeOfficialImageUrl ? (
                      <img
                        src={safeOfficialImageUrl}
                        alt={result.name}
                        className="h-auto w-full rounded-xl border border-pink-300/20 shadow-[0_0_25px_rgba(236,72,153,0.2)] transition-transform duration-300 motion-safe:hover:scale-[1.01]"
                      />
                    ) : (
                      <div className="rounded-xl border border-pink-300/20 bg-white/[0.03] p-4 text-sm text-fuchsia-100/70">
                        Ingen officiell bild hittades
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-4 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md">
                  <h2 className="mb-2 text-xl font-semibold">Identifierat kort</h2>
                  <p>{result.name}</p>
                  <p className="text-fuchsia-100/70">{result.set} • #{result.number}</p>
                  <span className="mt-3 inline-block rounded-full border border-pink-200/30 bg-pink-500/20 px-3 py-1 text-sm font-medium text-pink-100 shadow-[0_0_20px_rgba(244,114,182,0.35)]">
                    Konditionsrapport: {result.detected_condition}
                  </span>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fuchsia-100/80">
                    {result.condition_notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-4 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md">
                  <h2 className="mb-3 text-xl font-semibold">Marknadspriser ({result.prices.currency})</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[18rem] table-auto text-left">
                      <thead>
                        <tr className="text-fuchsia-100/70">
                          <th className="pb-2">Låg</th>
                          <th className="pb-2">Medel</th>
                          <th className="pb-2">Hög</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{formatPrice(result.prices.low, result.prices.currency)}</td>
                          <td>{formatPrice(result.prices.average, result.prices.currency)}</td>
                          <td>{formatPrice(result.prices.high, result.prices.currency)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeSection === "sales" && (
        <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-6 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md">
          <h2 className="text-2xl font-semibold">Försäljning</h2>
          <p className="mt-2 text-fuchsia-100/80">Här kan du sätta ut dina kort till försäljning.</p>
        </div>
      )}
    </div>
  );
}
