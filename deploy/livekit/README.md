# LiveKit voice (START+)

Self-hosted LiveKit SFU + Redis for Discord-like voice rooms on the Timeweb VPS.

## One-shot bring-up

```bash
# from repo root, with VPS_ROOT_PASSWORD set
python scripts/vps_livekit_up.py
python scripts/vps_patch_voice.py
python scripts/vps_voice_smoke.py
```

## Ports

| Port | Proto | Role |
|------|-------|------|
| 7880 | TCP | LiveKit signaling (localhost + nginx :8443) |
| 7881 | TCP | RTC over TCP |
| 50000–50050 | UDP | RTC media |
| 6379 | TCP | Redis (127.0.0.1 only) |
| 8443 | TCP | Public WSS `wss://www.startdota.ru:8443` |

## App env (written by `vps_livekit_up.py`)

- `LIVEKIT_URL` / `NEXT_PUBLIC_LIVEKIT_URL` — `wss://www.startdota.ru:8443`
- `LIVEKIT_INTERNAL_URL` — `http://127.0.0.1:7880`
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — must match `livekit.yaml` keys

No recording/egress is enabled.
