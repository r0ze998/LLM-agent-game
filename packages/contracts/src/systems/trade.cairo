// ============================================================
//  systems/trade.cairo — Trade system (propose, accept, cancel,
//  trade routes, per-tick execution).
// ============================================================

use autonomous_world::types::DiplomacyStatus;

#[starknet::interface]
pub trait ITrade<T> {
    fn propose_trade(
        ref self: T,
        from_village: u32,
        to_village: u32,
        offer_food: u128,
        offer_wood: u128,
        offer_stone: u128,
        offer_iron: u128,
        offer_gold: u128,
        request_food: u128,
        request_wood: u128,
        request_stone: u128,
        request_iron: u128,
        request_gold: u128,
    );
    fn accept_trade(ref self: T, trade_id: u32);
    fn cancel_trade(ref self: T, trade_id: u32);
    fn create_trade_route(
        ref self: T,
        from_village: u32,
        to_village: u32,
        send_food: u128,
        send_wood: u128,
        send_stone: u128,
        send_iron: u128,
        send_gold: u128,
        recv_food: u128,
        recv_wood: u128,
        recv_stone: u128,
        recv_iron: u128,
        recv_gold: u128,
    );
    fn execute_trade_tick(ref self: T, route_ids: Array<u32>);
}

#[dojo::contract]
pub mod trade_sys {
    use starknet::{ContractAddress, get_caller_address};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;
    use super::{ITrade, DiplomacyStatus};
    use autonomous_world::models::village::Village;
    use autonomous_world::models::diplomacy::DiplomaticRelation;
    use autonomous_world::models::trade::{TradeOffer, TradeRoute, TradeCounter};
    use autonomous_world::models::config::GameConfig;

    // ── Events ──

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct TradeProposed {
        #[key]
        trade_id: u32,
        from_village: u32,
        to_village: u32,
        tick: u64,
    }

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct TradeAccepted {
        #[key]
        trade_id: u32,
        from_village: u32,
        to_village: u32,
        tick: u64,
    }

    #[dojo::event]
    #[derive(Drop, Serde)]
    struct TradeExecuted {
        #[key]
        route_id: u32,
        from_village: u32,
        to_village: u32,
        tick: u64,
    }

    // ── Implementation ──

    #[abi(embed_v0)]
    impl TradeImpl of ITrade<ContractState> {
        fn propose_trade(
            ref self: ContractState,
            from_village: u32,
            to_village: u32,
            offer_food: u128,
            offer_wood: u128,
            offer_stone: u128,
            offer_iron: u128,
            offer_gold: u128,
            request_food: u128,
            request_wood: u128,
            request_stone: u128,
            request_iron: u128,
            request_gold: u128,
        ) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();

            // Owner check
            let village: Village = world.read_model(from_village);
            InternalImpl::assert_owner(village.owner, caller);

            // Diplomacy check: must not be at war
            let (a, b) = if from_village < to_village {
                (from_village, to_village)
            } else {
                (to_village, from_village)
            };
            let relation: DiplomaticRelation = world.read_model((a, b));
            assert!(relation.status != DiplomacyStatus::War, "Cannot trade during war");

            // Escrow: deduct offered resources from sender
            let mut from_v = village;
            assert!(from_v.food >= offer_food, "Insufficient food");
            assert!(from_v.wood >= offer_wood, "Insufficient wood");
            assert!(from_v.stone >= offer_stone, "Insufficient stone");
            assert!(from_v.iron >= offer_iron, "Insufficient iron");
            assert!(from_v.gold >= offer_gold, "Insufficient gold");

            from_v.food -= offer_food;
            from_v.wood -= offer_wood;
            from_v.stone -= offer_stone;
            from_v.iron -= offer_iron;
            from_v.gold -= offer_gold;
            world.write_model(@from_v);

            // Allocate trade ID
            let mut counter: TradeCounter = world.read_model(0_u8);
            let trade_id = counter.next_trade_id;
            counter.next_trade_id += 1;
            world.write_model(@counter);

            let game_config: GameConfig = world.read_model(0_u8);
            let tick = game_config.current_tick;

            // Create trade offer
            world.write_model(@TradeOffer {
                trade_id,
                from_village,
                to_village,
                offer_food, offer_wood, offer_stone, offer_iron, offer_gold,
                request_food, request_wood, request_stone, request_iron, request_gold,
                status: 0, // pending
                created_at_tick: tick,
            });

            world.emit_event(@TradeProposed { trade_id, from_village, to_village, tick });
        }

        fn accept_trade(ref self: ContractState, trade_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();

            let mut offer: TradeOffer = world.read_model(trade_id);
            assert!(offer.status == 0, "Trade not pending");

            // Owner check on receiver
            let to_village_data: Village = world.read_model(offer.to_village);
            InternalImpl::assert_owner(to_village_data.owner, caller);

            // Deduct requested resources from receiver
            let mut to_v = to_village_data;
            assert!(to_v.food >= offer.request_food, "Insufficient food");
            assert!(to_v.wood >= offer.request_wood, "Insufficient wood");
            assert!(to_v.stone >= offer.request_stone, "Insufficient stone");
            assert!(to_v.iron >= offer.request_iron, "Insufficient iron");
            assert!(to_v.gold >= offer.request_gold, "Insufficient gold");

            to_v.food -= offer.request_food;
            to_v.wood -= offer.request_wood;
            to_v.stone -= offer.request_stone;
            to_v.iron -= offer.request_iron;
            to_v.gold -= offer.request_gold;

            // Transfer: offered resources → receiver
            to_v.food += offer.offer_food;
            to_v.wood += offer.offer_wood;
            to_v.stone += offer.offer_stone;
            to_v.iron += offer.offer_iron;
            to_v.gold += offer.offer_gold;
            world.write_model(@to_v);

            // Transfer: requested resources → sender
            let mut from_v: Village = world.read_model(offer.from_village);
            from_v.food += offer.request_food;
            from_v.wood += offer.request_wood;
            from_v.stone += offer.request_stone;
            from_v.iron += offer.request_iron;
            from_v.gold += offer.request_gold;
            world.write_model(@from_v);

            // Update offer status
            offer.status = 1; // accepted
            world.write_model(@offer);

            let game_config: GameConfig = world.read_model(0_u8);
            world.emit_event(@TradeAccepted {
                trade_id,
                from_village: offer.from_village,
                to_village: offer.to_village,
                tick: game_config.current_tick,
            });
        }

