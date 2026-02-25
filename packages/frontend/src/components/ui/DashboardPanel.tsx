import { useRef, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore.ts';
import { useUIStore } from '../../store/uiStore.ts';
import type { GovernanceType, EconomicsType } from '@murasato/shared';

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 50,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 640,
  maxHeight: 'calc(100vh - 80px)',
  overflowY: 'auto',
  background: 'linear-gradient(180deg, rgba(13,13,36,0.97) 0%, rgba(10,10,28,0.97) 100%)',
  border: '2px solid #4a6fa5',
  borderRadius: 8,
  padding: 16,
  color: '#e8e8e8',
  fontFamily: '"M PLUS 1p", monospace',
  fontSize: 12,
  zIndex: 200,
};

const SECTION_STYLE: React.CSSProperties = {
  marginBottom: 16,
  borderBottom: '1px solid #333',
  paddingBottom: 12,
};

const GOV_COLORS: Record<GovernanceType, string> = {
  democratic: '#5a9edd',
  meritocratic: '#ddaa33',
  authoritarian: '#dd5555',
  anarchist: '#55dd55',
  theocratic: '#bb77dd',
};

const ECON_COLORS: Record<EconomicsType, string> = {
  collectivist: '#dd7755',
  market: '#55bb77',
  gift_economy: '#77aadd',
  feudal: '#ccaa55',
};

const GOV_LABELS: Record<GovernanceType, string> = {
  democratic: '民主制',
  meritocratic: '実力主義',
  authoritarian: '権威主義',
  anarchist: '無政府',
  theocratic: '神権政治',
};

const ECON_LABELS: Record<EconomicsType, string> = {
  collectivist: '共同体',
  market: '市場経済',
  gift_economy: '贈与経済',
  feudal: '封建制',
};

export function DashboardPanel() {
  const show = useUIStore((s) => s.showDashboard);
  const toggle = useUIStore((s) => s.toggleDashboard);
  const stats = useGameStore((s) => s.stats);
  const agents = useGameStore((s) => s.agents);

  if (!show) return null;

  const living = [...agents.values()].filter(a => a.identity.status !== 'dead');

  return (
    <div style={PANEL_STYLE}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 'bold', fontSize: 16, color: '#7ab8ff' }}>社会実験ダッシュボード</span>
        <button onClick={toggle} style={{
          background: 'transparent', border: '1px solid #555', borderRadius: 4,
          color: '#999', cursor: 'pointer', padding: '2px 8px', fontSize: 12, fontFamily: 'inherit',
        }}>閉じる</button>
      </div>

      {/* Population Overview */}
      <div style={SECTION_STYLE}>
        <SectionTitle>人口概要</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <StatBox label="総人口" value={stats?.population ?? agents.size} color="#7ab8ff" />
          <StatBox label="生存者" value={stats?.livingCount ?? living.length} color="#5add5a" />
          <StatBox label="死亡者" value={stats?.deadCount ?? (agents.size - living.length)} color="#dd5555" />
          <StatBox label="村数" value={stats?.villageCount ?? 0} color="#ddaa55" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
          <StatBox label="最大世代" value={stats?.generationMax ?? 0} color="#bb77dd" />
          <StatBox label="現在ティック" value={stats?.tick ?? 0} color="#888" />
        </div>
      </div>

      {/* Population History Graph */}
      {stats && stats.populationHistory.length > 1 && (
        <div style={SECTION_STYLE}>
          <SectionTitle>人口推移</SectionTitle>
          <PopulationGraph data={stats.populationHistory} />
        </div>
      )}

      {/* Average Needs */}
      <div style={SECTION_STYLE}>
        <SectionTitle>平均ニーズ</SectionTitle>
        <div style={{ display: 'flex', gap: 16 }}>
          <NeedBar label="空腹" value={stats?.avgHunger ?? 50} color="#dd8833" />
          <NeedBar label="体力" value={stats?.avgEnergy ?? 50} color="#33aa55" />
          <NeedBar label="社交" value={stats?.avgSocial ?? 50} color="#5588dd" />
        </div>
      </div>

      {/* Philosophy Distribution */}
      {stats && (
        <div style={SECTION_STYLE}>
          <SectionTitle>統治思想分布</SectionTitle>
          <DistributionBars
            data={stats.philosophyDistribution}
            colors={GOV_COLORS}
            labels={GOV_LABELS}
          />
        </div>
      )}

      {/* Economics Distribution */}
      {stats && (
        <div style={SECTION_STYLE}>
          <SectionTitle>経済思想分布</SectionTitle>
          <DistributionBars
            data={stats.economicsDistribution}
            colors={ECON_COLORS}
            labels={ECON_LABELS}
          />
        </div>
      )}

      {/* Generation Breakdown */}
      <div style={{ ...SECTION_STYLE, borderBottom: 'none' }}>
        <SectionTitle>世代分布</SectionTitle>
        <GenerationBreakdown agents={living} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 'bold', color: '#99bbdd', marginBottom: 8, fontSize: 13 }}>{children}</div>;
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #333',
      borderRadius: 4,
      padding: '6px 8px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888' }}>{label}</div>
    </div>
  );
}

function NeedBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#aaa' }}>{label}</span>
        <span style={{ color }}>{pct}</span>
      </div>
      <div style={{ height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function DistributionBars<T extends string>({
  data,
  colors,
  labels,
}: {
  data: Record<T, number>;
  colors: Record<T, string>;
  labels: Record<T, string>;
}) {
  const entries = Object.entries(data) as [T, number][];
  const total = Math.max(1, entries.reduce((s, [, v]) => s + (v as number), 0));

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {entries.map(([key, count]) => {
          const pct = ((count as number) / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              style={{ width: `${pct}%`, background: colors[key], transition: 'width 0.3s' }}
              title={`${labels[key]}: ${count}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {entries.map(([key, count]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[key] }} />
            <span style={{ color: '#aaa', fontSize: 11 }}>{labels[key]}: {count as number}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PopulationGraph({ data }: { data: { tick: number; count: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 8, right: 8, bottom: 20, left: 36 };

    ctx.clearRect(0, 0, w, h);

    const minTick = data[0].tick;
    const maxTick = data[data.length - 1].tick;
    const maxCount = Math.max(1, ...data.map(d => d.count));
    const tickRange = Math.max(1, maxTick - minTick);

    const gw = w - pad.left - pad.right;
    const gh = h - pad.top - pad.bottom;

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (gh * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxCount * (1 - i / 4));
      const y = pad.top + (gh * i) / 4;
      ctx.fillText(String(val), pad.left - 4, y + 3);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillText(String(minTick), pad.left, h - 4);
    ctx.fillText(String(maxTick), w - pad.right, h - 4);

    // Line
    ctx.strokeStyle = '#5a9edd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = pad.left + ((data[i].tick - minTick) / tickRange) * gw;
      const y = pad.top + gh - (data[i].count / maxCount) * gh;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    ctx.lineTo(pad.left + gw, pad.top + gh);
    ctx.lineTo(pad.left, pad.top + gh);
    ctx.closePath();
    ctx.fillStyle = 'rgba(90,158,221,0.1)';
    ctx.fill();
  }, [data]);

  return <canvas ref={canvasRef} width={600} height={120} style={{ width: '100%', height: 120 }} />;
}

function GenerationBreakdown({ agents }: { agents: { identity: { generation: number } }[] }) {
  const genCounts = new Map<number, number>();
  for (const a of agents) {
    const g = a.identity.generation;
    genCounts.set(g, (genCounts.get(g) ?? 0) + 1);
  }

  const entries = [...genCounts.entries()].sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(1, ...entries.map(([, c]) => c));

  if (entries.length === 0) {
    return <div style={{ color: '#666' }}>データなし</div>;
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
      {entries.map(([gen, count]) => (
        <div key={gen} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            height: Math.max(4, (count / maxCount) * 48),
            background: `hsl(${(gen * 40) % 360}, 60%, 55%)`,
            borderRadius: '2px 2px 0 0',
            transition: 'height 0.3s',
          }} />
          <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>G{gen}</div>
          <div style={{ fontSize: 9, color: '#aaa' }}>{count}</div>
        </div>
      ))}
    </div>
  );
}
