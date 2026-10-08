-- =====================================================================
-- СТАРТ+ (v1.02) — выгрузка статистики для ИАР (глава 3, раздел 3.4)
-- PostgreSQL на сервере платформы (база startplus). Только чтение: запросы ничего не меняют.
--
-- Что нового в v1.02: посещаемость занятий (запросы 12–13), дневник прогресса
-- (запросы 14–15), а также соответствующие строки в сводке (1), очках (7),
-- динамике (8) и показателях по ученикам (9).
--
-- Что нового было в v1.01 по сравнению с первой версией файла:
--   • оценка силы 0–100 (PeerRating.score) вместо микро/макро 1–10;
--   • тильт (STABLE / UNSURE / TILT) вместо «вайба»; старые голоса
--     «вайба» (LIKE / NEUTRAL / DISLIKE) считаются отдельно;
--   • голос тренера (роль ADMIN) отделён от голосов учеников;
--   • MVP игрового дня, вторая игра дня, коэффициенты за роли.
--
-- Как запускать (весь файл целиком, на сервере):
--   scp platform_stats_v1.02.sql root@<IP-сервера>:/tmp/
--   ssh root@<IP-сервера> "sudo -u postgres psql -d startplus -f /tmp/platform_stats_v1.02.sql -o /tmp/results.txt"
--   scp root@<IP-сервера>:/tmp/results.txt .
--   → прислать results.txt в чат.
--
-- В результатах нет имён: ученики обезличены («Ученик 1, 2, …»,
-- нумерация одинаковая в запросах 9 и 11).
-- Тестовый ученик из seed-скрипта (логин «1») исключён. Если есть
-- другие тестовые аккаунты — допиши в строку WITH st AS (...)
-- условие AND u.id NOT IN ('id1','id2').
--
-- Файл выполняется целиком; в results.txt будут результаты всех 15 запросов,
-- каждый под своим заголовком (=== N. ... ===). Файл рассчитан на запуск через psql.
-- =====================================================================


