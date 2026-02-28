/**
 * PaymentDashboard.tsx — x402 決済ダッシュボード
 *
 * エージェント間決済・プレイヤーAPI決済の履歴と統計を表示する。
 */

import { useState, useEffect, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore.ts';
import { useEvmWalletStore } from '../../store/evmWalletStore.ts';
import { api } from '../../services/api.ts';
import type { X402PaymentRecord, X402PaymentPurpose } from '@murasato/shared';

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 50,
  right: 16,
  width: 420,
  maxHeight: 'calc(100vh - 80px)',
  overflowY: 'auto',
  background: 'linear-gradient(180deg, rgba(13,13,36,0.97) 0%, rgba(10,10,28,0.97) 100%)',
  border: '2px solid #4fc3f7',
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

const PURPOSE_LABELS: Record<X402PaymentPurpose, string> = {
  player_intention: '天の声',
  chronicle_generation: '年代記生成',
  biography_generation: '伝記生成',
  blueprint_deploy: '召喚配備',
  agent_trade: '取引',
  agent_alliance: '同盟',
  agent_tribute: '貢物',
};

const PURPOSE_COLORS: Record<X402PaymentPurpose, string> = {
  player_intention: '#d4a0ff',
  chronicle_generation: '#7ab8ff',
  biography_generation: '#77ddaa',
  blueprint_deploy: '#ffcc55',
  agent_trade: '#55dd99',
  agent_alliance: '#5599dd',
  agent_tribute: '#dd7755',
};

export function PaymentDashboard() {
  const show = useUIStore((s) => s.showPaymentDashboard);
  const toggle = useUIStore((s) => s.togglePaymentDashboard);
  const evmConnected = useEvmWalletStore((s) => s.isConnected);
  const evmAddress = useEvmWalletStore((s) => s.evmAddress);

  const [payments, setPayments] = useState<X402PaymentRecord[]>([]);
  const [stats, setStats] = useState<{ totalRevenue: number; totalPayments: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recentPayments, paymentStats] = await Promise.all([
        api.getRecentPayments(100),
        api.getPaymentStats(),
      ]);
      setPayments(recentPayments);
      setStats(paymentStats);
    } catch (err) {
      setError('決済データの取得に失敗しました');
      console.error('[PaymentDashboard]', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (show) fetchData();
  }, [show, fetchData]);

  if (!show) return null;

  // 目的別の集計
  const byPurpose = new Map<X402PaymentPurpose, { count: number; total: number }>();
  for (const p of payments) {
    const existing = byPurpose.get(p.purpose) ?? { count: 0, total: 0 };
    existing.count++;
    existing.total += parseFloat(p.amount);
    byPurpose.set(p.purpose, existing);
  }

  return (
    <div style={PANEL_STYLE}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 'bold', fontSize: 14, color: '#4fc3f7' }}>
          決済ダッシュボード
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={fetchData} style={refreshBtn} title="更新">
            ↻
          </button>
          <button onClick={toggle} style={closeBtn}>✕</button>
        </div>
      </div>

      {/* Connection status */}
      <div style={{
        ...SECTION_STYLE,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: evmConnected ? '#4fc3f7' : '#666',
          boxShadow: evmConnected ? '0 0 8px #4fc3f7' : 'none',
          display: 'inline-block',
        }} />
        <span style={{ color: evmConnected ? '#4fc3f7' : '#888' }}>
          {evmConnected
            ? `Base接続中: ${evmAddress?.slice(0, 6)}...${evmAddress?.slice(-4)}`
            : 'EVM未接続'
          }
        </span>
      </div>

      {loading && (
        <div style={{ color: '#888', textAlign: 'center', padding: 16 }}>読み込み中...</div>
      )}

      {error && (
        <div style={{ color: '#dd5555', textAlign: 'center', padding: 8, fontSize: 11 }}>{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Summary stats */}
          {stats && (
            <div style={SECTION_STYLE}>
              <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#aaa' }}>概要</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCard label="総決済額" value={`$${stats.totalRevenue.toFixed(6)}`} color="#4fc3f7" />
                <StatCard label="総取引数" value={String(stats.totalPayments)} color="#77ddaa" />
              </div>
            </div>
          )}

          {/* Purpose breakdown */}
          {byPurpose.size > 0 && (
            <div style={SECTION_STYLE}>
              <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#aaa' }}>目的別内訳</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...byPurpose.entries()]
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([purpose, data]) => (
                    <PurposeRow key={purpose} purpose={purpose} count={data.count} total={data.total} />
                  ))}
              </div>
            </div>
          )}

          {/* Recent payments */}
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#aaa' }}>直近の決済</div>
            {payments.length === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: 12 }}>決済記録なし</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {payments.slice(-20).reverse().map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #333',
      borderRadius: 6,
      padding: '8px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
}

function PurposeRow({ purpose, count, total }: { purpose: X402PaymentPurpose; count: number; total: number }) {
  const color = PURPOSE_COLORS[purpose] ?? '#aaa';
  const label = PURPOSE_LABELS[purpose] ?? purpose;
  const maxBarWidth = 160;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <span style={{ width: 80, color, fontSize: 11 }}>{label}</span>
      <div style={{
        flex: 1,
        height: 6,
        background: '#222',
        borderRadius: 3,
        overflow: 'hidden',
        maxWidth: maxBarWidth,
      }}>
        <div style={{
          height: '100%',
          background: color,
          borderRadius: 3,
          width: `${Math.min(100, count * 5)}%`,
          opacity: 0.7,
        }} />
      </div>
      <span style={{ color: '#aaa', fontSize: 10, width: 50, textAlign: 'right' }}>{count}件</span>
      <span style={{ color: '#888', fontSize: 10, width: 70, textAlign: 'right' }}>${total.toFixed(4)}</span>
    </div>
  );
}

function PaymentRow({ payment }: { payment: X402PaymentRecord }) {
  const color = PURPOSE_COLORS[payment.purpose] ?? '#aaa';
  const label = PURPOSE_LABELS[payment.purpose] ?? payment.purpose;
  const time = new Date(payment.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const shortFrom = `${payment.fromAddress.slice(0, 6)}..${payment.fromAddress.slice(-3)}`;
  const shortTo = `${payment.toAddress.slice(0, 6)}..${payment.toAddress.slice(-3)}`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 4,
      fontSize: 10,
    }}>
      <span style={{ color: '#666', width: 55, flexShrink: 0 }}>{time}</span>
      <span style={{
        color,
        padding: '1px 6px',
        background: `${color}15`,
        borderRadius: 3,
        width: 60,
        textAlign: 'center',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{ color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortFrom} → {shortTo}
      </span>
      <span style={{ color: '#4fc3f7', fontWeight: 'bold', flexShrink: 0 }}>
        ${parseFloat(payment.amount).toFixed(4)}
      </span>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16,
};

const refreshBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #555', borderRadius: 4,
  color: '#4fc3f7', cursor: 'pointer', fontSize: 14, padding: '2px 6px',
};
