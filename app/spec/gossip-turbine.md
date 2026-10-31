Overview only.
- **Gossip** propagates cluster metadata (contact info, votes) between nodes ([Agave docs: gossip](https://docs.anza.xyz/validator/gossip)) — TODO: verify link.
- **Turbine** fans shreds out through a stake-weighted tree ([Agave docs](https://docs.anza.xyz/consensus/turbine-block-propagation)). The weighted shuffle uses ChaCha with 8 rounds (**SIMD-0332**, previously 20).