\qecho '=== 1. СВОДКА ПОКАЗАТЕЛЕЙ ==='
-- 1. СВОДКА ПОКАЗАТЕЛЕЙ
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
adm AS (SELECT u.id FROM "User" u WHERE u.role = 'ADMIN'),
n AS (SELECT count(*)::numeric AS n FROM st),
hw AS (
  SELECT a.id, a.status, a.deadline, a."revisionDeadline", a."createdAt",
         s.id AS sub_id, s."submittedAt", s.excellent
  FROM "HomeworkAssignment" a
  LEFT JOIN "HomeworkSubmission" s ON s."assignmentId" = a.id
  WHERE a."studentId" IN (SELECT id FROM st)
),
views_per AS (
  SELECT st.id, count(v.id) AS c
  FROM st LEFT JOIN "MaterialView" v ON v."userId" = st.id
  GROUP BY st.id
),
games_per AS (
  SELECT st.id, count(p.id) AS c
  FROM st LEFT JOIN "MatchParticipant" p ON p."userId" = st.id
  GROUP BY st.id
),
mvp_sessions AS (
  SELECT ms.id, ms."mvpWinnerId",
         (SELECT count(DISTINCT p."userId") FROM "MatchParticipant" p
            JOIN "MatchGame" g ON g.id = p."gameId" WHERE g."sessionId" = ms.id) AS players,
         (SELECT count(*) FROM "MatchDayMvpVote" v WHERE v."sessionId" = ms.id) AS votes
  FROM "MatchSession" ms
  WHERE ms."mvpResolved"
)
SELECT * FROM (
  SELECT 1 AS "№", 'Выборка' AS "раздел", 'Учеников зарегистрировано' AS "показатель",
         (SELECT n::int::text FROM n) AS "значение"
  UNION ALL
  SELECT 2, 'Выборка', 'Период регистрации учеников',
         to_char(min(u."createdAt"), 'DD.MM.YYYY') || ' – ' || to_char(max(u."createdAt"), 'DD.MM.YYYY')
  FROM "User" u WHERE u.id IN (SELECT id FROM st)
  UNION ALL
  SELECT 3, 'Выборка', 'Подключили уведомления Telegram-бота',
         count(*) || ' (' || round(100 * count(*) / NULLIF((SELECT n FROM n), 0), 1) || '%)'
  FROM "User" u WHERE u.id IN (SELECT id FROM st) AND u."telegramChatId" IS NOT NULL
  UNION ALL
  SELECT 4, 'Выборка', 'Привязали Steam (ранг из OpenDota)',
         count(*) || ' (' || round(100 * count(*) / NULLIF((SELECT n FROM n), 0), 1) || '%)'
  FROM "PlayerProfile" p WHERE p."userId" IN (SELECT id FROM st) AND p."steamAccountId" IS NOT NULL

  -- ---------- Домашние задания ----------
  UNION ALL
  SELECT 10, 'Домашние задания', 'Разных заданий создано',
         count(DISTINCT a."homeworkId")::text
  FROM "HomeworkAssignment" a WHERE a."studentId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 11, 'Домашние задания', 'Выдано назначений (задание × ученик)', count(*)::text FROM hw
  UNION ALL
  SELECT 12, 'Домашние задания', 'Сдано (есть ответ)',
         count(sub_id) || ' из ' || count(*) || ' (' || round(100.0 * count(sub_id) / NULLIF(count(*), 0), 1) || '%)'
  FROM hw
  UNION ALL
  SELECT 13, 'Домашние задания', 'Принято тренером',
         count(*) FILTER (WHERE status = 'GRADED') || ' (' ||
         round(100.0 * count(*) FILTER (WHERE status = 'GRADED') / NULLIF(count(*), 0), 1) || '% от выданных)'
  FROM hw
  UNION ALL
  SELECT 14, 'Домашние задания', 'Из принятых — «очень хорошо»',
         count(*) FILTER (WHERE status = 'GRADED' AND excellent) || ' (' ||
         round(100.0 * count(*) FILTER (WHERE status = 'GRADED' AND excellent)
               / NULLIF(count(*) FILTER (WHERE status = 'GRADED'), 0), 1) || '% от принятых)'
  FROM hw
  UNION ALL
  SELECT 15, 'Домашние задания', 'Отправлялись на доработку',
         count(*) FILTER (WHERE "revisionDeadline" IS NOT NULL) || ' (' ||
         round(100.0 * count(*) FILTER (WHERE "revisionDeadline" IS NOT NULL) / NULLIF(count(sub_id), 0), 1) || '% от сданных)'
  FROM hw
  UNION ALL
  SELECT 16, 'Домашние задания', 'Сдано до исходного дедлайна (работы без доработки)',
         count(*) FILTER (WHERE sub_id IS NOT NULL AND "revisionDeadline" IS NULL AND "submittedAt" <= deadline) || ' из ' ||
         count(*) FILTER (WHERE sub_id IS NOT NULL AND "revisionDeadline" IS NULL) || ' (' ||
         round(100.0 * count(*) FILTER (WHERE sub_id IS NOT NULL AND "revisionDeadline" IS NULL AND "submittedAt" <= deadline)
               / NULLIF(count(*) FILTER (WHERE sub_id IS NOT NULL AND "revisionDeadline" IS NULL), 0), 1) || '%)'
  FROM hw
  UNION ALL
  SELECT 17, 'Домашние задания', 'Штрафов за просрочку начислено',
         count(*)::text
  FROM "PointLog" l WHERE l."userId" IN (SELECT id FROM st) AND l.reason LIKE '%не сдана к дедлайну%'
  UNION ALL
  SELECT 18, 'Домашние задания', 'Сейчас в статусе «просрочено» (не сдано)',
         count(*) FILTER (WHERE status = 'OVERDUE')::text
  FROM hw
  UNION ALL
  SELECT 19, 'Домашние задания', 'Среднее время от выдачи до сдачи, дней (без доработок)',
         round((avg(EXTRACT(EPOCH FROM ("submittedAt" - "createdAt"))) / 86400)::numeric, 1)::text
  FROM hw WHERE sub_id IS NOT NULL AND "revisionDeadline" IS NULL

  -- ---------- Учебные материалы ----------
  UNION ALL
  SELECT 20, 'Материалы', 'Материалов опубликовано (видео / трансляции / статьи)',
         count(*) || ' (' || count(*) FILTER (WHERE type = 'VIDEO') || ' / ' ||
         count(*) FILTER (WHERE type = 'STREAM') || ' / ' || count(*) FILTER (WHERE type = 'ARTICLE') || ')'
  FROM "LearningMaterial"
  UNION ALL
  SELECT 21, 'Материалы', 'Просмотров учениками всего', sum(c)::text FROM views_per
  UNION ALL
  SELECT 22, 'Материалы', 'Учеников, открывших хотя бы один материал',
         count(*) FILTER (WHERE c > 0) || ' (' || round(100.0 * count(*) FILTER (WHERE c > 0) / NULLIF(count(*), 0), 1) || '%)'
  FROM views_per
  UNION ALL
  SELECT 23, 'Материалы', 'Просмотров на ученика: среднее / медиана / максимум',
         round(avg(c), 1) || ' / ' || percentile_cont(0.5) WITHIN GROUP (ORDER BY c) || ' / ' || max(c)
  FROM views_per

  -- ---------- Игры 5×5 ----------
  UNION ALL
  SELECT 30, 'Игры 5×5', 'Игровых дней (сессий): всего / завершено / с записью через бота',
         count(*) || ' / ' || count(*) FILTER (WHERE status = 'COMPLETED') || ' / ' ||
         count(*) FILTER (WHERE mode = 'OPEN_SIGNUP')
  FROM "MatchSession"
  UNION ALL
  SELECT 31, 'Игры 5×5', 'Сыграно игр / в среднем игр за игровой день',
         count(*) || ' / ' || round(count(*)::numeric / NULLIF(count(DISTINCT "sessionId"), 0), 1)
  FROM "MatchGame"
  UNION ALL
  SELECT 32, 'Игры 5×5', 'Итоги игр: победа первой команды / второй / ничья',
         count(*) FILTER (WHERE "winnerTeam" = 'RADIANT') || ' / ' ||
         count(*) FILTER (WHERE "winnerTeam" = 'DIRE') || ' / ' ||
         count(*) FILTER (WHERE "winnerTeam" = 'DRAW')
  FROM "MatchGame"
  UNION ALL
  SELECT 33, 'Игры 5×5', 'Учеников, сыгравших хотя бы одну игру',
         count(*) FILTER (WHERE c > 0) || ' (' || round(100.0 * count(*) FILTER (WHERE c > 0) / NULLIF(count(*), 0), 1) || '%)'
  FROM games_per
  UNION ALL
  SELECT 34, 'Игры 5×5', 'Игр на ученика: среднее / медиана / максимум',
         round(avg(c), 1) || ' / ' || percentile_cont(0.5) WITHIN GROUP (ORDER BY c) || ' / ' || max(c)
  FROM games_per
  UNION ALL
  SELECT 35, 'Игры 5×5', 'Игр, выигранных «апсетом» (команда слабее по средней силе)',
         count(DISTINCT l."sourceId")::text
  FROM "PointLog" l
  WHERE l.reason LIKE '%апсет%' AND l."sourceId" IN (SELECT id FROM "MatchGame")  -- без отменённых игр
  UNION ALL
  SELECT 36, 'Игры 5×5', 'Побед на 2-й роли / на 3-й роли / не на своей роли',
         count(*) FILTER (WHERE l.reason LIKE '%2-я роль%') || ' / ' ||
         count(*) FILTER (WHERE l.reason LIKE '%3-я роль%') || ' / ' ||
         count(*) FILTER (WHERE l.reason LIKE '%не на своей роли%')
  FROM "PointLog" l
  WHERE l."userId" IN (SELECT id FROM st) AND l."sourceId" IN (SELECT id FROM "MatchGame")
  UNION ALL
  SELECT 37, 'Игры 5×5', 'Вторых побед подряд за игровой день',
         count(*)::text
  FROM "PointLog" l
  WHERE l."userId" IN (SELECT id FROM st) AND l.reason LIKE '%2 победы подряд%'
    AND l."sourceId" IN (SELECT id FROM "MatchGame")
  UNION ALL
  SELECT 38, 'Игры 5×5', 'Приглашений через бота: всего / ответили',
         count(*) || ' / ' || count(*) FILTER (WHERE "respondedAt" IS NOT NULL) || ' (' ||
         round(100.0 * count(*) FILTER (WHERE "respondedAt" IS NOT NULL) / NULLIF(count(*), 0), 1) || '%)'
  FROM "MatchRsvp" r WHERE r."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 39, 'Игры 5×5', 'Ответы: записался / очередь / отказ / снят',
         count(*) FILTER (WHERE status = 'JOINED') || ' / ' || count(*) FILTER (WHERE status = 'QUEUED') || ' / ' ||
         count(*) FILTER (WHERE status = 'DECLINED') || ' / ' || count(*) FILTER (WHERE status = 'REMOVED')
  FROM "MatchRsvp" r WHERE r."userId" IN (SELECT id FROM st)

  -- ---------- Оценка силы и тильта ----------
  UNION ALL
  SELECT 40, 'Сила и тильт', 'Сезонов голосования: открыто / закрыто',
         count(*) FILTER (WHERE status = 'OPEN') || ' / ' || count(*) FILTER (WHERE status = 'CLOSED')
  FROM "RatingSeason"
  UNION ALL
  SELECT 41, 'Сила и тильт', 'Оценок силы (0–100): от учеников / от тренера',
         count(*) FILTER (WHERE r."raterId" IN (SELECT id FROM st)) || ' / ' ||
         count(*) FILTER (WHERE r."raterId" IN (SELECT id FROM adm))
  FROM "PeerRating" r
  UNION ALL
  SELECT 42, 'Сила и тильт', 'Оценок тильта: от учеников / от тренера',
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM st) AND v.value IN ('STABLE', 'UNSURE', 'TILT')) || ' / ' ||
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM adm) AND v.value IN ('STABLE', 'UNSURE', 'TILT'))
  FROM "VibeVote" v
  UNION ALL
  SELECT 43, 'Сила и тильт', 'Тильт по оценкам учеников: не подвержен / затрудняюсь / подвержен',
         count(*) FILTER (WHERE v.value = 'STABLE') || ' / ' || count(*) FILTER (WHERE v.value = 'UNSURE') || ' / ' ||
         count(*) FILTER (WHERE v.value = 'TILT')
  FROM "VibeVote" v WHERE v."voterId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 44, 'Сила и тильт', 'Старых голосов «вайба» (до v1.01), если остались',
         count(*)::text
  FROM "VibeVote" v WHERE v.value IN ('LIKE', 'NEUTRAL', 'DISLIKE')
  UNION ALL
  SELECT 45, 'Сила и тильт', 'Учеников с поправкой за тильт < 0 / = 0 / > 0',
         count(*) FILTER (WHERE p."vibeMod" < 0) || ' / ' || count(*) FILTER (WHERE p."vibeMod" = 0) || ' / ' ||
         count(*) FILTER (WHERE p."vibeMod" > 0)
  FROM "PlayerProfile" p WHERE p."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 46, 'Сила и тильт', 'Надбавка за уровень (0…30): среднее / медиана',
         round(avg(p."skillMod"), 1) || ' / ' || percentile_cont(0.5) WITHIN GROUP (ORDER BY p."skillMod")
  FROM "PlayerProfile" p WHERE p."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 47, 'Сила и тильт', 'Итоговая сила учеников: мин / среднее / медиана / макс',
         min(p."finalRating") || ' / ' || round(avg(p."finalRating"), 1) || ' / ' ||
         percentile_cont(0.5) WITHIN GROUP (ORDER BY p."finalRating") || ' / ' || max(p."finalRating")
  FROM "PlayerProfile" p WHERE p."userId" IN (SELECT id FROM st)

  -- ---------- MVP игрового дня ----------
  UNION ALL
  SELECT 50, 'MVP', 'Игровых дней с подведённым MVP / из них без победителя (равенство голосов)',
         count(*) || ' / ' || count(*) FILTER (WHERE "mvpWinnerId" IS NULL)
  FROM mvp_sessions
  UNION ALL
  SELECT 51, 'MVP', 'Голосов за MVP / доля проголосовавших участников',
         coalesce(sum(votes), 0) || ' (' || coalesce(round(100.0 * sum(votes) / NULLIF(sum(players), 0), 1), 0) || '%)'
  FROM mvp_sessions
  UNION ALL
  SELECT 52, 'MVP', 'Разных учеников, становившихся MVP',
         count(DISTINCT "mvpWinnerId")::text
  FROM mvp_sessions WHERE "mvpWinnerId" IN (SELECT id FROM st)

  -- ---------- Посещаемость занятий ----------
  UNION ALL
  SELECT 55, 'Посещаемость', 'Занятий в журнале / отметок присутствия',
         (SELECT count(*) FROM "LessonSession") || ' / ' ||
         (SELECT count(*) FROM "LessonAttendance" a WHERE a.present AND a."userId" IN (SELECT id FROM st))
  UNION ALL
  SELECT 56, 'Посещаемость', 'Средняя посещаемость занятия, % от числа учеников',
         coalesce(round(avg(100.0 * x.cnt / NULLIF((SELECT n FROM n), 0)), 1)::text, '—')
  FROM (SELECT ls.id, (SELECT count(*) FROM "LessonAttendance" a
                       WHERE a."sessionId" = ls.id AND a.present AND a."userId" IN (SELECT id FROM st)) AS cnt
        FROM "LessonSession" ls) x
  UNION ALL
  SELECT 57, 'Посещаемость', 'Учеников, посетивших хотя бы одно занятие',
         count(DISTINCT a."userId") || ' (' || round(100.0 * count(DISTINCT a."userId") / NULLIF((SELECT n FROM n), 0), 1) || '%)'
  FROM "LessonAttendance" a WHERE a.present AND a."userId" IN (SELECT id FROM st)

  -- ---------- Дневник прогресса ----------
  UNION ALL
  SELECT 58, 'Дневник прогресса', 'Учеников, сделавших хотя бы одну запись',
         count(DISTINCT g."userId") || ' (' || round(100.0 * count(DISTINCT g."userId") / NULLIF((SELECT n FROM n), 0), 1) || '%)'
  FROM "ProgressLog" g WHERE g."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 59, 'Дневник прогресса', 'Записей всего / в среднем на пишущего ученика',
         count(*) || ' / ' || coalesce(round(count(*)::numeric / NULLIF(count(DISTINCT g."userId"), 0), 1)::text, '—')
  FROM "ProgressLog" g WHERE g."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 60, 'Дневник прогресса', 'Отмечено сыгранных игр / разобранных реплеев',
         coalesce(sum(g."gamesPlayed"), 0) || ' / ' || coalesce(sum(g."replaysWatched"), 0)
  FROM "ProgressLog" g WHERE g."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 61, 'Дневник прогресса', 'Записей с заметками или выводами',
         count(*) FILTER (WHERE length(trim(g."replayNotes")) > 0 OR length(trim(g.takeaways)) > 0) || ' (' ||
         round(100.0 * count(*) FILTER (WHERE length(trim(g."replayNotes")) > 0 OR length(trim(g.takeaways)) > 0)
               / NULLIF(count(*), 0), 1) || '%)'
  FROM "ProgressLog" g WHERE g."userId" IN (SELECT id FROM st)

  -- ---------- Очки и коммуникация ----------
  UNION ALL
  SELECT 70, 'Очки платформы', 'Записей в журнале очков / начислено / списано',
         count(*) || ' / +' || round(coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::numeric, 1) || ' / ' ||
         round(coalesce(sum(delta) FILTER (WHERE delta < 0), 0)::numeric, 1)
  FROM "PointLog" l WHERE l."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 71, 'Коммуникация', 'Сообщений в чате платформы: всего / от учеников',
         count(*) || ' / ' || count(*) FILTER (WHERE m."senderId" IN (SELECT id FROM st))
  FROM "Message" m
  UNION ALL
  SELECT 72, 'Коммуникация', 'Учеников, писавших в чат',
         count(DISTINCT m."senderId")::text
  FROM "Message" m WHERE m."senderId" IN (SELECT id FROM st)
) t
ORDER BY "№";


