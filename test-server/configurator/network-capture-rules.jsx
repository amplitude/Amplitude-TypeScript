import React from 'react';
import { Button, Card, Note, RegexListField, SelectField, SubGroup, TextField } from './components.jsx';
import { BODY_RULE_DESCRIPTIONS, CAPTURE_RULE_FIELDS, createCaptureRule } from './autocapture-options.js';

const RULE_LABEL_WIDTH = 160;

const HEADER_CHOICES = [
  { value: 'true', label: 'true (safe headers)' },
  { value: 'false', label: 'false' },
  { value: 'custom', label: 'custom list' },
];

// requestHeaders/responseHeaders accept `string[] | boolean`, so the list input only appears once
// "custom list" is picked.
function HeadersField({ id, label, hint, description, value, onChange }) {
  return (
    <>
      <SelectField
        id={id}
        label={label}
        hint={hint}
        description={description}
        labelWidth={RULE_LABEL_WIDTH}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        choices={HEADER_CHOICES}
      />
      {value.mode === 'custom' ? (
        <TextField
          id={`${id}-list`}
          label="Header names"
          labelWidth={RULE_LABEL_WIDTH}
          value={value.list}
          onChange={(list) => onChange({ ...value, list })}
          placeholder="comma-separated"
        />
      ) : null}
    </>
  );
}

function BodyRuleField({ id, label, description, value, onChange }) {
  return (
    <SubGroup title={label} description={description}>
      <TextField
        id={`${id}-allowlist`}
        label="Allowlist"
        labelWidth={RULE_LABEL_WIDTH}
        description={BODY_RULE_DESCRIPTIONS.allowlist}
        value={value.allowlist}
        onChange={(allowlist) => onChange({ ...value, allowlist })}
        placeholder="JSON pointers, comma-separated"
      />
      <TextField
        id={`${id}-excludelist`}
        label="Excludelist"
        labelWidth={RULE_LABEL_WIDTH}
        description={BODY_RULE_DESCRIPTIONS.excludelist}
        value={value.excludelist}
        onChange={(excludelist) => onChange({ ...value, excludelist })}
        placeholder="JSON pointers, comma-separated"
      />
    </SubGroup>
  );
}

function RuleField({ id, field, value, onChange }) {
  const shared = {
    id,
    label: field.label,
    hint: field.hint,
    description: field.description,
    labelWidth: RULE_LABEL_WIDTH,
  };

  switch (field.type) {
    case 'headers':
      return <HeadersField {...shared} value={value} onChange={onChange} />;
    case 'bodyRule':
      return <BodyRuleField {...shared} value={value} onChange={onChange} />;
    case 'stringList':
      return <TextField {...shared} value={value} onChange={onChange} placeholder="comma-separated" />;
    case 'regexList':
      return <RegexListField {...shared} regexLabel={field.regexLabel} value={value} onChange={onChange} />;
    default:
      return <TextField {...shared} value={value} onChange={onChange} />;
  }
}

export function CaptureRulesEditor({ rules, onChange }) {
  const updateRule = (index, key, value) =>
    onChange(rules.map((rule, position) => (position === index ? { ...rule, [key]: value } : rule)));

  return (
    <SubGroup title="Capture rules">
      {rules.length === 0 ? (
        <Note>No rules — the SDK captures 500-599 responses from all hosts by default.</Note>
      ) : (
        <Note>Rules are matched in reverse order, so the last rule listed wins.</Note>
      )}

      {rules.map((rule, index) => (
        <Card
          key={rule.id}
          title={`Rule ${index + 1}`}
          action={<Button onClick={() => onChange(rules.filter((_, position) => position !== index))}>Remove</Button>}
        >
          {CAPTURE_RULE_FIELDS.map((field) => (
            <RuleField
              key={field.key}
              id={`network-rule-${rule.id}-${field.key}`}
              field={field}
              value={rule[field.key]}
              onChange={(value) => updateRule(index, field.key, value)}
            />
          ))}
        </Card>
      ))}

      <Button onClick={() => onChange([...rules, createCaptureRule()])}>Add rule</Button>
    </SubGroup>
  );
}
