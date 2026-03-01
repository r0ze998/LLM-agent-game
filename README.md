# Murasato

AI-autonomous JRPG village builder — LLM agents autonomously live, reproduce, and build civilizations in a 4X simulator.

Players observe the world as "God" and send intentions via the "Voice of God." Agents have unique personalities and philosophies, self-organize into societies, and develop civilizations through covenants, inventions, and institutions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Starknet (Katana devnet / Sepolia testnet) + Dojo v1.5 + Cairo 2.10 |
| **Frontend** | React 19 + Vite + Zustand + Canvas2D |
| **Server** | Hono + Bun + WebSocket |
| **AI** | Anthropic Claude / OpenAI / Ollama (local) |
| **Wallet** | ArgentX / Braavos (Sepolia) or Katana dev account |
| **CI/CD** | GitHub Actions |
| **Monorepo** | Bun workspaces (`shared` / `server` / `frontend`) |

## Quick Start

```bash
# Install dependencies
bun install

# Copy and edit environment variables
cp .env.example .env
# Set ANTHROPIC_API_KEY (or OPENAI_API_KEY, or use Ollama)

# Start server (port 3001)
bun run dev

# Start frontend (port 5176) — separate terminal
bun run dev:front
```

Open http://localhost:5176 to play.

### Headless Mode (no browser)

```bash
HEADLESS=true HEADLESS_SPEED=4 bun run dev
```

### Docker

```bash
# Server only
docker compose up

# With Katana + Torii (on-chain mode)
docker compose --profile dojo up
```

### On-chain Mode (optional)

#### Katana (local devnet)

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

#### Sepolia Testnet

```bash
# 1. Fund a Sepolia account (https://starknet-faucet.vercel.app/)
# 2. Edit packages/contracts/dojo_sepolia.toml with your account
# 3. Deploy
./scripts/deploy-sepolia.sh

# 4. Set frontend env
#    Copy packages/frontend/.env.sepolia → .env.local
#    Fill in VITE_WORLD_ADDRESS from deploy output

# 5. Enable server bridge in .env
DOJO_ENABLED=true
DOJO_RPC_URL=https://starknet-sepolia.public.blastapi.io
DOJO_MANIFEST_PATH=../../contracts/manifest_sepolia.json
```

Browser wallets (ArgentX / Braavos) connect automatically on Sepolia profile.

### Environment Variables

```bash
# Server
PORT=3001
CORS_ORIGIN=http://localhost:5176

# LLM Provider — "anthropic" | "openai" | "ollama"
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
# OPENAI_API_KEY=sk-xxx
# OLLAMA_BASE_URL=http://localhost:11434/v1
# OLLAMA_MODEL=qwen2.5:3b

# Headless mode
# HEADLESS=true
# HEADLESS_SPEED=4

# Dojo on-chain bridge (optional)
# DOJO_ENABLED=true
# DOJO_RPC_URL=http://localhost:5050
```

Without an LLM API key, agents use fallback daily plans instead of LLM-generated decisions.

## Project Structure

```
packages/
├── contracts/       Starknet Dojo smart contracts (Cairo)
│   ├── src/models/        Village, Building, Technology, Military,
│   │                      Covenant, Invention, Institution, Diplomacy
│   ├── src/systems/       physics, village_tick, commands, combat,
│   │                      covenant, invention, institution, victory, setup
│   ├── dojo_dev.toml      Katana devnet profile
│   └── dojo_sepolia.toml  Sepolia testnet profile
│
├── shared/          Types, constants, game rules & on-chain ID mappings
│   └── src/
│       ├── types.ts / types4x.ts / constants.ts / commands.ts
│       ├── dojoSync.ts          Building/Tech/Unit ID maps + VillageIdMapper
│       └── rules/               buildings(25), techs(30), units(10),
│                                physics, terrain, victory
│
├── server/          Hono + Bun game server
│   └── src/
│       ├── agent/         LLM integration (multi-provider), decision engine,
│       │                  memory, lifecycle
│       ├── engine/        4X strategy: rules, commands, combat, AI, victory
│       ├── world/         Simulation: tick loop, map, pathfinding, resources
│       ├── social/        Governance, relationships, conversation, culture,
│       │                  diplomacy, migration, religion, information
│       ├── services/
│       │   ├── tickService, wsManager, saveService, eventStore, statsService
│       │   └── dojo/      On-chain bridge, state reader, manifest parser
│       └── routes/        REST API + dojo-config endpoint
│
└── frontend/        React + Vite UI
    └── src/
        ├── components/
        │   ├── world/     Canvas2D map, tile/agent/building renderers
        │   └── ui/        Dashboard, AgentInspector, IntentionPanel,
        │                  StrategyPanel, WalletConnect, VictoryPanel, ...
        ├── store/         Zustand: gameStore, uiStore, walletStore
        └── services/      API client, WebSocket, Dojo state sync,
                           Starknet provider

scripts/               deploy-sepolia.sh, test-onchain.ts
.github/workflows/     CI (typecheck, test, build)
docker-compose.yml     Docker deployment (optional Katana + Torii)
```

