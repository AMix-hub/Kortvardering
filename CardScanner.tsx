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

type Lang = "sv" | "en";

const TRANSLATIONS = {
  sv: {
    pageTitles: { landing: "Pokémonkort", valuation: "Värdering av kort", sales: "Försäljning" } as Record<"landing" | "valuation" | "sales", string>,
    subtitleLanding: "Välj vad du vill göra nedan.",
    subtitleValuation: "Ladda upp ett kort för att identifiera och värdera det.",
    subtitleSales: "Sätt ut dina kort till försäljning.",
    backToHome: "Till startsidan",
    goToValuation: "Gå till värdering av kort",
    goToSales: "Gå till försäljning",
    valuationTitle: "Värdering av kort",
    valuationDesc: "Ladda upp ett kort och få värdering direkt.",
    salesTitle: "Försäljning",
    salesDesc: "Sätt ut dina kort till försäljning.",
    uploadLabel: "Klicka för att välja fil eller dra och släpp kortbild här",
    selectedFile: (name: string) => `Vald: ${name}`,
    analyzeBtn: "Analysera kort",
    analyzingBtn: "Analyserar...",
    errorNoFile: "Ladda upp en kortbild först.",
    errorUnsupportedFormat: "Enbart JPEG, PNG och WEBP-bilder stöds.",
    errorFailedAnalysis: "Kunde inte analysera kortet.",
    errorUnexpected: "Oväntat fel",
    cardComparison: "Kortjämförelse",
    uploadedImage: "Uppladdad bild",
    officialCard: "Officiellt kort",
    noOfficialImage: "Ingen officiell bild hittades",
    identifiedCard: "Identifierat kort",
    conditionReport: (cond: string) => `Konditionsrapport: ${cond}`,
    marketPricing: (currency: string) => `Marknadspriser (${currency})`,
    priceLow: "Låg",
    priceAverage: "Medel",
    priceHigh: "Hög",
    salesSectionTitle: "Försäljning",
    salesSectionDesc: "Här kan du sätta ut dina kort till försäljning.",
    switchLang: "🇬🇧 EN",
    switchLangLabel: "Byt till engelska",
  },
  en: {
    pageTitles: { landing: "Pokémon Cards", valuation: "Card Valuation", sales: "Sales" } as Record<"landing" | "valuation" | "sales", string>,
    subtitleLanding: "Choose what you want to do below.",
    subtitleValuation: "Upload a card to identify and value it.",
    subtitleSales: "List your cards for sale.",
    backToHome: "Back to home",
    goToValuation: "Go to card valuation",
    goToSales: "Go to sales",
    valuationTitle: "Card Valuation",
    valuationDesc: "Upload a card and get an instant valuation.",
    salesTitle: "Sales",
    salesDesc: "List your cards for sale.",
    uploadLabel: "Click to choose a file or drag and drop a card image here",
    selectedFile: (name: string) => `Selected: ${name}`,
    analyzeBtn: "Analyze card",
    analyzingBtn: "Analyzing...",
    errorNoFile: "Please upload a card image first.",
    errorUnsupportedFormat: "Only JPEG, PNG, and WEBP images are supported.",
    errorFailedAnalysis: "Failed to analyze card.",
    errorUnexpected: "Unexpected error",
    cardComparison: "Card Comparison",
    uploadedImage: "Uploaded Image",
    officialCard: "Official Card",
    noOfficialImage: "No official image found",
    identifiedCard: "Identified Card",
    conditionReport: (cond: string) => `Condition Report: ${cond}`,
    marketPricing: (currency: string) => `Market Pricing (${currency})`,
    priceLow: "Low",
    priceAverage: "Average",
    priceHigh: "High",
    salesSectionTitle: "Sales",
    salesSectionDesc: "Here you can list your cards for sale.",
    switchLang: "🇸🇪 SV",
    switchLangLabel: "Switch to Swedish",
  },
} satisfies Record<Lang, object>;

// Empty string means same-origin; in dev the Vite proxy forwards /analyze-card to localhost:8000.
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

