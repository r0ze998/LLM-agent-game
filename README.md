# 村里 (Murasato)

AI自己繁殖JRPGビレッジビルダー — LLMエージェントが自律的に生活・繁殖・村を建設する4Xシミュレーター。

プレイヤーは「神」の視点から世界を観察し、「天の声」でエージェントに意図を伝える。エージェントたちは独自の性格・哲学を持ち、自己組織化する社会を形成し、契約・発明・制度を通じて文明を発展させていく。

## アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│  Off-chain                                           │
│  ┌──────────────┐  ┌───────────────┐                 │
│  │ LLM Agent    │→ │ TX Submitter  │── tx ──┐        │
│  │ (Claude API) │  │ (starknet.js) │        │        │
│  └──────────────┘  └───────────────┘        │        │
│  ┌──────────────┐  ┌───────────────┐        │        │
│  │ Bun Server   │  │ React Frontend│        │        │
│  │ (Hono + WS)  │  │ (Canvas2D)    │        │        │
│  └──────────────┘  └───────────────┘        │        │
│         ↑                                   │        │
│         └──── Torii (GraphQL subscribe) ────┤        │
│                                             ▼        │
│  ┌─ Starknet / Katana ──────────────────────────────┐│
│  │  Dojo World (Cairo Smart Contracts)              ││
│  │                                                  ││
│  │  Models: Village, Building, Technology,          ││
│  │          Military, Covenant, Invention,           ││
│  │          Institution, Diplomacy, Config           ││
│  │                                                  ││
│  │  Systems: physics, village_tick, commands,        ││
│  │           combat, covenant, invention,            ││
│  │           institution, victory, setup             ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Starknet (Katana) + Dojo v1.5.0 + Cairo 2.10.1 |
| **Frontend** | React 19 + Vite + Zustand + Canvas2D |
| **Server** | Hono + Bun + WebSocket |
| **AI** | Anthropic Claude API (Haiku 4.5 / Sonnet 4.6) |
| **Indexer** | Torii (Dojo) |
| **Shared** | TypeScript monorepo (Bun workspaces) |

## Quick Start

```bash
# Install dependencies
bun install

# Start local Starknet node
katana --dev --dev.seed 0 --dev.no-fee

# Build & deploy contracts (in separate terminal)
cd packages/contracts
sozo build && sozo migrate --profile dev

# Register game definitions (buildings, techs, units)
sozo execute aw-setup register_all

# Start server (port 3001)
cd packages/server
bun run dev

# Start frontend (port 3000) — in a separate terminal
cd packages/frontend
bun run dev
```

Open http://localhost:3000 and click "はじめる" to start a new game.

### Environment Variables

Copy `.env.example` to `.env` in the project root:

```bash
PORT=3001                        # Server port
CORS_ORIGIN=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-xxx     # Required for agent AI
```

Without `ANTHROPIC_API_KEY`, agents will use fallback daily plans instead of LLM-generated decisions.

## Project Structure

