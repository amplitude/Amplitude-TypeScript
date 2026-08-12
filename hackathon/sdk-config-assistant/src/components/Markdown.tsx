import React from 'react';

/** Tiny markdown-lite renderer: **bold**, `code`, *italic*, line breaks. */
export function Md({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderInline(line)}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}

function renderInline(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // tokenize on **bold**, `code`, *italic*
  // italic class excludes backticks so `code` spans inside *…* still tokenize
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*`]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