function safeImageUrl(url: string, allowedProtocols: string[]): string | null {
  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

export default function CardScanner() {
  const [lang, setLang] = useState<Lang>(() => (navigator.language?.startsWith("sv") ? "sv" : "en"));
  const t = TRANSLATIONS[lang];
  const [activeSection, setActiveSection] = useState<"landing" | "valuation" | "sales">("landing");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<AnalyzeCardResponse | null>(null);
  const pageTitle = t.pageTitles[activeSection];

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
      setError(t.errorUnsupportedFormat);
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
      setError(t.errorNoFile);
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
        throw new Error(t.errorFailedAnalysis);
      }

      const payload = (await response.json()) as AnalyzeCardResponse;
      setResult(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.errorUnexpected;
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
          {activeSection === "landing" && <p className="mt-2 text-fuchsia-100/80">{t.subtitleLanding}</p>}
          {activeSection === "valuation" && <p className="mt-2 text-fuchsia-100/80">{t.subtitleValuation}</p>}
          {activeSection === "sales" && <p className="mt-2 text-fuchsia-100/80">{t.subtitleSales}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setLang((l) => (l === "sv" ? "en" : "sv"))}
            aria-label={t.switchLangLabel}
            className="rounded-xl border border-pink-300/40 bg-white/[0.06] px-4 py-2 text-sm font-medium text-pink-100 transition-colors hover:bg-white/[0.12]"
          >
            {t.switchLang}
          </button>
          {activeSection !== "landing" && (
            <button
              onClick={() => setActiveSection("landing")}
              aria-label={t.backToHome}
              className="rounded-xl border border-pink-300/40 bg-white/[0.06] px-4 py-2 text-sm font-medium text-pink-100 transition-colors hover:bg-white/[0.12]"
            >
              {t.backToHome}
            </button>
          )}
        </div>
      </div>

      {activeSection === "landing" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setActiveSection("valuation")}
            aria-label={t.goToValuation}
            className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-6 text-left shadow-[0_0_35px_rgba(236,72,153,0.16)] transition-all duration-300 hover:shadow-[0_0_55px_rgba(236,72,153,0.3)]"
          >
            <h2 className="text-xl font-semibold">{t.valuationTitle}</h2>
            <p className="mt-2 text-sm text-fuchsia-100/80">{t.valuationDesc}</p>
          </button>
          <button
            onClick={() => setActiveSection("sales")}
            aria-label={t.goToSales}
            className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-6 text-left shadow-[0_0_35px_rgba(236,72,153,0.16)] transition-all duration-300 hover:shadow-[0_0_55px_rgba(236,72,153,0.3)]"
          >
            <h2 className="text-xl font-semibold">{t.salesTitle}</h2>
            <p className="mt-2 text-sm text-fuchsia-100/80">{t.salesDesc}</p>
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
              {t.uploadLabel}
            </label>
            {file && <p className="mt-3 text-sm text-fuchsia-100/70">{t.selectedFile(file.name)}</p>}
            <button
              onClick={onAnalyze}
              disabled={loading || !file}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 px-6 py-2 font-semibold text-slate-950 shadow-[0_0_30px_rgba(236,72,153,0.4)] transition-all duration-300 motion-safe:hover:scale-[1.02] hover:shadow-[0_0_45px_rgba(236,72,153,0.65)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? t.analyzingBtn : t.analyzeBtn}
            </button>
          </div>

          {error && <div className="mt-4 rounded-xl border border-rose-300/30 bg-rose-500/20 p-3 text-rose-100">{error}</div>}

          {hasResult && result && (
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-4 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md transition-all duration-300 hover:shadow-[0_0_55px_rgba(236,72,153,0.3)]">
                <h2 className="mb-3 text-xl font-semibold">{t.cardComparison}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm text-fuchsia-100/70">{t.uploadedImage}</p>
                    {safePreviewUrl ? (
                      <img
                        src={safePreviewUrl}
                        alt="Uploaded card"
                        className="h-auto w-full rounded-xl border border-pink-300/20 shadow-[0_0_25px_rgba(236,72,153,0.2)] transition-transform duration-300 motion-safe:hover:scale-[1.01]"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-fuchsia-100/70">{t.officialCard}</p>
                    {safeOfficialImageUrl ? (
                      <img
                        src={safeOfficialImageUrl}
                        alt={result.name}
                        className="h-auto w-full rounded-xl border border-pink-300/20 shadow-[0_0_25px_rgba(236,72,153,0.2)] transition-transform duration-300 motion-safe:hover:scale-[1.01]"
                      />
                    ) : (
                      <div className="rounded-xl border border-pink-300/20 bg-white/[0.03] p-4 text-sm text-fuchsia-100/70">
                        {t.noOfficialImage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-4 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md">
                  <h2 className="mb-2 text-xl font-semibold">{t.identifiedCard}</h2>
                  <p>{result.name}</p>
                  <p className="text-fuchsia-100/70">{result.set} • #{result.number}</p>
                  <span className="mt-3 inline-block rounded-full border border-pink-200/30 bg-pink-500/20 px-3 py-1 text-sm font-medium text-pink-100 shadow-[0_0_20px_rgba(244,114,182,0.35)]">
                    {t.conditionReport(result.detected_condition)}
                  </span>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fuchsia-100/80">
                    {result.condition_notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-fuchsia-300/20 bg-white/[0.05] p-4 shadow-[0_0_35px_rgba(236,72,153,0.16)] backdrop-blur-md">
                  <h2 className="mb-3 text-xl font-semibold">{t.marketPricing(result.prices.currency)}</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[18rem] table-auto text-left">
                      <thead>
                        <tr className="text-fuchsia-100/70">
                          <th className="pb-2">{t.priceLow}</th>
                          <th className="pb-2">{t.priceAverage}</th>
                          <th className="pb-2">{t.priceHigh}</th>
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
          <h2 className="text-2xl font-semibold">{t.salesSectionTitle}</h2>
          <p className="mt-2 text-fuchsia-100/80">{t.salesSectionDesc}</p>
        </div>
      )}
    </div>
  );
}
