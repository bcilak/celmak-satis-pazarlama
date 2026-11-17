import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { customerTagLabels, money, type Customer } from "./types";

const fold = (value: string) => value.toLocaleLowerCase("tr-TR");

/**
 * Aramalı cari seçimi: ad, cari kodu, il/ilçe veya telefonla süzer.
 * Ok tuşlarıyla gezilir, Enter ile seçilir, Esc ile kapanır.
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  required,
  placeholder = "Cari adı, kodu, il veya telefon yazın…",
}: {
  customers: Customer[];
  value: number;
  onChange: (id: number) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = customers.find((c) => c.id === value);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = (words.length
    ? customers.filter((c) => {
        const haystack = fold([c.name, c.code, c.city, c.district, c.phone, c.taxNumber].filter(Boolean).join(" "));
        return words.every((w) => haystack.includes(w));
      })
    : customers
  ).slice(0, 50);

  const choose = (customer: Customer) => {
    onChange(customer.id);
    setQuery("");
    setOpen(false);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter" && open && matches[active]) { event.preventDefault(); choose(matches[active]); }
    else if (event.key === "Escape") { setOpen(false); setQuery(""); }
  };
  const tags = (c: Customer) => (c.tags || "").split(",").filter(Boolean).map((t) => customerTagLabels[t] || t).join(", ");

  return (
    <div className="customer-picker">
      <div className={`customer-picker-box ${open ? "open" : ""}`}>
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
          value={open ? query : selected ? `${selected.name} · ${selected.code}` : query}
          placeholder={placeholder}
          // Boş seçimle form gönderilmesin: seçili cari yoksa tarayıcı zorunlu alan uyarısı verir.
          required={required && !selected}
          onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKey}
          autoComplete="off"
        />
        {selected && !open && (
          <button type="button" className="customer-picker-clear" aria-label="Cari seçimini kaldır" onClick={() => { onChange(0); inputRef.current?.focus(); }}><X /></button>
        )}
      </div>
      {open && (
        <ul className="customer-picker-list" id={listId} role="listbox">
          {matches.map((c, index) => (
            <li
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }}
              onMouseEnter={() => setActive(index)}
            >
              <span><b>{c.name}</b><small>{[c.code, [c.district, c.city].filter(Boolean).join(" / "), tags(c)].filter(Boolean).join(" · ")}</small></span>
              <em className={c.balance > 0.01 ? "debt" : c.balance < -0.01 ? "credit" : ""}>{c.balance > 0.01 ? `Borç ${money(c.balance)}` : c.balance < -0.01 ? `Avans ${money(-c.balance)}` : "Bakiye yok"}</em>
            </li>
          ))}
          {!matches.length && <li className="empty">“{query}” ile eşleşen cari yok.</li>}
          {!words.length && customers.length > 50 && <li className="empty">İlk 50 cari gösteriliyor; daraltmak için yazmaya başlayın.</li>}
        </ul>
      )}
    </div>
  );
}