\qecho '=== 2. ДОМАШНИЕ ЗАДАНИЯ ПО ОЧЕРЕДИ ВЫДАЧИ (динамика выполнения) ==='
-- 2. ДОМАШНИЕ ЗАДАНИЯ ПО ОЧЕРЕДИ ВЫДАЧИ (динамика выполнения)
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1')
SELECT row_number() OVER (ORDER BY h."createdAt") AS "№",
       h.title AS "задание",
       to_char(h."createdAt", 'DD.MM.YYYY') AS "выдано",
       count(a.id) AS "назначено",
       count(s.id) AS "сдано",
       round(100.0 * count(s.id) / NULLIF(count(a.id), 0), 1) AS "% сдано",
       count(*) FILTER (WHERE s.id IS NOT NULL AND a."revisionDeadline" IS NULL AND s."submittedAt" <= a.deadline) AS "в срок (без доработки)",
       count(*) FILTER (WHERE a."revisionDeadline" IS NOT NULL) AS "на доработку",
       count(*) FILTER (WHERE a.status = 'GRADED') AS "принято",
       count(*) FILTER (WHERE a.status = 'GRADED' AND s.excellent) AS "«очень хорошо»",
       count(*) FILTER (WHERE a.status = 'OVERDUE') AS "не сдано после дедлайна"
