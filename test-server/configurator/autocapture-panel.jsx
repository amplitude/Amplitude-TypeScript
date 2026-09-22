import React from 'react';
import { CheckboxField, Panel } from './components.jsx';
import { AUTOCAPTURE_OPTIONS } from './autocapture-options.js';
import { changedFields } from './fields.js';
import { OptionField } from './option-field.jsx';

const SUB_LABEL_WIDTH = 210;

function hintFor(option) {
  const parts = [`SDK default: ${String(option.defaultValue)}`];
  if (option.experimental) {
    parts.push('experimental');
  }
  return `(${parts.join(' · ')})`;
}

// AUTOCAPTURE_OPTIONS aren't typed fields, so compare against each option's own default rather than
// going through changedFields.
function customisedCount(values, subValues) {
  return AUTOCAPTURE_OPTIONS.filter(
    (option) =>
      values[option.key] !== option.defaultValue ||
      changedFields(option.subOptions ?? [], subValues[option.key] ?? {}).length > 0,
  ).length;
}

export function AutocapturePanel({ values, onChange, subValues, onSubChange }) {
  const count = customisedCount(values, subValues);

  return (
    <Panel
      title="Autocapture options"
      description="Each option below maps to a key on the autocapture config object."
      badge={count > 0 ? `${count} customised` : null}
    >
      {AUTOCAPTURE_OPTIONS.map((option) => {
        const enabled = values[option.key];

        return (
          <div key={option.key}>
            <CheckboxField
              id={`autocapture-${option.key}`}
              label={option.label}
              checked={enabled}
              onChange={(checked) => onChange(option.key, checked)}
              labelWidth={200}
              hint={hintFor(option)}
              description={option.description}
            />
            {enabled && option.subOptions ? (
              <OptionField
                id={`autocapture-${option.key}`}
                field={{
                  key: option.key,
                  label: `${option.label} sub-config`,
                  type: 'group',
                  fields: option.subOptions,
                }}
                value={subValues[option.key] ?? {}}
                onChange={(next) => onSubChange(option.key, next)}
                labelWidth={SUB_LABEL_WIDTH}
              />
            ) : null}
          </div>
        );
      })}
    </Panel>
  );
}