```
packages/
├── contracts/       Starknet Dojo smart contracts (Cairo)
│   ├── Scarb.toml
│   ├── dojo_dev.toml
│   └── src/
│       ├── lib.cairo
│       ├── types.cairo          Enums: EffectType, ClauseType, UnitTag, etc.
│       ├── models/
│       │   ├── village.cairo        Village (resources, population, culture, score)
│       │   ├── building.cairo       Building, BuildingDef, BuildQueue
│       │   ├── technology.cairo     ResearchedTech, TechDef, ResearchQueue
│       │   ├── military.cairo       GarrisonUnit, UnitDef, TrainQueue
│       │   ├── covenant.cairo       Covenant, CovenantClause (Layer 1)
│       │   ├── invention.cairo      Invention, InventionKnowledge (Layer 2)
│       │   ├── institution.cairo    Institution, JoinRequirement (Layer 3)
│       │   ├── diplomacy.cairo      DiplomaticRelation
│       │   ├── config.cairo         PhysicsConfig, GameConfig, GameCounter
│       │   └── effect.cairo         AggregatedEffect
│       └── systems/
│           ├── physics.cairo        Layer 0: immutable effect bounds + clamp
│           ├── village_tick.cairo    Tick processing (L0-L3 aggregation, upkeep, decay)
│           ├── commands.cairo       build, research, train, demolish, diplomacy
│           ├── combat.cairo         Attack resolution (bonuses, fortification, type advantage)
│           ├── covenant.cairo       Layer 1: propose, repeal, clause→effect
│           ├── invention.cairo      Layer 2: register, spread knowledge
│           ├── institution.cairo    Layer 3: found, join (requirement validation), leave
│           ├── victory.cairo        5 victory conditions
│           └── setup.cairo          Register 25 buildings, 30 techs, 10 units
│
├── shared/          Types, constants & game rules
│   └── src/
│       ├── types.ts           All type definitions
│       ├── types4x.ts         4X strategy types
│       ├── constants.ts       Game constants
│       ├── commands.ts        Command definitions
│       └── rules/
│           ├── buildings.ts       25 building definitions
│           ├── techs.ts           30 technology definitions (3 branches × 10 tiers)
│           ├── units.ts           10 unit definitions
│           ├── physics.ts         Layer 0 effect bounds
│           ├── terrain.ts         Terrain types & yields
│           ├── victory.ts         Victory condition thresholds
│           └── types.ts           Rule type definitions
│
├── server/          Hono + Bun game server
│   └── src/
│       ├── index.ts               Entry point (HTTP + WebSocket)
│       ├── agent/                 LLM integration & agent AI
│       │   ├── llmClient.ts           Claude API (cache, rate limit, cost tracking)
│       │   ├── decisionEngine.ts      3-tier decision: instinct → daily plan → LLM
│       │   ├── prompts.ts             Japanese prompt templates
│       │   ├── memory.ts             3-tier memory (working/episodic/longterm)
│       │   └── lifecycle.ts           Birth, aging, reproduction, death
│       ├── engine/                4X strategy engine
│       │   ├── ruleEngine.ts          Physics validation + effect aggregation
│       │   ├── commandProcessor.ts    Build/research/train command execution
│       │   ├── combatEngine.ts        Combat resolution
│       │   ├── aiStrategy.ts          LLM-driven village strategy
│       │   ├── covenantEngine.ts      Layer 1: covenant lifecycle
│       │   ├── inventionRegistry.ts   Layer 2: invention management
│       │   ├── institutionEngine.ts   Layer 3: institution lifecycle
│       │   └── victoryChecker.ts      Victory condition evaluation
│       ├── world/                 World simulation
│       │   ├── simulation.ts          Main tick loop (12 phases)
│       │   ├── map.ts                 Perlin noise terrain generation
│       │   ├── pathfinding.ts         A* pathfinding
│       │   ├── resources.ts           Resource gathering & regeneration
│       │   └── building.ts            Construction system
│       ├── social/                Social systems
│       │   ├── governance.ts          Elections, laws
│       │   ├── relationships.ts       Sentiment, trust, familiarity
│       │   ├── conversation.ts        Autonomous LLM-generated dialogue
│       │   ├── culture.ts             Cultural evolution
│       │   └── diplomacy.ts           Inter-village relations, trade
│       ├── services/              Runtime services
│       │   ├── tickService.ts         Simulation loop & WebSocket broadcast
│       │   ├── wsManager.ts           WebSocket management
│       │   ├── saveService.ts         JSON save/load
│       │   ├── eventStore.ts          Event persistence
│       │   └── statsService.ts        World statistics
│       └── routes/                REST API
│           ├── game.ts                Game CRUD, save/load, stats
│           ├── world.ts               Map chunks, village data
│           ├── agent.ts               Agent details
│           ├── player.ts              Player intentions
│           └── strategy.ts            4X strategy API
│
└── frontend/        React + Vite UI
    └── src/
        ├── App.tsx                Main app (title screen + game)
        ├── components/
        │   ├── world/
        │   │   ├── WorldCanvas.tsx     Canvas2D map renderer
        │   │   ├── TileRenderer.ts     Tile drawing with pattern cache
        │   │   ├── AgentSprite.ts      Agent rendering (animated)
        │   │   └── BuildingSprite.ts   Building rendering
        │   └── ui/
        │       ├── DashboardPanel.tsx   Statistics
        │       ├── AgentInspector.tsx    Agent status
        │       ├── AgentDeployer.tsx     Deploy new agents with soul/rules
        │       ├── VillagePanel.tsx      Village list
        │       ├── IntentionPanel.tsx    Voice of god input
        │       ├── TimelinePanel.tsx     Event chronicle
        │       ├── DialogueBox.tsx       JRPG-style text box
        │       ├── SpeedControl.tsx      Playback speed
        │       └── Minimap.tsx           World overview
        ├── hooks/
        │   ├── useWorldState.ts    WebSocket state sync
        │   ├── useViewport.ts      Camera & viewport
        │   └── useAgentFocus.ts    Agent tracking
        ├── store/
        │   ├── gameStore.ts        Zustand: simulation state
        │   └── uiStore.ts          Zustand: UI state
        └── services/
            ├── api.ts              REST API client
            └── wsClient.ts         WebSocket client
```

