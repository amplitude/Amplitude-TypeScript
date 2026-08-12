import React from 'react';
// Prism's default build already registers the javascript and markup grammars, so only the shell one the
// extension's setup commands are shown in has to be pulled in.
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import './syntax-theme.css';

const styles = {
  field: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  label: { fontWeight: 600 },
  // Signals that the label carries a tooltip drawn from the SDK's own JSDoc.
  documentedLabel: {
    cursor: 'help',
    textDecoration: 'underline dotted',
    textDecorationColor: '#bbb',
    textUnderlineOffset: 3,
  },
  textInput: { width: 360, maxWidth: '100%', padding: '6px 8px', font: 'inherit' },
  // Monospace so escapes and character classes stay legible while typing a pattern.
  textarea: {
    width: 360,
    maxWidth: '100%',
    padding: '6px 8px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    resize: 'vertical',
  },
  select: { padding: '5px 8px', font: 'inherit' },
  inlineCheckbox: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  hint: { color: '#888', fontSize: 12 },
  subGroup: { padding: '0 0 0 16px', borderLeft: '2px solid #e2e2e2', margin: '0 0 12px 4px' },
  subGroupTitle: { fontSize: 12, color: '#666', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.4 },
  // flex: none so a long note beside a button in a toolbar row can't squeeze its label onto two lines.
  button: { font: 'inherit', fontSize: 13, padding: '4px 10px', cursor: 'pointer', flex: 'none' },
  disabledButton: { cursor: 'not-allowed', color: '#999' },
  // Takes the button's place as the flex item, so wrapping one changes nothing about the row.
  buttonTooltip: { display: 'inline-flex', flex: 'none' },
  card: { border: '1px solid #ddd', borderRadius: 6, background: '#fff', padding: '10px 12px 2px', marginBottom: 10 },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 13, fontWeight: 600, margin: 0 },
  note: { color: '#888', fontSize: 12, margin: '0 0 8px' },
  panel: {
    border: '1px solid #ddd',
    borderRadius: 6,
    background: '#fafafa',
    marginBottom: 12,
  },
  panelSummary: { cursor: 'pointer', padding: '10px 16px', fontSize: 14, fontWeight: 600 },
  panelBody: { padding: '4px 16px 4px' },
  panelBadge: { marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#666' },
  panelDescription: { color: '#666', fontSize: 12, margin: '0 0 12px' },
  pre: {
    background: '#1e1e2e',
    color: '#e6e6f0',
    margin: 0,
    padding: 16,
    borderRadius: 6,
    overflowX: 'auto',
    fontSize: 13,
    lineHeight: 1.5,
  },
};

// Row layout shared by every control: label on the same line as the input it points at. Pass
// labelWidth to line up the inputs of a stacked group of fields.
export function Field({ id, label, labelWidth, description, children }) {
  const labelStyle = {
    ...styles.label,
    ...(labelWidth ? { width: labelWidth, flex: 'none' } : null),
    ...(description ? styles.documentedLabel : null),
  };
  return (
    <div style={styles.field}>
      <label htmlFor={id} style={labelStyle} title={description}>
        {label}
      </label>
      {children}
    </div>
  );
}

// The onChange props below hand back the value rather than the event, so call sites can pass a
// setState function directly.
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  labelWidth,
  type = 'text',
  width,
  hint,
  description,
}) {
  return (
    <Field id={id} label={label} labelWidth={labelWidth} description={description}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={width ? { ...styles.textInput, width } : styles.textInput}
      />
      {hint ? <span style={styles.hint}>{hint}</span> : null}
    </Field>
  );
}

// For config fields the blank first choice leaves the key out of the generated config entirely; pass
// allowUnset={false} for a select where every choice is a real value.
export function SelectField({ id, label, value, onChange, choices, labelWidth, hint, description, allowUnset = true }) {
  return (
    <Field id={id} label={label} labelWidth={labelWidth} description={description}>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} style={styles.select}>
        {allowUnset ? <option value="">(unset)</option> : null}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {hint ? <span style={styles.hint}>{hint}</span> : null}
    </Field>
  );
}

export function TextareaField({ id, label, value, onChange, placeholder, labelWidth, rows = 2, hint, description }) {
  return (
    <Field id={id} label={label} labelWidth={labelWidth} description={description}>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        style={styles.textarea}
      />
      {hint ? <span style={styles.hint}>{hint}</span> : null}
    </Field>
  );
}

