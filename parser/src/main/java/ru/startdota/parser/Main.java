package ru.startdota.parser;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import skadistats.clarity.model.CombatLogEntry;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.model.StringTable;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.processor.stringtables.StringTables;
import skadistats.clarity.processor.stringtables.UsesStringTable;
import skadistats.clarity.source.InputStreamSource;
import skadistats.clarity.wire.dota.common.proto.DOTACombatLog.DOTA_COMBATLOG_TYPES;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Locale;

/**
 * Парсер демок Dota 2 для СТАРТ+ на базе clarity 4 (как у OpenDota). Нужна Java 21.
 *
 *   java -jar startplus-parser.jar match.dem        — разобрать файл, JSON в stdout
 *   java -jar startplus-parser.jar --serve 5600     — HTTP: POST /parse (тело = .dem), GET /health
 *
 * Читает итоговое состояние матча: герои, K/D/A, уровень, нетворс, ласт-хиты,
 * урон, предметы, Steam ID игроков, победитель и длительность.
 */
@UsesEntities
@UsesStringTable("EntityNames")
public class Main {

    private static final long STEAM_ID_BASE = 76561197960265728L;
    private static final int INVALID_HANDLE = 0xFFFFFF;

    public static void main(String[] args) throws Exception {
        if (args.length >= 1 && "--serve".equals(args[0])) {
            int port = args.length >= 2 ? Integer.parseInt(args[1]) : 5600;
            serve(port);
            return;
        }
        if (args.length < 1) {
            System.err.println("usage: startplus-parser <file.dem> | --serve <port>");
            System.exit(2);
        }
        System.out.println(parseFile(Path.of(args[0])));
    }

    /* ---------------- Сбор по ходу демки ---------------- */

    /** Урон по героям / зданиям и лечение — из комбат-лога, ключ = имя юнита героя (npc_dota_hero_*) */
    private final Map<String, Long> heroDamage = new HashMap<>();
    private final Map<String, Long> towerDamage = new HashMap<>();
    private final Map<String, Long> healing = new HashMap<>();

    /** Драфт: порядок появления банов и пиков в правилах игры */
    private final List<String> draft = new ArrayList<>();
    private final Set<String> draftSeen = new HashSet<>();
    private boolean draftDone = false;

    @OnCombatLogEntry
    public void onCombatLog(Context ctx, CombatLogEntry e) {
        try {
            DOTA_COMBATLOG_TYPES type = e.getType();
            if (!e.isAttackerHero() || e.isAttackerIllusion()) return;
            String attacker = e.getAttackerName();
            String target = e.getTargetName();
            if (attacker == null) return;
            long v = Math.max(0, e.getValue());
            if (type == DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_DAMAGE) {
                if (e.isTargetHero() && !e.isTargetIllusion()) {
                    heroDamage.merge(attacker, v, Long::sum);
                } else if (target != null && isBuilding(target)) {
                    towerDamage.merge(attacker, v, Long::sum);
                }
            } else if (type == DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_HEAL) {
                if (e.isTargetHero() && !e.isTargetIllusion() && !attacker.equals(target)) {
                    healing.merge(attacker, v, Long::sum);
                }
            }
        } catch (Exception ignored) { }
    }

    private static boolean isBuilding(String name) {
        return name.contains("tower") || name.contains("rax") || name.contains("barracks")
                || name.contains("fort") || name.contains("_melee_rax") || name.contains("_range_rax")
                || name.contains("filler") || name.contains("effigy") || name.contains("watch_tower");
    }