FROM "Homework" h
JOIN "HomeworkAssignment" a ON a."homeworkId" = h.id AND a."studentId" IN (SELECT id FROM st)
LEFT JOIN "HomeworkSubmission" s ON s."assignmentId" = a.id
GROUP BY h.id, h.title, h."createdAt"
ORDER BY h."createdAt";


\qecho '=== 3. МАТЕРИАЛЫ: ОХВАТ ПО ТИПАМ ==='
-- 3. МАТЕРИАЛЫ: ОХВАТ ПО ТИПАМ
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
n AS (SELECT count(*)::numeric AS n FROM st)
SELECT CASE m.type WHEN 'VIDEO' THEN 'Видео' WHEN 'STREAM' THEN 'Трансляции' ELSE 'Статьи' END AS "тип",
       count(DISTINCT m.id) AS "материалов",
       count(v.id) AS "просмотров",
       round(count(v.id)::numeric / NULLIF(count(DISTINCT m.id), 0), 1) AS "просмотров на материал",
       count(DISTINCT v."userId") AS "учеников открывали",
       round(100.0 * count(DISTINCT v."userId") / NULLIF((SELECT n FROM n), 0), 1) AS "% учеников"
FROM "LearningMaterial" m
LEFT JOIN "MaterialView" v ON v."materialId" = m.id AND v."userId" IN (SELECT id FROM st)
GROUP BY m.type
ORDER BY 3 DESC;