## Game Systems

### 4-Layer Autonomous World

| Layer | Name | Description |
|-------|------|-------------|
| **L0** | Physics | Immutable laws. 18 effect types with bounds, cost floors, decay rates |
| **L1** | Covenants | Village laws & treaties. 13 clause types with effect transforms |
| **L2** | Inventions | Player/AI-defined new buildings, techs, units. Physics-validated |
| **L3** | Institutions | Cross-village organizations (guilds, religions, alliances, academies) |

### Environmental & Spatial Systems

| Feature | Description |
|---------|-------------|
| **Army Movement** | A* pathfinding. Auto-combat on arrival |
| **Territory** | Culture point expansion. Outpost-based diamond claims |
| **Environment** | Terrain types (plains, forest, mountain, water, swamp) with resource yields |
| **Disasters** | Drought, flood, plague, locust, earthquake. Periodic random events |
| **Trade** | Inter-village trade routes. Distance + road bonuses |

### Social Dynamics

| Feature | Description |
|---------|-------------|
| **Migration** | Agents relocate when dissatisfaction exceeds threshold |
| **Religion** | Emergent religions. Cultural exchange propagation |
| **Information** | Conversation-based knowledge transfer. Auto-pruned at 200 ticks |
| **Generations** | Governance inheritance, elder wisdom, periodic reflection |

### Agents

Agents act autonomously based on initial parameters:

- **Personality (immutable)**: 5 axes — openness, agreeableness, conscientiousness, courage, ambition
- **Philosophy (evolving)**: Political ideology, economic theory, values, worldview
- **Skills**: farming, building, crafting, leadership, combat, diplomacy, teaching, healing
- **Needs**: hunger, energy, social (decay each tick)
- **Lifecycle**: child -> adult (200) -> elder -> death (800-1500 ticks)
- **Blueprint**: `soul` (backstory) + `rules` (behavioral constraints)

### Decision Engine (3 tiers)

| Priority | Method | Trigger |
|----------|--------|---------|
| P2 Instinct | Rule-based | hunger < 20 -> eat, energy < 15 -> sleep |
| P1 Daily Plan | LLM (1/day) | 24-slot schedule + social intentions |
| P0 Fallback | Exploration | When no plan exists |

### Victory Conditions (5 types)

| Type | Condition |
|------|-----------|
| **Culture** | total_culture_points >= 1,000,000 |
| **Domination** | Control >= 75% of all villages |
| **Diplomacy** | Allied with >= 60% of other villages |
| **Tech Mastery** | All Tier 10 techs across 3 branches |
| **Score** | Highest score at tick 12,000 |

### Player Interaction

- **Voice of God**: Send intentions to agents, villages, or the entire world
- **Strength levels**: whisper / suggestion / decree
- **Agent Deployer**: Set soul (backstory) and rules (behavior) for new agents

### LLM Cost Optimization

| Provider | Model | Cost |
|----------|-------|------|
| Anthropic | Haiku 4.5 (daily plan) / Sonnet 4.6 (conversation) | Low-Medium |
| OpenAI | gpt-4o-mini (configurable) | Low-Medium |
| Ollama | qwen2.5:3b (configurable, local) | Free |

- USD cost tracking with configurable caps
- LRU caching for daily plans + token bucket rate limiting
- Budget exceeded -> agents gracefully degrade to instinct mode

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
| GET | `/api/v1/game/:id/stats` | World statistics |
| GET | `/api/v1/agent/:gameId/:agentId` | Agent details |
| POST | `/api/v1/player/:id/intention` | Send player intention |
| GET | `/api/v1/strategy/dojo-config/:gameId` | Dojo contract config (for frontend) |
| WS | `/ws?gameId=xxx` | Real-time game updates |

## WebSocket Messages

**Server -> Client**: `tick`, `agents_update`, `chunk_update`, `event`, `dialogue`, `village_update`, `stats_update`

**Client -> Server**: `subscribe_chunks`, `unsubscribe_chunks`

## License

MIT
