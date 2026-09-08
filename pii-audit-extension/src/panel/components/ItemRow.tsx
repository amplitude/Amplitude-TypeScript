import type { AuditItem } from '../../shared/item';

export function ItemRow({
  item,
  onHover,
  onLeave,
}: {
  item: AuditItem;
  onHover: (i: AuditItem) => void;
  onLeave: () => void;
}) {
  const pii = item.pii;
  return (
    <div
      onMouseEnter={() => onHover(item)}
      onMouseLeave={onLeave}
      style={{
        padding: 8,
        borderRadius: 6,
        marginBottom: 6,
        border: `1px solid ${pii ? '#E8873C' : '#E1E6EB'}`,
        background: pii ? '#FFF8F0' : '#F7F8FA',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span
          style={{
            fontSize: 10,
            color: '#fff',
            background: '#5B6B7B',
            borderRadius: 8,
            padding: '1px 6px',
          }}
        >
          {item.source}
        </span>
        {pii && (
          <span
            style={{
              fontSize: 10,
              color: '#fff',
              background: '#E8873C',
              borderRadius: 8,
              padding: '1px 6px',
            }}
          >
            {pii.category}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.value}</div>
      {pii && <div style={{ fontSize: 11, color: '#5B6B7B' }}>reason: {pii.reason}</div>}
    </div>
  );
}
