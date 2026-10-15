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
 *   java -jar startplus-parser.jar match.dem        — разобрать файл (.dem, .dem.bz2, .dem.gz), JSON в stdout
 *   java -jar startplus-parser.jar --serve 5600     — HTTP: POST /parse (тело = .dem), GET /health
 *
 * Читает итоговое состояние матча: герои, K/D/A, уровень, нетворс, ласт-хиты, предметы, Steam ID,
 * победитель и длительность; из комбат-лога — урон (по героям, зданиям, полученный), лечение,
 * варды (поставлено/сломано), башни, Рошан, руны, байбэки, мультикиллы и серии, покупки по времени,
 * лог убийств героев; раз в минуту — нетворс и опыт (график преимущества); драфт.
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
        Path src = Path.of(args[0]);
        Path copy = Files.createTempFile("startplus-cli-", ".dem");
        Files.copy(src, copy, StandardCopyOption.REPLACE_EXISTING);
        Path dem = unpackIfCompressed(copy);
        try {
            System.out.println(parseFile(dem));
        } finally {
            Files.deleteIfExists(dem);
        }
    }

    /* ---------------- Сбор по ходу демки ---------------- */

    /** Счётчики из комбат-лога, ключ = имя юнита героя (npc_dota_hero_*) */
    private final Map<String, Long> heroDamage = new HashMap<>();
    private final Map<String, Long> towerDamage = new HashMap<>();
    private final Map<String, Long> healing = new HashMap<>();
    private final Map<String, Long> damageTaken = new HashMap<>();
    private final Map<String, Long> obsPlacedLog = new HashMap<>();
    private final Map<String, Long> senPlacedLog = new HashMap<>();
    private final Map<String, Long> obsKilled = new HashMap<>();
    private final Map<String, Long> senKilled = new HashMap<>();
    private final Map<String, Long> towerKills = new HashMap<>();
    private final Map<String, Long> roshanKills = new HashMap<>();
    private final Map<String, Long> runesLog = new HashMap<>();
    private final Map<String, Long> maxMultiKill = new HashMap<>();
    private final Map<String, Long> maxKillStreak = new HashMap<>();
    private final Map<String, Long> campsStackedLog = new HashMap<>();
    /** Байбэки по номеру игрока (значение в комбат-логе) */
    private final Map<Integer, Long> buybacks = new HashMap<>();
    /** Покупки: юнит героя → [{t, item}] (t — сек. игрового времени, без вычета старта) */
    private final Map<String, List<String>> purchases = new HashMap<>();
    /** Убийства героев: {t, killer, victim} */
    private final List<float[]> killTimes = new ArrayList<>();
    private final List<String[]> killNames = new ArrayList<>();

    /** Драфт: порядок появления банов и пиков в правилах игры */
    private final List<String> draft = new ArrayList<>();
    private final Set<String> draftSeen = new HashSet<>();
    private boolean draftDone = false;

    /** Таймлайн раз в минуту: индекс игрока → нетворс / опыт по минутам */
    private final Map<Integer, List<Integer>> nwTimeline = new HashMap<>();
    private final Map<Integer, List<Integer>> xpTimeline = new HashMap<>();
    private int nextMinute = 0;

    private static final Set<String> CHEAP_ITEMS = Set.of(
            "item_tango", "item_tango_single", "item_flask", "item_clarity", "item_enchanted_mango",
            "item_tpscroll", "item_ward_observer", "item_ward_sentry", "item_ward_dispenser", "item_dust",
            "item_smoke_of_deceit", "item_faerie_fire", "item_branches", "item_courier", "item_blood_grenade",
            "item_famango", "item_great_famango", "item_greater_famango", "item_bottle_refill");

    private static void inc(Map<String, Long> m, String k, long v) {
        if (k != null) m.merge(k, v, Long::sum);
    }

    private static void max(Map<String, Long> m, String k, long v) {
        if (k != null) m.merge(k, v, Math::max);
    }

    @OnCombatLogEntry
    public void onCombatLog(Context ctx, CombatLogEntry e) {
        try {
            DOTA_COMBATLOG_TYPES type = e.getType();
            String attacker = e.getAttackerName();
            String target = e.getTargetName();
            boolean heroAttacker = e.isAttackerHero() && !e.isAttackerIllusion();
            boolean heroTarget = e.isTargetHero() && !e.isTargetIllusion();
            long v = Math.max(0, e.getValue());
            switch (type) {
                case DOTA_COMBATLOG_DAMAGE -> {
                    if (heroTarget) inc(damageTaken, target, v);
                    if (!heroAttacker) return;
                    if (heroTarget) inc(heroDamage, attacker, v);
                    else if (target != null && isBuilding(target)) inc(towerDamage, attacker, v);
                }
                case DOTA_COMBATLOG_HEAL -> {
                    if (heroAttacker && heroTarget && attacker != null && !attacker.equals(target)) inc(healing, attacker, v);
                }
                case DOTA_COMBATLOG_DEATH -> {
                    if (target == null) return;
                    if (heroTarget) {
                        killTimes.add(new float[]{e.getTimestamp()});
                        killNames.add(new String[]{heroAttacker ? attacker : null, target});
                    }
                    if (!heroAttacker) return;
                    if (target.contains("observer_wards")) inc(obsKilled, attacker, 1);
                    else if (target.contains("sentry_wards")) inc(senKilled, attacker, 1);
                    else if (target.contains("_tower")) inc(towerKills, attacker, 1);
                    else if (target.contains("roshan")) inc(roshanKills, attacker, 1);
                }
                case DOTA_COMBATLOG_ITEM -> {
                    String item = e.getInflictorName();
                    if (!heroAttacker || item == null) return;
                    if (item.equals("item_ward_observer")) inc(obsPlacedLog, attacker, 1);
                    else if (item.equals("item_ward_sentry")) inc(senPlacedLog, attacker, 1);
                }
                case DOTA_COMBATLOG_PURCHASE -> {
                    String item = e.getValueName();
                    if (target == null || item == null || CHEAP_ITEMS.contains(item) || item.startsWith("item_recipe")) return;
                    purchases.computeIfAbsent(target, k -> new ArrayList<>())
                            .add(e.getTimestamp() + "|" + item);
                }
                case DOTA_COMBATLOG_BUYBACK -> buybacks.merge(e.getValue(), 1L, Long::sum);
                case DOTA_COMBATLOG_MULTIKILL -> { if (heroAttacker) max(maxMultiKill, attacker, v); }
                case DOTA_COMBATLOG_KILLSTREAK -> { if (heroAttacker) max(maxKillStreak, attacker, v); }
                case DOTA_COMBATLOG_PICKUP_RUNE -> { if (heroAttacker) inc(runesLog, attacker, 1); }
                case DOTA_COMBATLOG_NEUTRAL_CAMP_STACK -> { if (heroAttacker) inc(campsStackedLog, attacker, 1); }
                default -> { }
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
        try {
            Entities entities = ctx.getProcessor(Entities.class);
            if (entities == null) return;
            Entity rules = entities.getByDtName("CDOTAGamerulesProxy");
            if (rules == null) return;
            if (!draftDone) readDraft(rules);
            sampleTimeline(entities, rules);
        } catch (Exception ignored) { }
    }

    private void readDraft(Entity rules) {
        Integer state = num(rules, "m_pGameRules.m_nGameState");
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
        // 5+ = подготовка/игра: драфт закончен
        if (state != null && state >= 5) draftDone = true;
    }

    /** Раз в игровую минуту: нетворс и опыт каждого игрока (для графика преимущества) */
    private void sampleTimeline(Entities entities, Entity rules) {
        Float gameTime = flt(rules, "m_pGameRules.m_fGameTime");
        Float start = flt(rules, "m_pGameRules.m_flGameStartTime");
        if (gameTime == null || start == null || start <= 0) return;
        float t = gameTime - start;
        if (t < nextMinute * 60f) return;
        Entity pr = entities.getByDtName("CDOTA_PlayerResource");
        Entity radiant = entities.getByDtName("CDOTA_DataRadiant");
        Entity dire = entities.getByDtName("CDOTA_DataDire");
        if (pr == null) return;
        int ri = 0, di = 0;
        for (int i = 0; i < 24; i++) {
            Integer team = num(pr, idx("m_vecPlayerData.%i.m_iPlayerTeam", i));
            if (team == null || (team != 2 && team != 3)) continue;
            int slot = team == 2 ? ri++ : di++;
            String d = "m_vecDataTeam." + String.format(Locale.ROOT, "%04d", slot) + ".";
            Entity data = team == 2 ? radiant : dire;
            Integer nw = num(data, d + "m_iNetWorth");
            Integer xp = num(data, d + "m_iTotalEarnedXP");
            fill(nwTimeline, i, nextMinute, nw);
            fill(xpTimeline, i, nextMinute, xp);
        }
        nextMinute++;
    }

    private static void fill(Map<Integer, List<Integer>> m, int player, int minute, Integer v) {
        List<Integer> list = m.computeIfAbsent(player, k -> new ArrayList<>());
        while (list.size() < minute) list.add(list.isEmpty() ? 0 : list.get(list.size() - 1));
        list.add(v == null ? (list.isEmpty() ? 0 : list.get(list.size() - 1)) : v);
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
            tmp = unpackIfCompressed(tmp);
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

    /**
     * Демки с CDN Valve / OpenDota / Dotabuff приходят сжатыми (.dem.bz2, иногда .gz).
     * Распознаём по сигнатуре и распаковываем во временный файл; обычный .dem возвращаем как есть.
     */
    static Path unpackIfCompressed(Path file) throws Exception {
        byte[] head = new byte[3];
        try (InputStream in = Files.newInputStream(file)) {
            if (in.read(head) < 3) return file;
        }
        boolean bz2 = head[0] == 'B' && head[1] == 'Z' && head[2] == 'h';
        boolean gz = (head[0] & 0xff) == 0x1f && (head[1] & 0xff) == 0x8b;
        if (!bz2 && !gz) return file;
        Path out = Files.createTempFile("startplus-unpacked-", ".dem");
        try (InputStream raw = new java.io.BufferedInputStream(Files.newInputStream(file), 1 << 20);
             InputStream in = bz2
                     ? new org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream(raw, true)
                     : new java.util.zip.GZIPInputStream(raw, 1 << 16)) {
            Files.copy(in, out, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.deleteIfExists(file);
        return out;
    }

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
            Number stuns = anyNum(data, d + "m_fStuns");
            Integer campsStacked = num(data, d + "m_iCampsStacked");
            Integer runePickups = num(data, d + "m_iRunePickups");
            Integer obsPlaced = num(data, d + "m_iObserverWardsPlaced");
            Integer senPlaced = num(data, d + "m_iSentryWardsPlaced");
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
                    .put("damageTaken", pick(this.damageTaken, heroUnit, null))
                    .put("stuns", stuns != null ? Math.round(stuns.doubleValue() * 10) / 10.0 : null)
                    .put("campsStacked", campsStacked != null ? campsStacked : pick(this.campsStackedLog, heroUnit, null))
                    .put("runePickups", runePickups != null ? runePickups : pick(this.runesLog, heroUnit, null))
                    .put("obsPlaced", obsPlaced != null ? obsPlaced : pick(this.obsPlacedLog, heroUnit, 0))
                    .put("senPlaced", senPlaced != null ? senPlaced : pick(this.senPlacedLog, heroUnit, 0))
                    .put("obsKilled", pick(this.obsKilled, heroUnit, 0))
                    .put("senKilled", pick(this.senKilled, heroUnit, 0))
                    .put("towerKills", pick(this.towerKills, heroUnit, 0))
                    .put("roshanKills", pick(this.roshanKills, heroUnit, 0))
                    .put("buybacks", buybacks.getOrDefault(i, 0L))
                    .put("maxMultiKill", pick(this.maxMultiKill, heroUnit, 0))
                    .put("maxKillStreak", pick(this.maxKillStreak, heroUnit, 0))
                    .putRaw("purchases", purchasesJson(heroUnit, startTime))
                    .putRaw("nwTimeline", intArr(nwTimeline.get(i)))
                    .putRaw("xpTimeline", intArr(xpTimeline.get(i)))
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
                .putRaw("kills", killsJson(startTime))
                .toString();
    }

    private String purchasesJson(String unit, Float start) {
        List<String> list = unit != null ? purchases.get(unit) : null;
        if (list == null) return "[]";
        List<String> out = new ArrayList<>();
        for (String raw : list) {
            int bar = raw.indexOf('|');
            float t = Float.parseFloat(raw.substring(0, bar));
            int sec = Math.round(t - (start != null ? start : 0f));
            out.add(new Json().put("t", sec).put("item", raw.substring(bar + 1)).toString());
        }
        return "[" + String.join(",", out) + "]";
    }

    private String killsJson(Float start) {
        List<String> out = new ArrayList<>();
        for (int k = 0; k < killTimes.size(); k++) {
            int sec = Math.round(killTimes.get(k)[0] - (start != null ? start : 0f));
            out.add(new Json().put("t", sec).put("killer", killNames.get(k)[0]).put("victim", killNames.get(k)[1]).toString());
        }
        return "[" + String.join(",", out) + "]";
    }

    private static String intArr(List<Integer> values) {
        if (values == null) return "[]";
        StringBuilder b = new StringBuilder("[");
        for (int k = 0; k < values.size(); k++) {
            if (k > 0) b.append(',');
            b.append(values.get(k));
        }
        return b.append(']').toString();
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