    @OnTickStart
    @UsesEntities
    public void onTick(Context ctx, boolean synthetic) {
        if (draftDone) return;
        try {
            Entities entities = ctx.getProcessor(Entities.class);
            if (entities == null) return;
            Entity rules = entities.getByDtName("CDOTAGamerulesProxy");
            if (rules == null) return;
            Integer state = num(rules, "m_pGameRules.m_nGameState");
            // 4+ = стратегия/подготовка/игра: драфт закончен (ещё пару секунд дочитываем)
            Integer active = num(rules, "m_pGameRules.m_iActiveTeam");
            for (int i = 0; i < 24; i++) {
                String path = i < 14
                        ? "m_pGameRules.m_BannedHeroes." + String.format(Locale.ROOT, "%04d", i)
                        : "m_pGameRules.m_SelectedHeroes." + String.format(Locale.ROOT, "%04d", i - 14);
                Integer hero = num(rules, path);
                if (hero == null || hero <= 0) continue;
                boolean pick = i >= 14;
                String key = (pick ? "p" : "b") + hero;
                if (!draftSeen.add(key)) continue;
                draft.add(new Json()
                        .put("order", draft.size() + 1)
                        .put("heroId", hero)
                        .put("pick", pick)
                        .put("team", active != null && (active == 2 || active == 3) ? (active == 2 ? "RADIANT" : "DIRE") : null)
                        .toString());
            }
            if (state != null && state >= 5) draftDone = true;
        } catch (Exception ignored) { }
    }

    /* ---------------- HTTP ---------------- */

    private static void serve(int port) throws Exception {
        String host = System.getenv().getOrDefault("PARSER_HOST", "127.0.0.1");
        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.createContext("/health", ex -> respond(ex, 200, "{\"ok\":true}"));
        server.createContext("/parse", Main::handleParse);
        server.setExecutor(null); // по одной демке за раз — разбор тяжёлый
        server.start();
        System.out.println("startplus-parser listening on http://" + host + ":" + port);
    }