## Game Systems

### 4-Layer Autonomous World

ゲームのルールとロジックは全て Starknet 上のスマートコントラクトに記述されている。LLM エージェントはオフチェーンで思考し、トランザクションを送信するだけ。

| Layer | Name | Description |
|-------|------|-------------|
| **L0** | Physics | 不変の物理法則。18種エフェクトの上下限値、コスト下限、減衰率 |
| **L1** | Covenants (契約) | 村の法律・条約。13種条項（税率、徴兵、建設禁止、祭りなど）→ エフェクト変換 |
| **L2** | Inventions (発明) | プレイヤー/AIが定義する新しい建物・技術・ユニット。物理検証付き |
| **L3** | Institutions (制度) | 村横断組織（ギルド、宗教、同盟、学院）。入会条件付き |

### Agents — 自律会話システム

エージェントは初期パラメータに基づいて**自律的に会話**する:

1. **性格 (不変)**: 5軸 — openness, agreeableness, conscientiousness, courage, ambition (各0-100)
2. **哲学 (進化)**: 政治思想、経済思想、価値観、世界観
3. **スキル**: farming, building, crafting, leadership, combat, diplomacy, teaching, healing
4. **ニーズ**: hunger (1/tick減少), energy (2/tick減少), social (0.5/tick減少)
5. **ライフサイクル**: child → adult (age 200) → elder → death (800-1500 ticks)
6. **ブループリント** (任意): `soul` (不変の魂/バックストーリー) + `rules` (行動ルール)

**会話の流れ:**

```
毎ティック → 3タイル以内のエージェント検出 → 状況判定 → 確率チェック
→ LLM が性格・記憶・関係性に基づいて会話生成 (日本語)
→ 感情/信頼度/親密度を更新 → WebSocket でフロントエンドに配信
→ JRPG風テキストボックスで表示
```

**会話トリガーと優先度:**

| 状況 | 発火確率 |
|------|---------|
| 初対面 (familiarity < 5) | 30% |
| 久しぶり (100+ ticks) | 25% |
| ライバル遭遇 (sentiment < -30) | 20% |
| 親友 (sentiment > 50) | 15% |
| カジュアル | 10% |

**会話結果:**
- 3-6行のセリフ（speakerId + text）
- 感情変化 (-5 ~ +10)
- 新しい記憶の生成（重要度付き）
- 信頼度・親密度の自動更新

### Decision Engine (3 tiers)

| Priority | Method | Trigger |
|----------|--------|---------|
| P2 Instinct | Rule-based | hunger < 20 → eat, energy < 15 → sleep |
| P1 Daily Plan | LLM (1/day) | 24スロットスケジュール + socialIntentions |
| P0 Fallback | Exploration | 計画がない場合 |

### Memory System (3-tier)

| Tier | Max | Decay | Purpose |
|------|-----|-------|---------|
| Working | 50 | Fast | 直近のイベント |
| Episodic | 200 | By importance | 重要な過去の出来事 |
| Longterm | ∞ | None | 最重要記憶 |

記憶はLLMプロンプトに注入され、意思決定と会話に影響を与える。

### Relationships

```
sentiment: -100 ~ +100  (感情)
trust:        0 ~ 100   (信頼)
familiarity:  0 ~ 100   (親密度)
roles: ['parent', 'spouse', 'rival', ...]
```

- 性格の類似度 → 相性スコア (0-1)
- 共通の政治/経済思想 → ボーナス
- 50+ ticks 無交流 → 感情自然減衰

### 4X Strategy (Village Leaders)

村のリーダーはLLMを使って自律的に4X戦略を実行:

- **eXplore**: 地形偵察、資源発見
- **eXpand**: 建設 (25種の建物)、人口増加
- **eXploit**: 資源生産、技術研究 (30種・3分岐×10段階)
- **eXterminate**: 軍事訓練 (10種のユニット)、戦闘、外交

