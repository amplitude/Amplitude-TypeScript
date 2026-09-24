import React from 'react';
import { CheckboxField, RegexListField, SelectField, SubGroup, TextField } from './components.jsx';
import { CaptureRulesEditor } from './network-capture-rules.jsx';

// Renders one schema field. onChange always receives the field's complete new value, so a `group`
// merges its children before handing the object up and callers need no path handling.
export function OptionField({ id, field, value, onChange, labelWidth }) {
  const shared = { id, label: field.label, hint: field.hint, description: field.description, labelWidth };

  switch (field.type) {
    case 'boolean':
      return <CheckboxField {...shared} checked={value} onChange={onChange} />;
    case 'enum':
      return <SelectField {...shared} value={value} onChange={onChange} choices={field.choices} />;
    case 'number':
      return <TextField {...shared} type="number" width={160} value={value} onChange={onChange} />;
    case 'stringList':
      return <TextField {...shared} value={value} onChange={onChange} placeholder="comma-separated" />;
    case 'regexList':
      return <RegexListField {...shared} regexLabel={field.regexLabel} value={value} onChange={onChange} />;
    case 'ruleList':
      return <CaptureRulesEditor rules={value} onChange={onChange} />;
    case 'group':
      return (
        <SubGroup title={field.label} description={field.description}>
          {field.fields.map((child) => (
            <OptionField
              key={child.key}
              id={`${id}-${child.key}`}
              field={child}
              value={value?.[child.key]}
              onChange={(childValue) => onChange({ ...value, [child.key]: childValue })}
              labelWidth={labelWidth}
            />
          ))}
        </SubGroup>
      );
    default:
      return <TextField {...shared} value={value} onChange={onChange} />;
  }
}
