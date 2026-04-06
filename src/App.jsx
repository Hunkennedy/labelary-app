import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_TEMPLATE = `^XA
^PR6,6,6^FS
^LRY
^LH10,25
^FO10,10^GB750,1160,10^FS
^FO480,05^A0R,250,180^FD 229/26^FS
^FO250,05^A0R,250,180^FD {SERIAL}^FS
^FO270,700^BQN,2,10,M^FDMM,{QR_PREFIX}{SERIAL}^FS
^FO140,655^GB105,495,90^FS
^FO140,700^A0R,80,80^FDCODE: 4001A^FS
^FO20,60^GB110,1090,90^FS
^FO50,70^A0R,50,50^FB1185,1,C^FH^FDRNE: 23001663 - To keep frozen at - 18_a7C\&^FS
^XZ`;

const API_BASE = "https://api.labelary.com/v1/printers";
const DEFAULT_LOT = "229/26";

function padSerial(value) {
  return String(value).padStart(4, "0");
}

function clampCount(value, maxCount = 32) {
  const number = Number(value) || 1;
  return Math.min(maxCount, Math.max(1, number));
}

function extractLotFromQrPrefix(qrPrefix) {
  const prefix = String(qrPrefix || "");
  // Format expected: A + 18 chars material + 10 chars lot
  if (prefix.length <= 19) return DEFAULT_LOT;
  const lot = prefix.slice(19, 29);
  return lot.trim() ? lot : DEFAULT_LOT;
}