    private static void handleParse(HttpExchange ex) {
        Path tmp = null;
        try {
            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                respond(ex, 405, "{\"ok\":false,\"error\":\"POST only\"}");
                return;
            }
            tmp = Files.createTempFile("startplus-", ".dem");
            try (InputStream in = ex.getRequestBody()) {
                Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
            }
            if (Files.size(tmp) < 1024) {
                respond(ex, 400, "{\"ok\":false,\"error\":\"Файл пустой или это не демка\"}");
                return;
            }
            respond(ex, 200, parseFile(tmp));
        } catch (Throwable t) {
            t.printStackTrace();
            respond(ex, 500, "{\"ok\":false,\"error\":" + Json.str(String.valueOf(t.getMessage())) + "}");
        } finally {
            if (tmp != null) {
                try { Files.deleteIfExists(tmp); } catch (Exception ignored) { }
            }
        }
    }

    private static void respond(HttpExchange ex, int code, String body) {
        try {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            ex.sendResponseHeaders(code, bytes.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
        } catch (Exception ignored) {
        } finally {
            ex.close();
        }
    }

    /* ---------------- Разбор ---------------- */

    public static synchronized String parseFile(Path file) throws Exception {
        Main processor = new Main();
        try (InputStream in = new java.io.BufferedInputStream(Files.newInputStream(file), 1 << 20)) {
            Context ctx = new SimpleRunner(new InputStreamSource(in)).runWith(processor).getContext();
            return processor.summary(ctx);
        }
    }

    private String summary(Context ctx) {
        Entities entities = ctx.getProcessor(Entities.class);
        StringTables tables = ctx.getProcessor(StringTables.class);
        StringTable names = tables != null ? tables.forName("EntityNames") : null;

        Entity pr = entities.getByDtName("CDOTA_PlayerResource");
        Entity radiant = entities.getByDtName("CDOTA_DataRadiant");
        Entity dire = entities.getByDtName("CDOTA_DataDire");
        Entity rules = entities.getByDtName("CDOTAGamerulesProxy");
        if (pr == null) {
            return "{\"ok\":false,\"error\":\"В демке нет данных игроков (CDOTA_PlayerResource)\"}";
        }

        Integer winner = num(rules, "m_pGameRules.m_nGameWinner");
        Float gameTime = flt(rules, "m_pGameRules.m_fGameTime");
        Float startTime = flt(rules, "m_pGameRules.m_flGameStartTime");
        int duration = (gameTime != null && startTime != null && startTime > 0)
                ? Math.max(0, Math.round(gameTime - startTime)) : 0;
        Long matchId = lng(rules, "m_pGameRules.m_unMatchID64");

        List<String> players = new ArrayList<>();
        int radiantIdx = 0, direIdx = 0, radiantKills = 0, direKills = 0;

        for (int i = 0; i < 24; i++) {
            Integer team = num(pr, idx("m_vecPlayerData.%i.m_iPlayerTeam", i));
            if (team == null || (team != 2 && team != 3)) continue;
            int teamSlot = team == 2 ? radiantIdx++ : direIdx++;
            Entity data = team == 2 ? radiant : dire;

            Long steamId = lng(pr, idx("m_vecPlayerData.%i.m_iPlayerSteamID", i));
            String name = str(pr, idx("m_vecPlayerData.%i.m_iszPlayerName", i));
            Integer heroId = num(pr, idx("m_vecPlayerTeamData.%i.m_nSelectedHeroID", i));
            Integer kills = num(pr, idx("m_vecPlayerTeamData.%i.m_iKills", i));
            Integer deaths = num(pr, idx("m_vecPlayerTeamData.%i.m_iDeaths", i));
            Integer assists = num(pr, idx("m_vecPlayerTeamData.%i.m_iAssists", i));
            Integer level = num(pr, idx("m_vecPlayerTeamData.%i.m_iLevel", i));
            if (kills != null) {
                if (team == 2) radiantKills += kills; else direKills += kills;
            }

            String d = "m_vecDataTeam." + String.format(Locale.ROOT, "%04d", teamSlot) + ".";
            Integer netWorth = num(data, d + "m_iNetWorth");
            Integer lastHits = num(data, d + "m_iLastHitCount");
            Integer denies = num(data, d + "m_iDenyCount");
            Integer gold = num(data, d + "m_iTotalEarnedGold");
            Integer xp = num(data, d + "m_iTotalEarnedXP");
            Integer heroDamage = num(data, d + "m_iHeroDamage");
            Integer towerDamage = num(data, d + "m_iTowerDamage");
            Number healing = anyNum(data, d + "m_fHealing", d + "m_iHealing");

            // Предметы — с сущности героя
            List<String> items = new ArrayList<>();
            List<String> backpack = new ArrayList<>();
            String neutral = null;
            Integer heroHandle = num(pr, idx("m_vecPlayerTeamData.%i.m_hSelectedHero", i));
            Entity hero = heroHandle != null && heroHandle != INVALID_HANDLE ? entities.getByHandle(heroHandle) : null;
            String heroUnit = hero != null ? entityName(names, hero) : null;
            if (hero != null) {
                for (int s = 0; s < 17; s++) {
                    String item = itemName(entities, names, hero, s);
                    if (s < 6) items.add(item);
                    else if (s < 9) backpack.add(item);
                    else if (s == 16) neutral = item;
                }
                if (heroId == null || heroId == 0) heroId = null;
            }

            Json p = new Json()
                    .put("playerIndex", i)
                    .put("team", team == 2 ? "RADIANT" : "DIRE")
                    .put("steamId", steamId != null && steamId > 0 ? String.valueOf(steamId) : null)
                    .put("accountId", steamId != null && steamId > STEAM_ID_BASE ? steamId - STEAM_ID_BASE : null)
                    .put("name", name)
                    .put("heroId", heroId)
                    .put("heroName", hero != null ? hero.getDtClass().getDtName() : null)
                    .put("level", level)
                    .put("kills", kills)
                    .put("deaths", deaths)
                    .put("assists", assists)
                    .put("netWorth", netWorth)
                    .put("lastHits", lastHits)
                    .put("denies", denies)
                    .put("totalGold", gold)
                    .put("totalXp", xp)
                    .put("heroUnit", heroUnit)
                    .put("heroDamage", pick(this.heroDamage, heroUnit, heroDamage))
                    .put("towerDamage", pick(this.towerDamage, heroUnit, towerDamage))
                    .put("healing", pick(this.healing, heroUnit, healing != null ? (int) Math.round(healing.doubleValue()) : null))
                    .putRaw("items", Json.arr(items))
                    .putRaw("backpack", Json.arr(backpack))
                    .put("neutralItem", neutral);
            players.add(p.toString());
        }

        return new Json()
                .put("ok", true)
                .put("matchId", matchId != null && matchId > 0 ? String.valueOf(matchId) : null)
                .put("durationSec", duration)
                .put("radiantWin", winner == null ? null : (Object) (winner == 2))
                .put("radiantScore", radiantKills)
                .put("direScore", direKills)
                .putRaw("players", "[" + String.join(",", players) + "]")
                .putRaw("draft", "[" + String.join(",", draft) + "]")
                .toString();
    }

    /** Значение из комбат-лога, если есть, иначе из сущности */
    private static Object pick(Map<String, Long> log, String unit, Integer fallback) {
        if (unit != null) {
            Long v = log.get(unit);
            if (v != null && v > 0) return v;
        }
        return fallback;
    }

    private static String entityName(StringTable names, Entity e) {
        Integer idx = num(e, "m_pEntity.m_nameStringTableIndex");
        if (idx == null) idx = num(e, "m_pEntity.m_nameStringableIndex");
        if (names != null && idx != null && idx >= 0) {
            try {
                return names.getNameByIndex(idx);
            } catch (Exception ignored) { }
        }
        return null;
    }

    private static String itemName(Entities entities, StringTable names, Entity hero, int slot) {
        Integer h = num(hero, "m_hItems." + String.format(Locale.ROOT, "%04d", slot));
        if (h == null || h == INVALID_HANDLE) return null;
        Entity item = entities.getByHandle(h);
        if (item == null) return null;
        Integer nameIdx = num(item, "m_pEntity.m_nameStringTableIndex");
        if (nameIdx == null) nameIdx = num(item, "m_pEntity.m_nameStringableIndex");
        if (names != null && nameIdx != null && nameIdx >= 0) {
            try {
                String n = names.getNameByIndex(nameIdx);
                if (n != null) return n;
            } catch (Exception ignored) { }
        }
        return item.getDtClass().getDtName();
    }

    /* ---------------- Доступ к свойствам ---------------- */

    private static String idx(String pattern, int i) {
        return pattern.replace("%i", String.format(Locale.ROOT, "%04d", i));
    }

    private static Object prop(Entity e, String name) {
        if (e == null) return null;
        try {
            FieldPath fp = e.getDtClass().getFieldPathForName(name);
            if (fp == null) return null;
            return e.getPropertyForFieldPath(fp);
        } catch (Exception ex) {
            return null;
        }
    }

    private static Integer num(Entity e, String name) {
        Object v = prop(e, name);
        return v instanceof Number ? ((Number) v).intValue() : null;
    }

    private static Long lng(Entity e, String name) {
        Object v = prop(e, name);
        return v instanceof Number ? ((Number) v).longValue() : null;
    }

    private static Float flt(Entity e, String name) {
        Object v = prop(e, name);
        return v instanceof Number ? ((Number) v).floatValue() : null;
    }

    private static Number anyNum(Entity e, String... names) {
        for (String n : names) {
            Object v = prop(e, n);
            if (v instanceof Number) return (Number) v;
        }
        return null;
    }

    private static String str(Entity e, String name) {
        Object v = prop(e, name);
        return v == null ? null : String.valueOf(v);
    }

    /* ---------------- Мини-JSON без зависимостей ---------------- */

    static final class Json {
        private final StringBuilder sb = new StringBuilder("{");
        private boolean first = true;

        Json put(String key, Object value) {
            String v;
            if (value == null) v = "null";
            else if (value instanceof Number || value instanceof Boolean) v = String.valueOf(value);
            else v = str(String.valueOf(value));
            return putRaw(key, v);
        }

        Json putRaw(String key, String raw) {
            if (!first) sb.append(',');
            first = false;
            sb.append(str(key)).append(':').append(raw);
            return this;
        }

        @Override
        public String toString() {
            return sb + "}";
        }

        static String arr(List<String> values) {
            StringBuilder b = new StringBuilder("[");
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) b.append(',');
                String v = values.get(i);
                b.append(v == null ? "null" : str(v));
            }
            return b.append(']').toString();
        }

        static String str(String s) {
            StringBuilder b = new StringBuilder("\"");
            for (char c : s.toCharArray()) {
                switch (c) {
                    case '"' -> b.append("\\\"");
                    case '\\' -> b.append("\\\\");
                    case '\n' -> b.append("\\n");
                    case '\r' -> b.append("\\r");
                    case '\t' -> b.append("\\t");
                    default -> {
                        if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                        else b.append(c);
                    }
                }
            }
            return b.append('"').toString();
        }
    }
}