\qecho '=== 4. МАТЕРИАЛЫ: ТОП-10 ПО ПРОСМОТРАМ ==='
-- 4. МАТЕРИАЛЫ: ТОП-10 ПО ПРОСМОТРАМ
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
n AS (SELECT count(*)::numeric AS n FROM st)
SELECT m.title AS "материал",
       CASE m.type WHEN 'VIDEO' THEN 'Видео' WHEN 'STREAM' THEN 'Трансляция' ELSE 'Статья' END AS "тип",
       to_char(m."createdAt", 'DD.MM.YYYY') AS "опубликован",
       count(v.id) AS "просмотров",
       round(100.0 * count(v.id) / NULLIF((SELECT n FROM n), 0), 1) AS "% учеников"
FROM "LearningMaterial" m
LEFT JOIN "MaterialView" v ON v."materialId" = m.id AND v."userId" IN (SELECT id FROM st)
GROUP BY m.id, m.title, m.type, m."createdAt"
ORDER BY count(v.id) DESC, m."createdAt"
LIMIT 10;


\qecho '=== 5. БАЛАНС КОМАНД ПО КАЖДОЙ ИГРЕ 5×5 ==='
-- 5. БАЛАНС КОМАНД ПО КАЖДОЙ ИГРЕ 5×5
-- Важно: платформа не хранит силу на момент игры, поэтому суммы
-- считаются по ТЕКУЩЕЙ силе участников. В тексте это оговорим.
WITH g AS (
  SELECT mg.id, ms.date, mg."gameNumber", mg."winnerTeam", ms.mode,
         sum(pp."finalRating") FILTER (WHERE mp.team = 'RADIANT') AS radiant_sum,
         sum(pp."finalRating") FILTER (WHERE mp.team = 'DIRE') AS dire_sum,
         count(mp.id) AS players
  FROM "MatchGame" mg
  JOIN "MatchSession" ms ON ms.id = mg."sessionId"
  JOIN "MatchParticipant" mp ON mp."gameId" = mg.id
  LEFT JOIN "PlayerProfile" pp ON pp."userId" = mp."userId"
  GROUP BY mg.id, ms.date, mg."gameNumber", mg."winnerTeam", ms.mode
)
SELECT row_number() OVER (ORDER BY date, "gameNumber") AS "игра",
       to_char(date, 'DD.MM.YYYY') AS "дата",
       "gameNumber" AS "№ игры в дне",
       CASE mode WHEN 'OPEN_SIGNUP' THEN 'запись через бота' ELSE 'вручную' END AS "формирование",
       players AS "игроков",
       radiant_sum AS "Σ силы команды 1",
       dire_sum AS "Σ силы команды 2",
       abs(radiant_sum - dire_sum) AS "разница",
       round(100.0 * abs(radiant_sum - dire_sum) / NULLIF(greatest(radiant_sum, dire_sum), 0), 1) AS "разница, %",
       CASE "winnerTeam" WHEN 'RADIANT' THEN 'команда 1' WHEN 'DIRE' THEN 'команда 2' ELSE 'ничья' END AS "победитель",
       CASE WHEN "winnerTeam" = 'DRAW' THEN 'ничья'
            WHEN radiant_sum = dire_sum THEN 'силы равны'
            WHEN ("winnerTeam" = 'RADIANT') = (radiant_sum < dire_sum) THEN 'более слабая по сумме'
            ELSE 'более сильная по сумме' END AS "кто победил"
FROM g
ORDER BY 1;


\qecho '=== 6. ГОЛОСОВАНИЕ ПО СЕЗОНАМ: СИЛА И ТИЛЬТ (ученики и тренер раздельно) ==='
-- 6. ГОЛОСОВАНИЕ ПО СЕЗОНАМ: СИЛА И ТИЛЬТ (ученики и тренер раздельно)
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
adm AS (SELECT u.id FROM "User" u WHERE u.role = 'ADMIN'),
n AS (SELECT count(*)::numeric AS n FROM st)
SELECT CASE s.name WHEN 'AUTUMN' THEN 'Осень' WHEN 'WINTER' THEN 'Зима' ELSE 'Весна' END || ' ' || s.year AS "сезон",
       CASE s.status WHEN 'OPEN' THEN 'открыт' ELSE 'закрыт' END AS "статус",
       to_char(s."votingClosesAt", 'DD.MM.YYYY') AS "срок голосования",
       to_char(s."closesAt", 'DD.MM.YYYY') AS "конец сезона",
       sc.raters AS "оценивали силу (учеников)",
       round(100.0 * sc.raters / NULLIF((SELECT n FROM n), 0), 1) AS "% учеников",
       sc.peer_cnt AS "оценок силы от учеников",
       sc.peer_median AS "медиана оценок учеников",
       sc.trainer_cnt AS "оценок силы от тренера",
       sc.trainer_avg AS "средняя оценка тренера",
       tl.peer_cnt AS "оценок тильта от учеников",
       round(100.0 * tl.stable / NULLIF(tl.peer_cnt, 0), 1) AS "% «не подвержен»",
       round(100.0 * tl.unsure / NULLIF(tl.peer_cnt, 0), 1) AS "% «затрудняюсь»",
       round(100.0 * tl.tilt / NULLIF(tl.peer_cnt, 0), 1) AS "% «подвержен»",
       tl.trainer_cnt AS "оценок тильта от тренера",
       tl.trainer_tilt AS "из них «подвержен»",
       tl.legacy AS "старых голосов «вайба»"
