# 村里 (Murasato)

AI自律JRPGビレッジビルダー — LLMエージェントが自律的に生活・繁殖・村を建設する4Xシミュレーター。

プレイヤーは「神」の視点から世界を観察し、「天の声」でエージェントに意図を伝える。エージェントたちは独自の性格・哲学を持ち、自己組織化する社会を形成し、契約・発明・制度を通じて文明を発展させていく。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Starknet (Katana) + Dojo v1.5 + Cairo 2.10 (optional) |
| **Frontend** | React 19 + Vite + Zustand + Canvas2D |
| **Server** | Hono + Bun + WebSocket |
| **AI** | Anthropic Claude / OpenAI / Ollama (ローカル) |
| **CI/CD** | GitHub Actions |
| **Shared** | TypeScript monorepo (Bun workspaces) |

## Quick Start

```bash
# Install dependencies
bun install

# Copy and edit environment variables
cp .env.example .env
# → ANTHROPIC_API_KEY を設定 (or OPENAI_API_KEY, or Ollama)

# Start server (port 3001)
cd packages/server && bun run dev

# Start frontend (port 5176) — in a separate terminal
cd packages/frontend && bun run dev
```

Open http://localhost:5176 and click "始める" to start a new game.

### Headless Mode (no browser needed)

```bash
HEADLESS=true HEADLESS_SPEED=4 bun run --filter '@murasato/server' dev
```

### Docker

```bash
# Basic (server + frontend)
docker compose up

# With Katana/Dojo on-chain
docker compose --profile dojo up
```

### On-chain Mode (optional)

Katana/Dojo はオプション。有効にするには:

```bash
# Start local Starknet node
katana --dev --dev.seed 0 --dev.no-fee

# Build & deploy contracts
cd packages/contracts
sozo build && sozo migrate --profile dev
sozo execute aw-setup register_all

# Enable in .env
DOJO_ENABLED=true
```

### Environment Variables

Copy `.env.example` to `.env` in the project root:

```bash
# Server
PORT=3001
CORS_ORIGIN=http://localhost:5176

# LLM Provider — "anthropic" | "openai" | "ollama"
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx         # Required for anthropic
# OPENAI_API_KEY=sk-xxx              # Required for openai
# OPENAI_MODEL=gpt-4o-mini
# OLLAMA_BASE_URL=http://localhost:11434/v1
# OLLAMA_MODEL=qwen2.5:3b

# Headless mode
# HEADLESS=true
# HEADLESS_SPEED=4
```

Without an LLM API key, agents use fallback daily plans instead of LLM-generated decisions.

## Project Structure

```
packages/
├── contracts/       Starknet Dojo smart contracts (Cairo)
│   └── src/
│       ├── models/        Village, Building, Technology, Military,
│       │                  Covenant, Invention, Institution, Diplomacy, Config
│       └── systems/       physics, village_tick, commands, combat,
│                          covenant, invention, institution, victory, setup
│
├── shared/          Types, constants & game rules
│   └── src/
│       ├── types.ts / types4x.ts / constants.ts / commands.ts
│       └── rules/         buildings(25), techs(30), units(10), physics, terrain, victory
│
├── server/          Hono + Bun game server
│   └── src/
│       ├── agent/         LLM integration (multi-provider), decision engine, memory, lifecycle
│       ├── engine/        4X strategy: rules, commands, combat, AI strategy, victory
│       ├── world/         Simulation: tick loop, map, pathfinding, resources
│       ├── social/        Governance, relationships, conversation, culture, diplomacy,
│       │                  migration, religion, information network
│       ├── services/
│       │   ├── tickService, wsManager, saveService, eventStore, statsService
│       │   └── dojo/      On-chain bridge (Starknet TX submitter)
│       └── routes/        REST API endpoints
│
└── frontend/        React + Vite UI
    └── src/
        ├── components/
        │   ├── world/     Canvas2D map, tile/agent/building renderers
        │   └── ui/        Dashboard, AgentInspector, IntentionPanel, StrategyPanel,
        │                  VictoryPanel, TechTreeViewer, DiplomacyOverlay, Minimap, ...
        ├── store/         Zustand: gameStore, uiStore, walletStore
        └── services/      API client, WebSocket, Dojo state sync

scripts/               E2E test scripts (test-onchain.ts)
.github/workflows/     CI/CD (ci.yml)
docker-compose.yml     Docker deployment
```

