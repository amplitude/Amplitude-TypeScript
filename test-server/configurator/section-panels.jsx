import React from 'react';
import { Panel } from './components.jsx';
import { changedFields } from './fields.js';
import { OptionField } from './option-field.jsx';

const LABEL_WIDTH = 210;

// Renders a schema split into sections as one collapsible panel each, used for both the browser
// config and the session replay options.
export function SectionPanels({ sections, values, onChange, idPrefix }) {
  return (
    <>
      {sections.map((section) => {
        // Promoted fields are rendered at the top of the form instead, so they are left out here and
        // out of the badge count.
        const fields = section.fields.filter((field) => !field.topLevel);
        const setCount = changedFields(fields, values).length;

        return (
          <Panel key={section.title} title={section.title} badge={setCount > 0 ? `${setCount} set` : null}>
            {fields.map((field) => (
              <OptionField
                key={field.key}
                id={`${idPrefix}-${field.key}`}
                field={field}
                value={values[field.key]}
                onChange={(value) => onChange(field.key, value)}
                labelWidth={LABEL_WIDTH}
              />
            ))}
          </Panel>
        );
      })}
    </>
  );
}
