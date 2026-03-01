import { useRef, useEffect, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { AgentState, Relationship } from '@murasato/shared';

interface GraphNode {
  id: string;
  name: string;
  villageId: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  relCount: number;
}

interface GraphEdge {
  from: string;
  to: string;
  sentiment: number;
}

const VILLAGE_COLORS = [
  '#5add5a', '#7ab8ff', '#dd5555', '#ffd700', '#bb77dd',
  '#ff8844', '#44dddd', '#ff77aa', '#aabb44', '#88aaff',
];

export function SocialNetworkGraph() {
  const showSocialGraph = useUIStore((s) => s.showSocialGraph);
  const toggleSocialGraph = useUIStore((s) => s.toggleSocialGraph);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const agents = useGameStore((s) => s.agents);
  const agentRelationships = useGameStore((s) => s.agentRelationships);
  const villages = useGameStore((s) => s.villages);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Build village color map
  const villageColorMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const vid of villages.keys()) {
      map.set(vid, VILLAGE_COLORS[i % VILLAGE_COLORS.length]);
      i++;
    }
    villageColorMap.current = map;
  }, [villages]);

  // Rebuild graph data when agents/relationships change
  useEffect(() => {
    if (!showSocialGraph) return;

    const living = [...agents.values()].filter((a) => a.identity.status !== 'dead');
    const nodes = nodesRef.current;

    // Add/update nodes
    const activeIds = new Set<string>();
    for (const agent of living) {
      activeIds.add(agent.identity.id);
      const existing = nodes.get(agent.identity.id);
      const rels = agentRelationships.get(agent.identity.id) ?? [];
      if (existing) {
        existing.name = agent.identity.name;
        existing.villageId = agent.villageId;
        existing.relCount = rels.length;
      } else {
        nodes.set(agent.identity.id, {
          id: agent.identity.id,
          name: agent.identity.name,
          villageId: agent.villageId,
          x: 400 + (Math.random() - 0.5) * 300,
          y: 300 + (Math.random() - 0.5) * 200,
          vx: 0,
          vy: 0,
          relCount: rels.length,
        });
      }
    }

    // Remove dead nodes
    for (const id of nodes.keys()) {
      if (!activeIds.has(id)) nodes.delete(id);
    }

    // Build edges
    const edges: GraphEdge[] = [];
    const edgeSet = new Set<string>();
    for (const [agentId, rels] of agentRelationships) {
      if (!activeIds.has(agentId)) continue;
      for (const rel of rels) {
        if (!activeIds.has(rel.targetId)) continue;
        const key = [agentId, rel.targetId].sort().join(':');
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({ from: agentId, to: rel.targetId, sentiment: rel.sentiment });
      }
    }
    edgesRef.current = edges;
  }, [agents, agentRelationships, showSocialGraph]);

  // Animation loop
  useEffect(() => {
    if (!showSocialGraph) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const W = canvas.width;
    const H = canvas.height;
    const CX = W / 2;
    const CY = H / 2;

    const step = () => {
      const nodes = [...nodesRef.current.values()];
      const edges = edgesRef.current;

      // Force simulation
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      // Attraction (edges)
      for (const edge of edges) {
        const a = nodesRef.current.get(edge.from);
        const b = nodesRef.current.get(edge.to);
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const idealDist = 80;
        const force = (dist - idealDist) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      // Center gravity
      for (const n of nodes) {
        n.vx += (CX - n.x) * 0.001;
        n.vy += (CY - n.y) * 0.001;
      }

      // Damping + apply
      for (const n of nodes) {
        n.vx *= 0.92;
        n.vy *= 0.92;
        n.x += n.vx;
        n.y += n.vy;
        // Clamp
        n.x = Math.max(30, Math.min(W - 30, n.x));
        n.y = Math.max(30, Math.min(H - 30, n.y));
      }

      // Draw
      ctx.fillStyle = 'rgba(13,13,36,0.95)';
      ctx.fillRect(0, 0, W, H);

      // Edges
      for (const edge of edges) {
        const a = nodesRef.current.get(edge.from);
        const b = nodesRef.current.get(edge.to);
        if (!a || !b) continue;
        const color = edge.sentiment > 0 ? `rgba(90,221,90,${Math.min(0.7, Math.abs(edge.sentiment) / 100)})` :
                      edge.sentiment < 0 ? `rgba(221,85,85,${Math.min(0.7, Math.abs(edge.sentiment) / 100)})` :
                      'rgba(128,128,128,0.2)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, Math.abs(edge.sentiment) / 40);
        ctx.stroke();
      }

      // Nodes
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let hovered: string | null = null;

      for (const n of nodes) {
        const radius = Math.max(4, Math.min(12, 4 + n.relCount * 1.5));
        const vColor = villageColorMap.current.get(n.villageId ?? '') ?? '#888';
        const dist = Math.sqrt((mx - n.x) ** 2 + (my - n.y) ** 2);
        const isHovered = dist < radius + 4;
        if (isHovered) hovered = n.id;

        // Glow
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2);
          ctx.fillStyle = vColor + '30';
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = vColor + '60';
        ctx.fill();
        ctx.strokeStyle = vColor;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Name label for hovered
        if (isHovered) {
          ctx.font = '11px "M PLUS 1p", monospace';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText(n.name, n.x, n.y - radius - 8);

          // Tooltip with relationships
          const rels = agentRelationships.get(n.id) ?? [];
          if (rels.length > 0) {
            const tooltipY = n.y + radius + 16;
            ctx.fillStyle = 'rgba(13,13,36,0.9)';
            const tooltipH = Math.min(rels.length, 5) * 14 + 8;
            ctx.fillRect(n.x - 60, tooltipY, 120, tooltipH);
            ctx.strokeStyle = 'rgba(74,111,165,0.3)';
            ctx.strokeRect(n.x - 60, tooltipY, 120, tooltipH);

            ctx.font = '9px "M PLUS 1p", monospace';
            ctx.textAlign = 'left';
            for (let ri = 0; ri < Math.min(rels.length, 5); ri++) {
              const r = rels[ri];
              const targetAgent = agents.get(r.targetId);
              const name = targetAgent?.identity.name ?? r.targetId.slice(0, 8);
              const sColor = r.sentiment > 0 ? '#5add5a' : r.sentiment < 0 ? '#dd5555' : '#888';
              ctx.fillStyle = sColor;
              ctx.fillText(`${name}: ${r.sentiment > 0 ? '+' : ''}${r.sentiment}`, n.x - 54, tooltipY + 12 + ri * 14);
            }
          }
        }
      }
      hoveredRef.current = hovered;

      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [showSocialGraph, agents, agentRelationships]);

  // Canvas resize
  useEffect(() => {
    if (!showSocialGraph) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.min(window.innerWidth * 0.85, 900);
    canvas.height = Math.min(window.innerHeight * 0.8, 650);
  }, [showSocialGraph]);

  const handleClick = useCallback(() => {
    if (hoveredRef.current) {
      selectAgent(hoveredRef.current);
    }
  }, [selectAgent]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  if (!showSocialGraph) return null;

  return (
    <div style={overlayStyle} onClick={toggleSocialGraph}>
      <div style={containerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleBarStyle}>
          <span style={{ color: '#bb77dd', fontWeight: 'bold', fontSize: 16 }}>Social Network</span>
          <span style={{ color: '#888', fontSize: 11, marginLeft: 12 }}>
            {nodesRef.current.size} agents / {edgesRef.current.length} relations
          </span>
          <button onClick={toggleSocialGraph} style={closeBtnStyle}>✕</button>
        </div>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: hoveredRef.current ? 'pointer' : 'default' }}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
        />
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const containerStyle: React.CSSProperties = {
  background: 'rgba(13,13,36,0.95)',
  border: '1px solid rgba(74,111,165,0.4)',
  borderRadius: 12,
  overflow: 'hidden',
  fontFamily: '"M PLUS 1p", monospace',
};

const titleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  borderBottom: '1px solid rgba(74,111,165,0.3)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 16,
  padding: '2px 6px',
};