function buildSingleZpl({ template, qrPrefix, serial }) {
  const lot = extractLotFromQrPrefix(qrPrefix);
  let zpl = template
    .replaceAll("{SERIAL}", serial)
    .replaceAll("{QR_PREFIX}", qrPrefix)
    .replaceAll("{LOT}", lot);

  // Backward compatibility for templates that still have a fixed lot line.
  if (!template.includes("{LOT}")) {
    zpl = zpl.replace(
      /\^FO480,05\^A0R,250,180\^FD[^\^]*\^FS/,
      `^FO480,05^A0R,250,180^FD ${lot}^FS`,
    );
  }

  return zpl;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Icons (inline SVG, no emoji)
function IconChevronLeft() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function IconChevronDown({ open }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transition: "transform 200ms", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function IconLabel() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

// Main App
export default function App() {
  const [dpmm, setDpmm] = useState(8);
  const [width, setWidth] = useState(4);
  const [height, setHeight] = useState(6);
  const [count, setCount] = useState(32);
  const [startAt, setStartAt] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [qrPrefix, setQrPrefix] = useState("A000000000000510433229/26    ");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [sendCounter, setSendCounter] = useState(true);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selectedCardRef = useRef(null);

  const effectiveMaxCount = sendCounter ? 32 : 1;
  const safeCount = useMemo(() => clampCount(count, effectiveMaxCount), [count, effectiveMaxCount]);
  const safeStart = useMemo(() => Math.max(1, Number(startAt) || 1), [startAt]);

  const labels = useMemo(() => {
    return Array.from({ length: safeCount }, (_, index) => {
      const current = safeStart + index;
      const serial = padSerial(current);
      const serialForZpl = sendCounter ? serial : "";
      return {
        index,
        value: current,
        serial,
        zpl: buildSingleZpl({ template, qrPrefix, serial: serialForZpl }),
      };
    });
  }, [qrPrefix, safeCount, safeStart, sendCounter, template]);

  const mergedZpl = useMemo(() => labels.map((item) => item.zpl).join("\n"), [labels]);

  const buildMergedZplForPrefix = useCallback((prefixValue) => {
    return Array.from({ length: safeCount }, (_, index) => {
      const current = safeStart + index;
      const serial = padSerial(current);
      const serialForZpl = sendCounter ? serial : "";
      return buildSingleZpl({ template, qrPrefix: prefixValue, serial: serialForZpl });
    }).join("\n");
  }, [safeCount, safeStart, sendCounter, template]);

  const previewLabel = useCallback(async (index, zplBody = mergedZpl) => {
    const safeIdx = Math.max(0, Math.min(labels.length - 1, index));
    try {
      setIsLoadingPreview(true);
      setError("");
      setSelectedIndex(safeIdx);

      const url = `${API_BASE}/${dpmm}dpmm/labels/${width}x${height}/${safeIdx}/`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "image/png",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: zplBody,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo generar la previsualizacion.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return objectUrl;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsLoadingPreview(false);
    }
  }, [dpmm, width, height, mergedZpl, labels.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        previewLabel(selectedIndex - 1);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        previewLabel(selectedIndex + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIndex, previewLabel]);

  // Scroll selected card into view
  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    if (!sendCounter) {
      setCount(1);
      setSelectedIndex(0);
    }
  }, [sendCounter]);

  const downloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      setError("");
      const url = `${API_BASE}/${dpmm}dpmm/labels/${width}x${height}/`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/pdf",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: mergedZpl,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "No se pudo generar el PDF.");
      }
      const blob = await response.blob();
      downloadBlob(blob, `etiquetas_${labels[0]?.serial ?? "0001"}_a_${labels.at(-1)?.serial ?? "0001"}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const downloadZpl = () => {
    const blob = new Blob([mergedZpl], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `etiquetas_${labels[0]?.serial ?? "0001"}_a_${labels.at(-1)?.serial ?? "0001"}.zpl`);
  };

  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < labels.length - 1;

  const handleQrPrefixKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextPrefix = e.currentTarget.value;
      setQrPrefix(nextPrefix);
      previewLabel(selectedIndex, buildMergedZplForPrefix(nextPrefix));
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: "#0b1120",
        color: "#e2e8f0",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-4 px-6 py-3 border-b"
        style={{ background: "#0f172a", borderColor: "#1e2d4a" }}
      >
        <div className="flex items-center gap-2" style={{ color: "#818cf8" }}>
          <IconLabel />
          <span className="font-semibold text-base" style={{ color: "#e2e8f0" }}>
            Generador de Etiquetas
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span className="text-xs px-3 py-1 rounded-full" style={{ background: "#450a0a", color: "#fca5a5" }}>
              {error}
            </span>
          )}
          <button
            onClick={downloadZpl}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
            style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", transition: "background 150ms" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#293548")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#1e293b")}
          >
            <IconDownload />
            ZPL
          </button>
          <button
            onClick={downloadPdf}
            disabled={isDownloadingPdf}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#4f46e5", color: "#fff", border: "none", transition: "background 150ms" }}
            onMouseEnter={(e) => { if (!isDownloadingPdf) e.currentTarget.style.background = "#4338ca"; }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#4f46e5")}
          >
            <IconDownload />
            {isDownloadingPdf ? "Generando..." : "Descargar PDF"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Sidebar: Configuracion */}
        <aside
          className="flex flex-col gap-0 overflow-y-auto shrink-0"
          style={{
            width: 320,
            background: "#0f172a",
            borderRight: "1px solid #1e2d4a",
            padding: "20px 16px",
            gap: 16,
          }}
        >
          <Section title="Rango de serie">
            <Field label="Prefijo QR">
              <input
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                value={qrPrefix}
                onChange={(e) => setQrPrefix(e.target.value)}
                onKeyDown={handleQrPrefixKeyDown}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Desde">
                <input
                  type="number" min="1"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </Field>
              <Field label={`Cantidad (max ${effectiveMaxCount})`}>
                <input
                  type="number" min="1" max={effectiveMaxCount}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={!sendCounter}
                />
              </Field>
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: "#94a3b8" }}>
              <input
                type="checkbox"
                checked={sendCounter}
                onChange={(e) => setSendCounter(e.target.checked)}
              />
              Enviar contador
            </label>
          </Section>

          {/* Advanced collapsible */}
          <div style={{ borderTop: "1px solid #1e2d4a", paddingTop: 12 }}>
            <button
              className="flex items-center justify-between w-full text-sm font-medium cursor-pointer"
              style={{ color: "#94a3b8", background: "none", border: "none", padding: "4px 0" }}
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              <span>Configuracion avanzada</span>
              <IconChevronDown open={advancedOpen} />
            </button>

            {advancedOpen && (
              <div className="mt-3 flex flex-col" style={{ gap: 12 }}>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="dpmm">
                    <input
                      type="number" min="6"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={inputStyle}
                      value={dpmm}
                      onChange={(e) => setDpmm(e.target.value)}
                    />
                  </Field>
                  <Field label="Ancho">
                    <input
                      type="number" step="0.1"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={inputStyle}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                    />
                  </Field>
                  <Field label="Alto">
                    <input
                      type="number" step="0.1"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={inputStyle}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Template ZPL">
                  <textarea
                    rows={14}
                    className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-y"
                    style={{ ...inputStyle, fontFamily: "'JetBrains Mono', ui-monospace, monospace", lineHeight: 1.6 }}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                  />
                  <p className="text-xs mt-1" style={{ color: "#475569" }}>
                    Usa <code style={{ color: "#818cf8" }}>{"{SERIAL}"}</code> y{" "}
                    <code style={{ color: "#818cf8" }}>{"{QR_PREFIX}"}</code> como variables.
                  </p>
                </Field>
              </div>
            )}
          </div>

          {/* Keyboard hint */}
          <p className="text-xs mt-auto pt-4" style={{ color: "#334155" }}>
            Tip: usa izquierda y derecha para navegar entre etiquetas
          </p>
        </aside>

        {/* Center: Preview */}
        <main className="flex flex-col flex-1 overflow-hidden" style={{ padding: 24, gap: 16, minWidth: 0 }}>
          {/* Preview card */}
          <div
            className="flex flex-col rounded-xl flex-1"
            style={{ background: "#0f172a", border: "1px solid #1e2d4a", overflow: "hidden", minHeight: 0 }}
          >
            {/* Preview toolbar */}
            <div
              className="flex items-center justify-between px-5 py-3 shrink-0"
              style={{ borderBottom: "1px solid #1e2d4a" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: "#94a3b8" }}>
                  Etiqueta
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: "#818cf8", fontFamily: "'JetBrains Mono', monospace", minWidth: 48 }}
                >
                  {labels[selectedIndex]?.serial ?? "-"}
                </span>
                <span className="text-xs" style={{ color: "#334155" }}>
                  {selectedIndex + 1} / {labels.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <NavButton
                  label="Etiqueta anterior"
                  disabled={!canGoPrev || isLoadingPreview}
                  onClick={() => previewLabel(selectedIndex - 1)}
                >
                  <IconChevronLeft />
                </NavButton>
                <button
                  onClick={() => previewLabel(selectedIndex)}
                  disabled={isLoadingPreview}
                  title="Actualizar preview"
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#4f46e5", color: "#fff", border: "none", transition: "background 150ms" }}
                  onMouseEnter={(e) => { if (!isLoadingPreview) e.currentTarget.style.background = "#4338ca"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#4f46e5")}
                >
                  <IconRefresh />
                  {isLoadingPreview ? "Generando..." : "Preview"}
                </button>
                <NavButton
                  label="Etiqueta siguiente"
                  disabled={!canGoNext || isLoadingPreview}
                  onClick={() => previewLabel(selectedIndex + 1)}
                >
                  <IconChevronRight />
                </NavButton>
              </div>
            </div>

            {/* Preview image */}
            <div
              className="flex flex-1 items-center justify-center"
              style={{ background: "#0b1120", overflow: "hidden", minHeight: 0 }}
            >
              {isLoadingPreview ? (
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="rounded-full"
                    style={{
                      width: 40, height: 40,
                      border: "3px solid #1e2d4a",
                      borderTopColor: "#818cf8",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span className="text-sm" style={{ color: "#475569" }}>Generando previsualizacion...</span>
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`Preview etiqueta ${labels[selectedIndex]?.serial}`}
                  className="rounded-lg"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 select-none" style={{ color: "#1e2d4a" }}>
                  <IconLabel />
                  <span className="text-sm" style={{ color: "#334155" }}>
                    Presiona Preview para ver la etiqueta
                  </span>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right: Serie de etiquetas */}
        <aside
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 240,
            borderLeft: "1px solid #1e2d4a",
            background: "#0f172a",
          }}
        >
          <div
            className="px-4 py-3 shrink-0 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "#475569", borderBottom: "1px solid #1e2d4a" }}
          >
            Serie - {safeCount} etiquetas
          </div>
          <div className="flex flex-col overflow-y-auto flex-1" style={{ gap: 2, padding: "8px 8px" }}>
            {labels.map((label) => {
              const isSelected = label.index === selectedIndex;
              return (
                <button
                  key={label.serial}
                  ref={isSelected ? selectedCardRef : null}
                  onClick={() => previewLabel(label.index)}
                  className="rounded-lg text-left cursor-pointer w-full"
                  style={{
                    padding: "10px 12px",
                    background: isSelected ? "#1e1b4b" : "transparent",
                    border: `1px solid ${isSelected ? "#4f46e5" : "transparent"}`,
                    transition: "background 120ms, border-color 120ms",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "#131f35";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = "0 0 0 2px #4f46e5";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  aria-pressed={isSelected}
                  aria-label={`Etiqueta ${label.serial}`}
                >
                  <div className="text-xs mb-1" style={{ color: isSelected ? "#818cf8" : "#475569" }}>
                    #{label.index + 1}
                  </div>
                  <div
                    className="text-base font-bold"
                    style={{
                      color: isSelected ? "#a5b4fc" : "#94a3b8",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {label.serial}
                  </div>
                  <div
                    className="text-xs mt-1 truncate"
                    style={{ color: isSelected ? "#4f46e5" : "#1e2d4a", maxWidth: "100%" }}
                  >
                    {sendCounter ? `${qrPrefix}${label.serial}` : qrPrefix}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// Sub-components
function Section({ title, children }) {
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col" style={{ gap: 5 }}>
      <span className="text-xs font-medium" style={{ color: "#64748b" }}>{label}</span>
      {children}
    </label>
  );
}

function NavButton({ label, disabled, onClick, children }) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        width: 36, height: 36,
        background: "#1e293b",
        color: "#94a3b8",
        border: "1px solid #334155",
        transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "#293548"; e.currentTarget.style.color = "#e2e8f0"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  background: "#0b1120",
  color: "#e2e8f0",
  border: "1px solid #1e2d4a",
  transition: "border-color 150ms",
  outline: "none",
};
