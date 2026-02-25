# 村里 (Murasato)

AI自己繁殖JRPGビレッジビルダー — LLMエージェントが自律的に生活・繁殖・村を建設するシミュレーター。

プレイヤーは「神」の視点から世界を観察し、「天の声」でエージェントに意図を伝える。エージェントたちは独自の性格・哲学を持ち、自己組織化する社会を形成していく。

## Tech Stack

- **Frontend**: React 19 + Vite + Zustand + Canvas2D
- **Server**: Hono + Bun + WebSocket
- **AI**: Anthropic Claude API (Haiku 4.5 / Sonnet 4.6)
- **Shared**: TypeScript monorepo (Bun workspaces)

## Quick Start

```bash
# Install dependencies
bun install

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
├── shared/          Types & constants shared between server and frontend
│   └── src/
│       ├── types.ts       All type definitions (~330 lines)
│       └── constants.ts   Game constants
│
├── server/          Hono + Bun game server
│   └── src/
│       ├── index.ts           Entry point (HTTP + WebSocket)
│       ├── agent/             LLM integration & agent AI
│       │   ├── llmClient.ts       Claude API wrapper (cache, rate limit, cost tracking)
│       │   ├── decisionEngine.ts  3-tier decision: instinct → daily plan → LLM
│       │   ├── prompts.ts         Japanese prompt templates
│       │   ├── memory.ts          In-memory 3-tier memory (working/episodic/longterm)
│       │   └── lifecycle.ts       Birth, aging, reproduction, death, skill growth
│       ├── world/             World simulation
│       │   ├── simulation.ts      Main tick loop (12 phases per tick)
│       │   ├── map.ts             Perlin noise terrain generation
│       │   ├── pathfinding.ts     A* pathfinding
│       │   ├── resources.ts       Resource gathering & regeneration
│       │   └── building.ts        Construction system
│       ├── social/            Social systems
│       │   ├── governance.ts      Village founding, elections, laws
│       │   ├── relationships.ts   Sentiment, trust, familiarity
│       │   ├── conversation.ts    LLM-generated agent dialogue
│       │   ├── culture.ts         Cultural evolution (traditions, stories, taboos)
│       │   └── diplomacy.ts       Inter-village relations, trade, war/peace
│       ├── services/          Runtime services
│       │   ├── tickService.ts     Simulation loop & WebSocket broadcast
│       │   ├── wsManager.ts       WebSocket connection management
│       │   ├── statsService.ts    World statistics computation
│       │   └── saveService.ts     JSON save/load
│       ├── routes/            REST API endpoints
│       │   ├── game.ts            Game CRUD, save/load, stats, chronicle
│       │   ├── world.ts           Map chunks, village data
│       │   ├── agent.ts           Agent details
│       │   └── player.ts          Player intentions
│       ├── handlers/
│       │   └── wsHandler.ts       WebSocket message handling
│       ├── player/
│       │   └── chronicle.ts       LLM-generated world history narrative
│       ├── art/
│       │   └── spriteGenerator.ts Procedural sprite generation pipeline
│       └── db/
│           ├── schema.ts          Drizzle ORM schema (future DB persistence)
│           └── index.ts           DB connection placeholder
│
└── frontend/        React + Vite UI
    └── src/
        ├── App.tsx                Main app (title screen + game view)
        ├── components/
        │   ├── world/
        │   │   ├── WorldCanvas.tsx     Canvas2D map renderer
        │   │   ├── TileRenderer.ts     Tile drawing
        │   │   ├── AgentSprite.ts      Agent rendering
        │   │   └── BuildingSprite.ts   Building rendering
        │   └── ui/
        │       ├── DashboardPanel.tsx   Statistics dashboard
        │       ├── AgentInspector.tsx    Agent status panel
        │       ├── VillagePanel.tsx      Village list
        │       ├── IntentionPanel.tsx    Player "voice of god" input
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

### Agents

- **Personality** (immutable): 5 axes — openness, agreeableness, conscientiousness, courage, ambition
- **Philosophy** (evolves): governance preference, economic ideology, values, worldview
- **Skills** (grow through use): farming, building, crafting, leadership, combat, diplomacy, teaching, healing
- **Needs**: hunger (decays 1/tick), energy (decays 2/tick), social (decays 0.5/tick)
- **Lifecycle**: child → adult (age 200) → elder → death (lifespan 800–1500 ticks)

### Decision Engine (3 tiers)

| Priority | Method | Trigger |
|----------|--------|---------|
| P2 Instinct | Rule-based | hunger < 20 → eat, energy < 15 → sleep |
| P1 Daily Plan | LLM (1/day) | Generates 24-slot schedule |
| P0 Fallback | Exploration | When no plan applies |

### Villages

- **Founding**: 3+ agents near each other for 20+ ticks → LLM names the village
- **Governance**: Elections every 50 ticks; laws proposed and voted by residents
- **Culture**: Traditions, oral stories, taboos — evolve over time and spread between villages

### Diplomacy

- Village relations: friendly ↔ neutral ↔ hostile ↔ war (tension-based auto-transitions)
- Trade agreements based on resource surplus/deficit analysis
- Alliances formed through shared governance philosophy

### Player Interaction

- **Voice of God**: Send intentions to agents, villages, or the whole world
- **Strength levels**: whisper / suggestion / decree
- Intentions are injected into agent LLM prompts during decision-making

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

Server broadcasts: `tick`, `agents_update`, `chunk_update`, `event`, `dialogue`, `village_update`, `stats_update`

Client sends: `subscribe_chunks`, `unsubscribe_chunks`

## Architecture Notes

- **All game state is in-memory** — no database required for basic operation. DB schema (`db/schema.ts`) exists for future PostgreSQL persistence.
- **LLM costs are managed** via model selection (Haiku for routine, Sonnet for important decisions), LRU caching, and rate limiting.
- **World updates are chunk-based** — frontend subscribes to visible 16×16 tile chunks only.

## License

MIT