FROM "RatingSeason" s
LEFT JOIN LATERAL (
  SELECT count(DISTINCT r."raterId") FILTER (WHERE r."raterId" IN (SELECT id FROM st)) AS raters,
         count(*) FILTER (WHERE r."raterId" IN (SELECT id FROM st)) AS peer_cnt,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY r.score) FILTER (WHERE r."raterId" IN (SELECT id FROM st)) AS peer_median,
         count(*) FILTER (WHERE r."raterId" IN (SELECT id FROM adm)) AS trainer_cnt,
         round(avg(r.score) FILTER (WHERE r."raterId" IN (SELECT id FROM adm)), 1) AS trainer_avg
  FROM "PeerRating" r
  WHERE r."seasonId" = s.id
) sc ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM st) AND v.value IN ('STABLE', 'UNSURE', 'TILT')) AS peer_cnt,
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM st) AND v.value = 'STABLE') AS stable,
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM st) AND v.value = 'UNSURE') AS unsure,
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM st) AND v.value = 'TILT') AS tilt,
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM adm) AND v.value IN ('STABLE', 'UNSURE', 'TILT')) AS trainer_cnt,
         count(*) FILTER (WHERE v."voterId" IN (SELECT id FROM adm) AND v.value = 'TILT') AS trainer_tilt,
         count(*) FILTER (WHERE v.value IN ('LIKE', 'NEUTRAL', 'DISLIKE')) AS legacy
  FROM "VibeVote" v
  WHERE v."seasonId" = s.id
) tl ON true
ORDER BY coalesce(s."openedAt", s."createdAt");


\qecho '=== 7. ОЧКИ ПЛАТФОРМЫ ПО КАТЕГОРИЯМ ==='
-- 7. ОЧКИ ПЛАТФОРМЫ ПО КАТЕГОРИЯМ
-- Как в points.ts, но MVP и посещение занятий вынесены в отдельные категории.
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
l AS (
  SELECT l.delta,
         CASE
           WHEN l.reason LIKE 'Штраф:%' THEN 'Штрафы'
           WHEN l.reason LIKE 'Бонус:%' THEN 'Бонусы'
           WHEN l.reason LIKE '%осещение занятия%' THEN 'Посещение занятий'
           WHEN l.reason LIKE '%омашка%' THEN 'Домашние задания'
           WHEN l.reason LIKE 'MVP%' THEN 'MVP игрового дня'
           WHEN l.reason LIKE '%5v5%' OR l.reason LIKE '%тмена игры%' THEN 'Игры 5×5'
           ELSE 'Прочее'
         END AS cat
  FROM "PointLog" l
  WHERE l."userId" IN (SELECT id FROM st)
)
SELECT cat AS "категория",
       count(*) AS "записей",
       round(coalesce(sum(delta) FILTER (WHERE delta > 0), 0)::numeric, 1) AS "начислено",
       round(coalesce(sum(delta) FILTER (WHERE delta < 0), 0)::numeric, 1) AS "списано",
       round(sum(delta)::numeric, 1) AS "итого",
       round((100.0 * coalesce(sum(delta) FILTER (WHERE delta > 0), 0)
             / NULLIF((SELECT sum(delta) FROM l WHERE delta > 0), 0))::numeric, 1) AS "% всех начислений"
FROM l
GROUP BY cat
ORDER BY sum(delta) DESC;


