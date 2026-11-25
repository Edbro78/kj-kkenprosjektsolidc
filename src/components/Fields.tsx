import { useEffect, useState } from 'react';

/** Tallfelt som lagrer ved Enter/forlat felt, slik at halvferdige tall ikke slår inn. */
export function NumberField(props: {
  label?: string;
  value: number;
  onChange(v: number): void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(Math.round(props.value * 10) / 10)), [props.value]);
  const commit = () => {
    let v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v)) { setText(String(props.value)); return; }
    if (props.min !== undefined) v = Math.max(props.min, v);
    if (props.max !== undefined) v = Math.min(props.max, v);
    setText(String(v));
    if (v !== props.value) props.onChange(v);
  };
  const input = (
    <span className="num">
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {props.unit && <em>{props.unit}</em>}
    </span>
  );
  if (!props.label) return input;
  return (
    <label className="field">
      <span>{props.label}</span>
      {input}
    </label>
  );
}

/** Glidebryter + tallfelt for parametere med grenser. */
export function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange(v: number): void;
}) {
  return (
    <div className="field range">
      <div className="range-head">
        <span>{props.label}</span>
        <NumberField value={props.value} min={props.min} max={props.max} unit={props.unit} onChange={props.onChange} />
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}