        fn cancel_trade(ref self: ContractState, trade_id: u32) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();

            let mut offer: TradeOffer = world.read_model(trade_id);
            assert!(offer.status == 0, "Trade not pending");

            // Only sender can cancel
            let from_village_data: Village = world.read_model(offer.from_village);
            InternalImpl::assert_owner(from_village_data.owner, caller);

            // Return escrowed resources to sender
            let mut from_v = from_village_data;
            from_v.food += offer.offer_food;
            from_v.wood += offer.offer_wood;
            from_v.stone += offer.offer_stone;
            from_v.iron += offer.offer_iron;
            from_v.gold += offer.offer_gold;
            world.write_model(@from_v);

            offer.status = 2; // cancelled
            world.write_model(@offer);
        }

        fn create_trade_route(
            ref self: ContractState,
            from_village: u32,
            to_village: u32,
            send_food: u128,
            send_wood: u128,
            send_stone: u128,
            send_iron: u128,
            send_gold: u128,
            recv_food: u128,
            recv_wood: u128,
            recv_stone: u128,
            recv_iron: u128,
            recv_gold: u128,
        ) {
            let mut world = self.world(@"aw");
            let caller = get_caller_address();

            let village: Village = world.read_model(from_village);
            InternalImpl::assert_owner(village.owner, caller);

            // Diplomacy check
            let (a, b) = if from_village < to_village {
                (from_village, to_village)
            } else {
                (to_village, from_village)
            };
            let relation: DiplomaticRelation = world.read_model((a, b));
            assert!(relation.status != DiplomacyStatus::War, "Cannot create trade route during war");

            let mut counter: TradeCounter = world.read_model(0_u8);
            let route_id = counter.next_route_id;
            counter.next_route_id += 1;
            world.write_model(@counter);

            let game_config: GameConfig = world.read_model(0_u8);

            world.write_model(@TradeRoute {
                route_id,
                from_village, to_village,
                send_food, send_wood, send_stone, send_iron, send_gold,
                recv_food, recv_wood, recv_stone, recv_iron, recv_gold,
                active: true,
                created_at_tick: game_config.current_tick,
            });
        }

        /// Execute specified trade routes (called once per game tick).
        fn execute_trade_tick(ref self: ContractState, route_ids: Array<u32>) {
            let mut world = self.world(@"aw");
            let game_config: GameConfig = world.read_model(0_u8);

            let mut i: u32 = 0;
            loop {
                if i >= route_ids.len() {
                    break;
                }
                let route_id = *route_ids.at(i);
                let route: TradeRoute = world.read_model(route_id);
                if !route.active {
                    i += 1;
                    continue;
                }

                // Check sender has enough to send AND receiver has enough to send back
                let mut from_v: Village = world.read_model(route.from_village);
                let mut to_v: Village = world.read_model(route.to_village);

                let sender_ok = from_v.food >= route.send_food
                    && from_v.wood >= route.send_wood
                    && from_v.stone >= route.send_stone
                    && from_v.iron >= route.send_iron
                    && from_v.gold >= route.send_gold;

                let receiver_ok = to_v.food >= route.recv_food
                    && to_v.wood >= route.recv_wood
                    && to_v.stone >= route.recv_stone
                    && to_v.iron >= route.recv_iron
                    && to_v.gold >= route.recv_gold;

                if sender_ok && receiver_ok {
                    // Sender: deduct sent, add received
                    from_v.food = from_v.food - route.send_food + route.recv_food;
                    from_v.wood = from_v.wood - route.send_wood + route.recv_wood;
                    from_v.stone = from_v.stone - route.send_stone + route.recv_stone;
                    from_v.iron = from_v.iron - route.send_iron + route.recv_iron;
                    from_v.gold = from_v.gold - route.send_gold + route.recv_gold;
                    world.write_model(@from_v);

                    // Receiver: add sent, deduct received
                    to_v.food = to_v.food + route.send_food - route.recv_food;
                    to_v.wood = to_v.wood + route.send_wood - route.recv_wood;
                    to_v.stone = to_v.stone + route.send_stone - route.recv_stone;
                    to_v.iron = to_v.iron + route.send_iron - route.recv_iron;
                    to_v.gold = to_v.gold + route.send_gold - route.recv_gold;
                    world.write_model(@to_v);

                    world.emit_event(@TradeExecuted {
                        route_id,
                        from_village: route.from_village,
                        to_village: route.to_village,
                        tick: game_config.current_tick,
                    });
                }

                i += 1;
            };
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(owner: ContractAddress, caller: ContractAddress) {
            let zero: ContractAddress = starknet::contract_address_const::<0>();
            if owner != zero {
                assert!(owner == caller, "Not village owner");
            }
        }
    }
}
