"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface TickerOption {
  symbol: string;
  name: string;
  color: string;
  /** Short right-aligned detail, e.g. the latest close. */
  detail?: string;
  /** Secondary detail, e.g. the daily change; `detailUp` picks its colour. */
  subDetail?: string;
  detailUp?: boolean;
}

interface Props {
  options: TickerOption[];
  value: string;
  onChange: (symbol: string) => void;
}

// Clickable ticker label (top-left of the chart) that opens a listbox with the
// other symbols — the TradingView "symbol search" affordance, simplified to a
// fixed list. Implements the WAI-ARIA select-only combobox pattern: focus stays
// on the button, the highlighted option is exposed via aria-activedescendant.
// Keyboard: Enter/Space/ArrowDown open, arrows move, Enter picks, Escape
// closes; clicking outside closes.
export default function TickerSelect({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const current = options.find((o) => o.symbol === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openList() {
    setActiveIndex(Math.max(0, options.findIndex((o) => o.symbol === value)));
    setOpen(true);
  }

  function select(symbol: string) {
    onChange(symbol);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        select(options[activeIndex].symbol);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label="Symbol"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-${options[activeIndex].symbol}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        className="flex items-center gap-2 rounded-lg border border-[#e3e5e9] bg-white px-2.5 py-1.5 text-left hover:bg-[#f5f6f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: current.color }} aria-hidden />
        <span className="text-[17px] font-semibold leading-none text-[#1a1d24]">{current.symbol}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          className={`text-[#6b7280] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Symbols"
          className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-[#e3e5e9] bg-white py-1 shadow-lg"
        >
          {options.map((o, i) => {
            const selected = o.symbol === value;
            const active = i === activeIndex;
            return (
              <li
                key={o.symbol}
                id={`${listboxId}-${o.symbol}`}
                role="option"
                aria-selected={selected}
                onClick={() => select(o.symbol)}
                onPointerMove={() => setActiveIndex(i)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${
                  active ? "bg-[#e8effd]" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[#1a1d24]">{o.symbol}</span>
                  <span className="block truncate text-[11px] text-[#6b7280]">{o.name}</span>
                </span>
                {(o.detail || o.subDetail) && (
                  <span className="text-right font-mono text-[11px]">
                    {o.detail && <span className="block text-[#1a1d24]">{o.detail}</span>}
                    {o.subDetail && (
                      <span className={`block ${o.detailUp === false ? "text-[#dc2626]" : "text-[#16a34a]"}`}>
                        {o.subDetail}
                      </span>
                    )}
                  </span>
                )}
                <span className="w-3 text-[#2563eb]" aria-hidden>
                  {selected ? "✓" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