## Game Systems

### 4-Layer Autonomous World

| Layer | Name | Description |
|-------|------|-------------|
| **L0** | Physics | 不変の物理法則。18種エフェクトの上下限値、コスト下限、減衰率 |
| **L1** | Covenants (契約) | 村の法律・条約。13種条項 → エフェクト変換 |
| **L2** | Inventions (発明) | プレイヤー/AIが定義する新しい建物・技術・ユニット。物理検証付き |
| **L3** | Institutions (制度) | 村横断組織（ギルド、宗教、同盟、学院）。入会条件付き |

### Environmental & Spatial Systems

| Feature | Description |
|---------|-------------|
| **Army Movement** | A*パスファインディングによる軍隊移動。到着時に自動戦闘発生 |
| **Territory** | 文化ポイント消費で隣接タイルを獲得。前哨基地によるダイヤモンド形領地主張 |
| **Environment** | 地形タイプ（平地・森・山・水・沼）に基づく資源生成と移動コスト |
| **Disasters** | 干ばつ・洪水・疫病・蝗害・地震。周期的にランダム発生し村に被害 |
| **Trade** | 村間交易。距離と道路ボーナスによるコスト計算 |

### Social Dynamics

| Feature | Description |
|---------|-------------|
| **Migration** | 不満度が閾値を超えるとエージェントが他村へ移住 |
| **Religion** | 条件を満たすと宗教が自然発生。文化交流で伝播 |
| **Information** | 会話による情報交換・伝播。200tick で自動剪定 |
| **Generations** | 統治思想の継承、長老の知恵、定期内省、政体変化 |

### Agents — 自律会話システム

エージェントは初期パラメータに基づいて**自律的に会話**する:

- **性格 (不変)**: 5軸 — openness, agreeableness, conscientiousness, courage, ambition
- **哲学 (進化)**: 政治思想、経済思想、価値観、世界観
- **スキル**: farming, building, crafting, leadership, combat, diplomacy, teaching, healing
- **ニーズ**: hunger, energy, social (各ティック減少)
- **ライフサイクル**: child → adult (200) → elder → death (800-1500 ticks)
- **ブループリント**: `soul` (魂/バックストーリー) + `rules` (行動ルール)

### Decision Engine (3 tiers)

| Priority | Method | Trigger |
|----------|--------|---------|
| P2 Instinct | Rule-based | hunger < 20 → eat, energy < 15 → sleep |
| P1 Daily Plan | LLM (1/day) | 24スロットスケジュール + socialIntentions |
| P0 Fallback | Exploration | 計画がない場合 |

### Victory Conditions (5 types)

| Type | Condition |
|------|-----------|
| **Culture** | total_culture_points >= 1,000,000 |
| **Domination** | 全村の75%以上を支配 |
| **Diplomacy** | 他村の60%以上と同盟 |
| **Tech Mastery** | 3分岐全てのTier 10技術を研究 |
| **Score** | Tick 12,000 到達時の最高スコア |

### Player Interaction

- **Voice of God**: エージェント・村・世界全体に意図を送信
- **Strength levels**: whisper (囁き) / suggestion (提案) / decree (命令)
- **Agent Deployer**: soul（魂）と rules（行動ルール）を設定して新エージェントを投入

### LLM Cost Optimization

| Provider | Context | Model | Cost |
|----------|---------|-------|------|
| Anthropic | Daily Plan | Haiku 4.5 | Low |
| Anthropic | Conversation / Strategy | Sonnet 4.6 | Medium |
| OpenAI | All | gpt-4o-mini (configurable) | Low-Medium |
| Ollama | All | qwen2.5:3b (configurable) | Free (local) |

- USD cost tracking per session with configurable caps
- LRU caching for daily plans + token bucket rate limiting
- `LLMBudgetExceeded` → agents gracefully degrade to instinct mode

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
| GET | `/api/v1/agent/:gameId/:agentId` | Get agent details |
| POST | `/api/v1/player/:id/intention` | Send player intention |
| WS | `/ws?gameId=xxx` | Real-time game updates |

## WebSocket Messages

**Server → Client**: `tick`, `agents_update`, `chunk_update`, `event`, `dialogue`, `village_update`, `stats_update`

**Client → Server**: `subscribe_chunks`, `unsubscribe_chunks`

## License

MIT