### Victory Conditions (5 types)

| Type | Condition |
|------|-----------|
| **Culture** | total_culture_points ≥ 1,000,000 |
| **Domination** | 全村の75%以上を支配 |
| **Diplomacy** | 他村の60%以上と同盟 |
| **Tech Mastery** | 3分岐全てのTier 10技術を研究 |
| **Score** | Tick 12,000 到達時の最高スコア |

### On-chain Game Definitions

**25 Buildings** (4カテゴリ):
- Economy (8): farm, granary, lumber_mill, mine, market, warehouse, irrigation_canal, mint
- Military (7): barracks, archery_range, stable, wall, watchtower, forge, siege_workshop
- Culture (6): temple, library, school, theater, monument, academy
- Infrastructure (4): house, well, road, meeting_hall

**30 Technologies** (3 branches × 10 tiers):
- Agriculture: agriculture → irrigation → ... → agriculture_mastery
- Military: bronze_working → archery → ... → military_mastery
- Culture: writing → philosophy → ... → culture_mastery

**10 Units**: militia, warrior, archer, spearman, cavalry, siege_ram, catapult, knight, musketeer, elite_guard

### Player Interaction

- **Voice of God**: エージェント・村・世界全体に意図を送信
- **Strength levels**: whisper (囁き) / suggestion (提案) / decree (命令)
- 意図はLLMプロンプトに注入され、エージェントの行動に影響
- **Agent Deployer**: soul（魂）と rules（行動ルール）を設定して新エージェントを投入

### LLM Cost Optimization

| Context | Model | Cost |
|---------|-------|------|
| Daily Plan (routine) | Haiku 4.5 | Low |
| Conversation (social) | Sonnet 4.6 | Medium |
| Strategy (important) | Sonnet 4.6 | Medium |

- LRU caching for daily plans
- Token bucket rate limiting
- USD cost tracking per session

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/game` | Create new game |
| GET | `/api/v1/game/:id` | Get game state |
| POST | `/api/v1/game/:id/start` | Start simulation |
| POST | `/api/v1/game/:id/pause` | Pause simulation |
| POST | `/api/v1/game/:id/speed` | Set simulation speed |
| POST | `/api/v1/game/:id/save` | Save game to file |
| POST | `/api/v1/game/load` | Load game from file |
| GET | `/api/v1/game/:id/stats` | Get world statistics |
| GET | `/api/v1/game/:id/chronicle` | Generate world chronicle |
| GET | `/api/v1/world/:id/chunks` | Get visible map chunks |
| GET | `/api/v1/agent/:gameId/:agentId` | Get agent details |
| POST | `/api/v1/player/:id/intention` | Send player intention |
| WS | `/ws?gameId=xxx` | Real-time game updates |

## WebSocket Messages

**Server → Client**: `tick`, `agents_update`, `chunk_update`, `event`, `dialogue`, `village_update`, `stats_update`

**Client → Server**: `subscribe_chunks`, `unsubscribe_chunks`
111
## On-chain Architecture

全てのゲームルール・状態・検証はStarknetスマートコントラクト上に存在する。LLMエージェントはオフチェーンで思考し、トランザクションを送信するだけ — 改ざん不可能。

```
Off-chain (Server)              On-chain (Starknet/Katana)
┌─────────────────┐             ┌─────────────────────────┐
│ LLM Agent       │─── tx ───→ │ Systems                 │
│ (Claude API)    │             │  physics (L0 clamp)     │
│                 │             │  village_tick (resources) │
│ Keeper Bot      │─── tick ──→│  commands (build/train)  │
│ (auto-advance)  │             │  combat (attack)        │
│                 │             │  covenant_sys (L1)      │
│ Torii Client    │← subscribe │  invention_sys (L2)     │
│ (GraphQL)       │             │  institution_sys (L3)   │
└─────────────────┘             │  victory (5 types)      │
                                │  setup (definitions)    │
                                └─────────────────────────┘
```

### Fixed-Point Arithmetic

Cairo has no floats. All decimal values use **×1000 scale**:

| Value | Cairo (×1000) | Example |
|-------|--------------|---------|
| `0.5` | `500` | food upkeep |
| `0.02` | `20` | population growth rate |
| `2.0` | `2000` | effect bound max |

## License

MIT
