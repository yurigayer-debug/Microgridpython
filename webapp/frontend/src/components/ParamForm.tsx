import { useState } from "react";
import type { FieldSpec, GroupSpec, Values } from "../api";

interface Props {
  grupos: GroupSpec[];
  values: Values;
  onChange: (group: string, name: string, value: unknown) => void;
}

function Field({ group, f, value, onChange }:
  { group: string; f: FieldSpec; value: unknown; onChange: Props["onChange"] }) {
  const set = (v: unknown) => onChange(group, f.name, v);
  const title = f.sam ? `PySAM: ${f.sam}` : undefined;
  if (f.type === "bool") {
    return (
      <label className="field check" title={title}>
        <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />
        <span>{f.title}</span>
        {f.help && <small>{f.help}</small>}
      </label>
    );
  }
  let input;
  if (f.type === "select") {
    input = (
      <select value={String(value)} onChange={(e) => set(e.target.value)}>
        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (f.type === "text") {
    input = <input type="text" value={String(value ?? "")} onChange={(e) => set(e.target.value)} />;
  } else {
    input = (
      <input type="number" step={f.type === "int" ? 1 : "any"} min={f.ge ?? f.gt} max={f.le ?? f.lt}
        value={value === null || value === undefined || Number.isNaN(value) ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          set(raw === "" ? NaN : f.type === "int" ? parseInt(raw, 10) : parseFloat(raw));
        }} />
    );
  }
  return (
    <label className="field" title={title}>
      <span>{f.title}{f.unit && <i>{f.unit}</i>}</span>
      {input}
      {f.help && <small>{f.help}</small>}
    </label>
  );
}

export function ParamForm({ grupos, values, onChange }: Props) {
  const [tab, setTab] = useState(grupos[0]?.key ?? "");
  const g = grupos.find((x) => x.key === tab) ?? grupos[0];
  return (
    <>
      <nav className="tabs">
        {grupos.map((x) => (
          <button key={x.key} type="button" className={x.key === tab ? "on" : ""} onClick={() => setTab(x.key)}>
            {x.title}
          </button>
        ))}
      </nav>
      {g && (
        <div className="fieldset on">
          {g.fields.map((f) => (
            <Field key={f.name} group={g.key} f={f} value={values[g.key]?.[f.name]} onChange={onChange} />
          ))}
        </div>
      )}
    </>
  );
}

export function Validation({ msgs }: { msgs: { nivel: string; texto: string }[] }) {
  if (!msgs.length) return null;
  return (
    <div className="validacao">
      {msgs.map((m, i) => (
        <div key={i} className={`msg ${m.nivel}`}>
          <span className="tag">{m.nivel === "ok" ? "✓ OK" : m.nivel === "alerta" ? "! ALERTA" : "✕ ERRO"}</span>
          {m.texto}
        </div>
      ))}
    </div>
  );
}