\qecho '=== 8. НЕДЕЛЬНАЯ ДИНАМИКА АКТИВНОСТИ (для графика в 3.4) ==='
-- 8. НЕДЕЛЬНАЯ ДИНАМИКА АКТИВНОСТИ (для графика в 3.4)
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
ev AS (
  SELECT 'hw' AS kind, s."studentId" AS uid, s."submittedAt" AS ts
  FROM "HomeworkSubmission" s WHERE s."studentId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'view', v."userId", v."viewedAt"
  FROM "MaterialView" v WHERE v."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'game', p."userId", g."createdAt"
  FROM "MatchParticipant" p JOIN "MatchGame" g ON g.id = p."gameId"
  WHERE p."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'rating', r."raterId", r."createdAt"
  FROM "PeerRating" r WHERE r."raterId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'tilt', v."voterId", v."createdAt"
  FROM "VibeVote" v WHERE v."voterId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'mvp', m."voterId", m."createdAt"
  FROM "MatchDayMvpVote" m WHERE m."voterId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'msg', m."senderId", m."createdAt"
  FROM "Message" m WHERE m."senderId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'att', a."userId", ls.date
  FROM "LessonAttendance" a JOIN "LessonSession" ls ON ls.id = a."sessionId"
  WHERE a.present AND a."userId" IN (SELECT id FROM st)
  UNION ALL
  SELECT 'diary', g."userId", g."createdAt"
  FROM "ProgressLog" g WHERE g."userId" IN (SELECT id FROM st)
),
w AS (
  -- время в базе хранится в UTC, переводим в московское
  SELECT kind, uid, date_trunc('week', (ts AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow') AS week
  FROM ev
  WHERE ts >= TIMESTAMP '2000-01-01'  -- чтобы взять только текущий учебный год, поставь '2026-09-01'
),
weeks AS (
  SELECT generate_series(min(week), max(week), interval '1 week') AS week FROM w
)
SELECT to_char(weeks.week, 'DD.MM.YYYY') AS "неделя с",
       count(DISTINCT w.uid) AS "активных учеников",
       count(w.kind) FILTER (WHERE w.kind = 'hw') AS "сдач ДЗ",
       count(w.kind) FILTER (WHERE w.kind = 'view') AS "просмотров материалов",
       count(w.kind) FILTER (WHERE w.kind = 'game') AS "участий в 5×5",
       count(w.kind) FILTER (WHERE w.kind = 'rating') AS "оценок силы",
       count(w.kind) FILTER (WHERE w.kind = 'tilt') AS "оценок тильта",
       count(w.kind) FILTER (WHERE w.kind = 'mvp') AS "голосов за MVP",
       count(w.kind) FILTER (WHERE w.kind = 'msg') AS "сообщений тренеру",
       count(w.kind) FILTER (WHERE w.kind = 'att') AS "посещений занятий",
       count(w.kind) FILTER (WHERE w.kind = 'diary') AS "записей в дневнике"
FROM weeks
LEFT JOIN w ON w.week = weeks.week
GROUP BY weeks.week
ORDER BY weeks.week;


\qecho '=== 9. ПОКАЗАТЕЛИ ПО УЧЕНИКАМ (обезличенно) ==='
-- 9. ПОКАЗАТЕЛИ ПО УЧЕНИКАМ (обезличенно)
WITH st AS (SELECT u.id, u."createdAt" FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
adm AS (SELECT u.id FROM "User" u WHERE u.role = 'ADMIN')
SELECT row_number() OVER (ORDER BY st."createdAt", st.id) AS "ученик",
       CASE pp."rankTier" / 10
         WHEN 1 THEN 'Рекрут' WHEN 2 THEN 'Страж' WHEN 3 THEN 'Рыцарь' WHEN 4 THEN 'Герой'
         WHEN 5 THEN 'Легенда' WHEN 6 THEN 'Властелин' WHEN 7 THEN 'Божество' WHEN 8 THEN 'Титан'
         ELSE '—' END AS "медаль",
       CASE pp."primaryRole"
         WHEN 'CARRY' THEN '1 — керри' WHEN 'MID' THEN '2 — мид' WHEN 'OFFLANE' THEN '3 — оффлейн'
         WHEN 'SUPPORT' THEN '4 — саппорт' WHEN 'HARD_SUPPORT' THEN '5 — хард-саппорт'
         ELSE '—' END AS "основная роль",
       pp."finalRating" AS "сила",
       pp."skillMod" AS "надбавка за уровень",
       pp."vibeMod" AS "поправка за тильт",
       sc.trainer_score AS "оценка тренера",
       sc.peer_median AS "медиана оценок учеников",
       CASE tl.trainer_tilt WHEN 'STABLE' THEN 'не подвержен' WHEN 'UNSURE' THEN 'затрудняется'
                            WHEN 'TILT' THEN 'подвержен' ELSE '—' END AS "тильт по мнению тренера",
       tl.peer_votes AS "оценок тильта от учеников",
       round(100.0 * tl.peer_tilt / NULLIF(tl.peer_votes, 0), 1) AS "% учеников: «подвержен»",
       hw.assigned AS "ДЗ выдано",
       hw.submitted AS "ДЗ сдано",
       hw.graded AS "ДЗ принято",
       vw.c AS "просмотров",
       gm.games AS "игр 5×5",
       gm.wins AS "побед",
       mv.times AS "раз MVP",
       at.visits AS "посещено занятий",
       dr.entries AS "записей в дневнике",
       round(coalesce(pl.total, 0)::numeric, 1) AS "очки за всё время"
FROM st
LEFT JOIN "PlayerProfile" pp ON pp."userId" = st.id
LEFT JOIN LATERAL (
  SELECT max(r.score) FILTER (WHERE r."raterId" IN (SELECT id FROM adm)) AS trainer_score,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY r.score) FILTER (WHERE r."raterId" NOT IN (SELECT id FROM adm)) AS peer_median
  FROM "PeerRating" r
  WHERE r."targetId" = st.id
    AND r."seasonId" = (SELECT rs.id FROM "RatingSeason" rs
                        ORDER BY (rs.status = 'OPEN') DESC, rs."isActive" DESC, coalesce(rs."openedAt", rs."createdAt") DESC
                        LIMIT 1)  -- текущий (последний) сезон голосования
) sc ON true
LEFT JOIN LATERAL (
  SELECT max(v.value::text) FILTER (WHERE v."voterId" IN (SELECT id FROM adm) AND v.value IN ('STABLE', 'UNSURE', 'TILT')) AS trainer_tilt,
         count(*) FILTER (WHERE v."voterId" NOT IN (SELECT id FROM adm) AND v.value IN ('STABLE', 'UNSURE', 'TILT')) AS peer_votes,
         count(*) FILTER (WHERE v."voterId" NOT IN (SELECT id FROM adm) AND v.value = 'TILT') AS peer_tilt
  FROM "VibeVote" v
  WHERE v."targetId" = st.id
    AND v."seasonId" = (SELECT rs.id FROM "RatingSeason" rs
                        ORDER BY (rs.status = 'OPEN') DESC, rs."isActive" DESC, coalesce(rs."openedAt", rs."createdAt") DESC
                        LIMIT 1)
) tl ON true
LEFT JOIN LATERAL (
  SELECT count(a.id) AS assigned, count(s.id) AS submitted,
         count(*) FILTER (WHERE a.status = 'GRADED') AS graded
  FROM "HomeworkAssignment" a
  LEFT JOIN "HomeworkSubmission" s ON s."assignmentId" = a.id
  WHERE a."studentId" = st.id
) hw ON true
LEFT JOIN LATERAL (SELECT count(*) AS c FROM "MaterialView" v WHERE v."userId" = st.id) vw ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS games, count(*) FILTER (WHERE p.won) AS wins
  FROM "MatchParticipant" p WHERE p."userId" = st.id
) gm ON true
LEFT JOIN LATERAL (SELECT count(*) AS times FROM "MatchSession" ms WHERE ms."mvpWinnerId" = st.id) mv ON true
LEFT JOIN LATERAL (SELECT count(*) AS visits FROM "LessonAttendance" a WHERE a."userId" = st.id AND a.present) at ON true
LEFT JOIN LATERAL (SELECT count(*) AS entries FROM "ProgressLog" g WHERE g."userId" = st.id) dr ON true
LEFT JOIN LATERAL (SELECT sum(l.delta) AS total FROM "PointLog" l WHERE l."userId" = st.id) pl ON true
ORDER BY 1;


\qecho '=== 10. ПРИЧИНЫ ШТРАФОВ И БОНУСОВ (без имён) ==='
-- 10. ПРИЧИНЫ ШТРАФОВ И БОНУСОВ (без имён)
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1')
SELECT CASE WHEN p.amount < 0 THEN 'Штраф' ELSE 'Бонус' END AS "тип",
       p.reason AS "причина",
       count(*) AS "раз",
       round(sum(p.amount)::numeric, 1) AS "сумма очков"
FROM "Penalty" p
WHERE p."targetId" IN (SELECT id FROM st)
GROUP BY 1, 2
ORDER BY 1, 3 DESC;


\qecho '=== 11. MVP ПО ИГРОВЫМ ДНЯМ (номера учеников — как в запросе 9) ==='
-- 11. MVP ПО ИГРОВЫМ ДНЯМ (номера учеников — как в запросе 9)
WITH nums AS (
  SELECT u.id, row_number() OVER (ORDER BY u."createdAt", u.id) AS num
  FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'
)
SELECT to_char(ms.date, 'DD.MM.YYYY') AS "игровой день",
       (SELECT count(*) FROM "MatchGame" g WHERE g."sessionId" = ms.id) AS "игр",
       (SELECT count(DISTINCT p."userId") FROM "MatchParticipant" p
          JOIN "MatchGame" g ON g.id = p."gameId" WHERE g."sessionId" = ms.id) AS "участников",
       (SELECT count(*) FROM "MatchDayMvpVote" v WHERE v."sessionId" = ms.id) AS "проголосовали",
       CASE WHEN NOT ms."mvpResolved" THEN 'голосование не подведено'
            WHEN ms."mvpWinnerId" IS NULL THEN 'равенство голосов — без MVP'
            ELSE 'MVP определён' END AS "итог",
       coalesce('Ученик ' || nums.num, '—') AS "MVP"
FROM "MatchSession" ms
LEFT JOIN nums ON nums.id = ms."mvpWinnerId"
WHERE EXISTS (SELECT 1 FROM "MatchGame" g WHERE g."sessionId" = ms.id)
ORDER BY ms.date;


\qecho '=== 12. ПОСЕЩАЕМОСТЬ ПО ЗАНЯТИЯМ ==='
-- 12. ПОСЕЩАЕМОСТЬ ПО ЗАНЯТИЯМ
-- Платформа хранит только отметки присутствия, поэтому доля считается
-- от общего числа зарегистрированных учеников.
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
n AS (SELECT count(*)::numeric AS n FROM st)
SELECT row_number() OVER (ORDER BY ls.date) AS "№",
       to_char((ls.date AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'DD.MM.YYYY') AS "дата занятия",
       count(a.id) AS "присутствовали",
       round(100.0 * count(a.id) / NULLIF((SELECT n FROM n), 0), 1) AS "% от числа учеников"
FROM "LessonSession" ls
LEFT JOIN "LessonAttendance" a ON a."sessionId" = ls.id AND a.present AND a."userId" IN (SELECT id FROM st)
GROUP BY ls.id, ls.date
ORDER BY ls.date;


\qecho '=== 13. ПОСЕЩАЕМОСТЬ ПО УЧЕНИКАМ (обезличенно, номера — как в запросе 9) ==='
-- 13. ПОСЕЩАЕМОСТЬ ПО УЧЕНИКАМ (обезличенно, номера — как в запросе 9)
WITH st AS (SELECT u.id, u."createdAt" FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1'),
total AS (SELECT count(*) AS t FROM "LessonSession")
SELECT row_number() OVER (ORDER BY st."createdAt", st.id) AS "ученик",
       (SELECT count(*) FROM "LessonAttendance" a WHERE a."userId" = st.id AND a.present) AS "посещено занятий",
       (SELECT t FROM total) AS "всего занятий",
       round(100.0 * (SELECT count(*) FROM "LessonAttendance" a WHERE a."userId" = st.id AND a.present)
             / NULLIF((SELECT t FROM total), 0), 1) AS "% посещаемости"
FROM st
ORDER BY 1;


\qecho '=== 14. ДНЕВНИК ПРОГРЕССА ПО УЧЕНИКАМ (обезличенно, номера — как в запросе 9) ==='
-- 14. ДНЕВНИК ПРОГРЕССА ПО УЧЕНИКАМ (обезличенно, номера — как в запросе 9)
WITH st AS (SELECT u.id, u."createdAt" FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1')
SELECT row_number() OVER (ORDER BY st."createdAt", st.id) AS "ученик",
       count(g.id) AS "записей",
       coalesce(sum(g."gamesPlayed"), 0) AS "игр отмечено",
       coalesce(sum(g."replaysWatched"), 0) AS "реплеев разобрано",
       count(g.id) FILTER (WHERE length(trim(g."replayNotes")) > 0 OR length(trim(g.takeaways)) > 0) AS "записей с выводами",
       to_char(min(g.date), 'DD.MM') AS "первая запись",
       to_char(max(g.date), 'DD.MM') AS "последняя запись"
FROM st
LEFT JOIN "ProgressLog" g ON g."userId" = st.id
GROUP BY st.id, st."createdAt"
ORDER BY 1;


\qecho '=== 15. ДНЕВНИК ПРОГРЕССА ПО ДНЯМ (вся группа) ==='
-- 15. ДНЕВНИК ПРОГРЕССА ПО ДНЯМ (вся группа)
WITH st AS (SELECT u.id FROM "User" u WHERE u.role = 'STUDENT' AND u.login IS DISTINCT FROM '1')
SELECT to_char(g.date, 'DD.MM.YYYY') AS "день",
       count(DISTINCT g."userId") AS "учеников сделали запись",
       sum(g."gamesPlayed") AS "игр отмечено",
       sum(g."replaysWatched") AS "реплеев разобрано",
       count(*) FILTER (WHERE length(trim(g."replayNotes")) > 0 OR length(trim(g.takeaways)) > 0) AS "записей с выводами"
FROM "ProgressLog" g
WHERE g."userId" IN (SELECT id FROM st)
GROUP BY g.date
ORDER BY g.date;
