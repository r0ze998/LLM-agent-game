import { useGameStore } from '../../store/gameStore.ts';

export function VillagePanel() {
  const villages = useGameStore((s) => s.villages);
  const agents = useGameStore((s) => s.agents);

  if (villages.size === 0) return null;

  return (
    <div style={{
      animation: 'slideDown 0.2s ease',
      position: 'fixed',
      top: 60,
      left: 16,
      width: 220,
      maxHeight: 300,
      overflowY: 'auto',
      background: 'linear-gradient(180deg, #1a2a1a 0%, #0d1a0d 100%)',
      border: '2px solid #4a8a4a',
      borderRadius: 8,
      padding: 12,
      color: '#e8e8e8',
      fontFamily: '"M PLUS 1p", monospace',
      fontSize: 12,
      zIndex: 70,
    }}>
      <div style={{ fontWeight: 'bold', color: '#7ac87a', marginBottom: 8 }}>村一覧</div>
      {[...villages.values()].map((village) => (
        <div key={village.id} style={{ marginBottom: 8, borderBottom: '1px solid #333', paddingBottom: 6 }}>
          <div style={{ fontWeight: 'bold' }}>{village.name}</div>
          <div style={{ color: '#999' }}>
            人口: {village.population.length} / 統治: {village.governance.type}
          </div>
          <div style={{ color: '#888', fontSize: 11 }}>
            {Object.entries(village.resources)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k}:${v}`)
              .join(' ')}
          </div>
        </div>
      ))}
    </div>
  );
}