// An option typed `(string | RegExp)[]`. Exact values and patterns are collected separately because
// only the patterns become regex literals, then the two are merged into a single array.
export function RegexListField({ id, label, regexLabel, description, hint, labelWidth, value = {}, onChange }) {
  return (
    <>
      <TextField
        id={id}
        label={label}
        hint={hint}
        description={description}
        labelWidth={labelWidth}
        value={value.list}
        onChange={(list) => onChange({ ...value, list })}
        placeholder="comma-separated"
      />
      <TextareaField
        id={`${id}-regexes`}
        label={regexLabel ?? `${label} regexes`}
        hint="one per line"
        description={`Regular expressions, one per line, merged into the same ${label.toLowerCase()} array as the exact values above and emitted as /pattern/ literals.`}
        labelWidth={labelWidth}
        value={value.regexes}
        onChange={(regexes) => onChange({ ...value, regexes })}
        placeholder={'\\.example\\.com$'}
      />
    </>
  );
}

export function SubGroup({ title, description, children }) {
  return (
    <div style={styles.subGroup}>
      {title ? (
        <p
          style={description ? { ...styles.subGroupTitle, ...styles.documentedLabel } : styles.subGroupTitle}
          title={description}
        >
          {title}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function CheckboxField({ id, label, checked, onChange, labelWidth, hint, description }) {
  return (
    <Field id={id} label={label} labelWidth={labelWidth} description={description}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {hint ? <span style={styles.hint}>{hint}</span> : null}
    </Field>
  );
}

// Several checkboxes on one row under a single label, for a set that reads as one choice rather than as
// unrelated switches. `role` and `aria-labelledby` stand in for a fieldset and legend, whose default
// rendering doesn't match the label-and-control rows around it.
export function CheckboxGroup({ id, label, labelWidth, description, options, values, onChange }) {
  const labelStyle = {
    ...styles.label,
    ...(labelWidth ? { width: labelWidth, flex: 'none' } : null),
    ...(description ? styles.documentedLabel : null),
  };
  return (
    <div style={{ ...styles.field, gap: 16 }} role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} style={labelStyle} title={description}>
        {label}
      </span>
      {options.map((option) => (
        <label
          key={option.key}
          htmlFor={`${id}-${option.key}`}
          // The whole row is clickable, so the tooltip's dotted underline comes without the help cursor
          // the labels above carry.
          style={{
            ...(option.description ? styles.documentedLabel : null),
            ...styles.inlineCheckbox,
            ...(option.required ? { cursor: 'default' } : null),
          }}
          title={option.description}
        >
          {/* A required option is part of the set whichever others are picked, so it reads as checked
              and holds no value of its own. */}
          <input
            id={`${id}-${option.key}`}
            type="checkbox"
            checked={option.required || values[option.key]}
            disabled={option.required}
            onChange={(event) => onChange(option.key, event.target.checked)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

// Left uncontrolled so the browser owns the open/closed state; the panel re-renders on every
// keystroke elsewhere on the page and a controlled `open` would fight that.
export function Panel({ title, description, badge, defaultOpen = false, children }) {
  return (
    <details style={styles.panel} open={defaultOpen}>
      <summary style={styles.panelSummary}>
        {title}
        {badge ? <span style={styles.panelBadge}>{badge}</span> : null}
      </summary>
      <div style={styles.panelBody}>
        {description ? <p style={styles.panelDescription}>{description}</p> : null}
        {children}
      </div>
    </details>
  );
}

// A disabled button raises no hover events, so a `title` on it wouldn't reliably become a tooltip. The
// title goes on a wrapper that isn't disabled instead, which is the only reason one is rendered.
export function Button({ onClick, children, disabled = false, title }) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { ...styles.button, ...styles.disabledButton } : styles.button}
    >
      {children}
    </button>
  );
  return title ? (
    <span title={title} style={styles.buttonTooltip}>
      {button}
    </span>
  ) : (
    button
  );
}

export function Note({ children }) {
  return <p style={styles.note}>{children}</p>;
}

export function Card({ title, action, children }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <p style={styles.cardTitle}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

// Prism escapes the source while tokenising, so its output is safe to inject.
export function CodeBlock({ code, language = 'javascript', maxHeight }) {
  const highlighted = Prism.highlight(code, Prism.languages[language], language);
  return (
    <pre style={maxHeight ? { ...styles.pre, maxHeight, overflowY: 'auto' } : styles.pre}>
      <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}
