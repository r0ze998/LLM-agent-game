import { useState, useEffect, useCallback } from 'react';
import type { AgentBlueprint, DeployedBlueprintMeta, PersonalityAxes, SkillMap, SkillType } from '@murasato/shared';
import { useUIStore } from '../../store/uiStore.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { api } from '../../services/api.ts';

export function AgentDeployer() {
  const show = useUIStore((s) => s.showAgentDeployer);
  const toggle = useUIStore((s) => s.toggleAgentDeployer);
  const gameMode = useUIStore((s) => s.gameMode);
  const selectAgent = useUIStore((s) => s.selectAgent);
  const game = useGameStore((s) => s.game);

  const [soul, setSoul] = useState('');
  const [name, setName] = useState('');
  const [backstory, setBackstory] = useState('');
  const [rules, setRules] = useState<string[]>([]);
  const [ruleInput, setRuleInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blueprints, setBlueprints] = useState<DeployedBlueprintMeta[]>([]);

  // Advanced overrides
  const [personality, setPersonality] = useState<Partial<PersonalityAxes>>({});
  const [skills, setSkills] = useState<Partial<SkillMap>>({});

  const loadBlueprints = useCallback(async () => {
    if (!game) return;
    try {
      const data = await api.getBlueprints(game.id);
      setBlueprints(data);
    } catch { /* ignore */ }
  }, [game]);

  useEffect(() => {
    if (show) loadBlueprints();
  }, [show, loadBlueprints]);

  if (gameMode === 'observer' || !show || !game) return null;

  const addRule = () => {
    const trimmed = ruleInput.trim();
    if (trimmed) {
      setRules((prev) => [...prev, trimmed]);
      setRuleInput('');
    }
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeploy = async () => {
    if (soul.trim().length < 10) {
      setError('Soul description requires at least 10 characters');
      return;
    }
    setDeploying(true);
    setError(null);

    const blueprint: AgentBlueprint = {
      soul: soul.trim(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(rules.length > 0 ? { rules } : {}),
      ...(backstory.trim() ? { backstory: backstory.trim() } : {}),
      ...(Object.keys(personality).length > 0 ? { personality } : {}),
      ...(Object.keys(skills).length > 0 ? { skills } : {}),
    };

    try {
      await api.deployBlueprint(game.id, blueprint);
      setSoul('');
      setName('');
      setBackstory('');
      setRules([]);
      setPersonality({});
      setSkills({});
      await loadBlueprints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
    }
    setDeploying(false);
  };

  const personalityAxes: (keyof PersonalityAxes)[] = ['openness', 'agreeableness', 'conscientiousness', 'courage', 'ambition'];
  const personalityLabels: Record<string, string> = {
    openness: 'Openness', agreeableness: 'Agreeableness', conscientiousness: 'Conscientiousness', courage: 'Courage', ambition: 'Ambition',
  };
  const skillTypes: SkillType[] = ['farming', 'building', 'crafting', 'leadership', 'combat', 'diplomacy', 'teaching', 'healing'];
  const skillLabels: Record<string, string> = {
    farming: 'Farming', building: 'Building', crafting: 'Crafting', leadership: 'Leadership',
    combat: 'Combat', diplomacy: 'Diplomacy', teaching: 'Teaching', healing: 'Healing',
  };

  return (
    <div style={{
      animation: 'slideDown 0.2s ease',
      position: 'fixed',
      top: 60,
      right: 16,
      width: 380,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'linear-gradient(180deg, #2a1a3e 0%, #1a0d24 100%)',
      border: '2px solid #8a5fa5',
      borderRadius: 8,
      padding: 16,
      zIndex: 90,
      fontFamily: '"M PLUS 1p", monospace',
      fontSize: 13,
      color: '#eee',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 'bold', color: '#c9a5e5' }}>Summon AI Agent</span>
        <button onClick={toggle} style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>
          x
        </button>
      </div>

      {/* Soul textarea */}
      <label style={{ color: '#a88fc4', fontSize: 11 }}>Soul Description (required)</label>
      <textarea
        value={soul}
        onChange={(e) => setSoul(e.target.value)}
        placeholder="A gentle farmer who deeply respects the land and the rhythm of the seasons. Avoids conflict and always tries to resolve things through dialogue."
        rows={6}
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #555',
          borderRadius: 4,
          color: '#eee',
          padding: 8,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          marginBottom: 8,
          boxSizing: 'border-box',
        }}
      />

      {/* Name */}
      <label style={{ color: '#a88fc4', fontSize: 11 }}>Name (AI generates if omitted)</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Taro"
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #555',
          borderRadius: 4,
          color: '#eee',
          padding: '6px 8px',
          fontSize: 13,
          fontFamily: 'inherit',
          marginBottom: 8,
          boxSizing: 'border-box',
        }}
      />

      {/* Behavior rules */}
      <label style={{ color: '#a88fc4', fontSize: 11 }}>Behavior Rules</label>
      <div style={{ marginBottom: 8 }}>
        {rules.map((rule, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ flex: 1, background: '#1a1a2e', padding: '2px 6px', borderRadius: 3, fontSize: 12 }}>
              {i + 1}. {rule}
            </span>
            <button
              onClick={() => removeRule(i)}
              style={{ background: 'transparent', border: 'none', color: '#f66', cursor: 'pointer', fontSize: 12 }}
            >
              x
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={ruleInput}
            onChange={(e) => setRuleInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}
            placeholder="e.g. Prioritize farming above all"
            style={{
              flex: 1,
              background: '#111',
              border: '1px solid #555',
              borderRadius: 4,
              color: '#eee',
              padding: '4px 8px',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={addRule}
            style={{
              background: '#333',
              border: '1px solid #555',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: 12,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Backstory */}
      <label style={{ color: '#a88fc4', fontSize: 11 }}>Past Life Memories (optional)</label>
      <textarea
        value={backstory}
        onChange={(e) => setBackstory(e.target.value)}
        placeholder="Remembers being a healer in a distant land..."
        rows={3}
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #555',
          borderRadius: 4,
          color: '#eee',
          padding: 8,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          marginBottom: 8,
          boxSizing: 'border-box',
        }}
      />

      {/* Advanced settings */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#7a9ec7',
          cursor: 'pointer',
          fontSize: 11,
          padding: 0,
          marginBottom: 8,
        }}
      >
        {showAdvanced ? '- Hide Advanced' : '+ Advanced Settings'}
      </button>

      {showAdvanced && (
        <div style={{ background: '#1a1a2e', borderRadius: 4, padding: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#a88fc4', marginBottom: 4 }}>Personality (0-100)</div>
          {personalityAxes.map((axis) => (
            <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ width: 50, fontSize: 11 }}>{personalityLabels[axis]}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={personality[axis] ?? 50}
                onChange={(e) => setPersonality((prev) => ({ ...prev, [axis]: Number(e.target.value) }))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 24, fontSize: 11, textAlign: 'right' }}>{personality[axis] ?? 50}</span>
            </div>
          ))}

          <div style={{ fontSize: 11, color: '#a88fc4', marginTop: 8, marginBottom: 4 }}>Skills (1-30)</div>
          {skillTypes.map((skill) => (
            <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ width: 50, fontSize: 11 }}>{skillLabels[skill]}</span>
              <input
                type="range"
                min={1}
                max={30}
                value={(skills as Record<string, number>)[skill] ?? 5}
                onChange={(e) => setSkills((prev) => ({ ...prev, [skill]: Number(e.target.value) }))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 24, fontSize: 11, textAlign: 'right' }}>{(skills as Record<string, number>)[skill] ?? 5}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{ color: '#f66', fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}

      {/* Deploy button */}
      <button
        onClick={handleDeploy}
        disabled={deploying}
        style={{
          width: '100%',
          background: deploying ? '#444' : '#6a3fa5',
          border: 'none',
          borderRadius: 4,
          padding: '8px 0',
          color: '#fff',
          fontSize: 14,
          fontWeight: 'bold',
          fontFamily: 'inherit',
          cursor: deploying ? 'wait' : 'pointer',
          marginBottom: 12,
        }}
      >
        {deploying ? 'Analyzing soul...' : 'Summon'}
      </button>

      {/* Deployed list */}
      {blueprints.length > 0 && (
        <div>
          <div style={{ color: '#a88fc4', fontSize: 11, marginBottom: 4 }}>Deployed Agents</div>
          {blueprints.map((bp) => {
            const agent = [...(useGameStore.getState().agents.values())].find(a => a.identity.id === bp.agentId);
            const handleRecall = async (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!game) return;
              try {
                await api.recallBlueprint(game.id, bp.blueprintId);
                await loadBlueprints();
              } catch { /* ignore */ }
            };
            return (
              <div
                key={bp.blueprintId}
                onClick={() => { if (agent) selectAgent(agent.identity.id); }}
                style={{
                  background: '#1a1a2e',
                  borderRadius: 4,
                  padding: '6px 8px',
                  marginBottom: 4,
                  cursor: agent ? 'pointer' : 'default',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: '#c9a5e5', fontWeight: 'bold', fontSize: 12 }}>
                    {agent?.identity.name ?? '(Unnamed)'}
                  </span>
                  <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>
                    {bp.soul.slice(0, 25)}{bp.soul.length > 25 ? '...' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: agent?.identity.status === 'dead' ? '#4a2020' : '#204a20',
                    color: agent?.identity.status === 'dead' ? '#f88' : '#8f8',
                  }}>
                    {agent?.identity.status ?? 'unknown'}
                  </span>
                  <button
                    onClick={handleRecall}
                    title="Recall (remove)"
                    style={{
                      background: 'transparent',
                      border: '1px solid #633',
                      borderRadius: 3,
                      color: '#f66',
                      cursor: 'pointer',
                      fontSize: 10,
                      padding: '1px 4px',
                    }}
                  >
                    x
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
